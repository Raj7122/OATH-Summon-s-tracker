#!/usr/bin/env bash
# Shared configuration for migration scripts.
# Source this from every other script: `source "$(dirname "$0")/00-config.sh"`

set -euo pipefail

# --- Source account (Raj) ---
export SOURCE_PROFILE="Raj712"
export SOURCE_ACCOUNT_ID="568438992037"
export SOURCE_REGION="us-east-1"

export SOURCE_USER_POOL_ID="us-east-1_HXL5eyt3G"
export SOURCE_USER_POOL_CLIENT_ID="5u3iqbnppofude6c0jao41pl06"
export SOURCE_IDENTITY_POOL_ID="us-east-1:aac0e8b4-29f1-4a87-966c-c06b8d22adb9"
export SOURCE_GRAPHQL_API_ID="y3ftocckkvaqrn43xz6cn6vfgq"
export SOURCE_S3_BUCKET="oath-evidence-files-dev"
export SOURCE_DAILYSWEEP_FN="dailySweep-dev"
export SOURCE_DATAEXTRACTOR_FN="dataExtractor-dev"
export SOURCE_CRON_RULE="amplify-oathsummonstracker-dev-0fcf-CloudWatchEvent-tMKQS4BkZO6a"

# DynamoDB tables in source. Pattern: <Type>-<GraphQLAPIID>-<env>
export SOURCE_TABLE_CLIENT="Client-${SOURCE_GRAPHQL_API_ID}-dev"
export SOURCE_TABLE_SUMMONS="Summons-${SOURCE_GRAPHQL_API_ID}-dev"
export SOURCE_TABLE_SYNC_STATUS="SyncStatus-${SOURCE_GRAPHQL_API_ID}-dev"
export SOURCE_TABLE_INVOICE="Invoice-${SOURCE_GRAPHQL_API_ID}-dev"
export SOURCE_TABLE_INVOICE_SUMMONS="InvoiceSummons-${SOURCE_GRAPHQL_API_ID}-dev"

export SOURCE_TABLES=(
  "$SOURCE_TABLE_CLIENT"
  "$SOURCE_TABLE_SUMMONS"
  "$SOURCE_TABLE_SYNC_STATUS"
  "$SOURCE_TABLE_INVOICE"
  "$SOURCE_TABLE_INVOICE_SUMMONS"
)

# Logical type names (used for output filenames + target lookup)
export TABLE_TYPES=(
  "Client"
  "Summons"
  "SyncStatus"
  "Invoice"
  "InvoiceSummons"
)

# --- Target account (Arthur) ---
export TARGET_PROFILE="arthur"
export TARGET_REGION="us-east-1"
export TARGET_ENV_NAME="prod"

# Target-side values are discovered post-push and written to migration/.env.target
# by 05a-discover-target-tables.sh. Source it after running that script:
TARGET_ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.target"
if [[ -f "$TARGET_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$TARGET_ENV_FILE"
fi

# --- Workspace paths ---
MIGRATION_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MIGRATION_ROOT
export BACKUPS_DIR="$MIGRATION_ROOT/backups"
export DYNAMO_BACKUP_DIR="$BACKUPS_DIR/dynamodb"
export S3_BACKUP_DIR="$BACKUPS_DIR/s3"
export COGNITO_BACKUP_DIR="$BACKUPS_DIR/cognito"
export LAMBDA_BACKUP_DIR="$BACKUPS_DIR/lambda"

mkdir -p "$DYNAMO_BACKUP_DIR" "$S3_BACKUP_DIR" "$COGNITO_BACKUP_DIR" "$LAMBDA_BACKUP_DIR"

# --- Helpers ---
log() { printf "\033[0;36m[migration]\033[0m %s\n" "$*"; }
err() { printf "\033[0;31m[error]\033[0m %s\n" "$*" >&2; }

require_profile() {
  local profile="$1"
  if ! aws sts get-caller-identity --profile "$profile" >/dev/null 2>&1; then
    err "AWS profile '$profile' is not configured or has invalid credentials."
    err "Run: aws configure --profile $profile"
    exit 1
  fi
}

assert_account() {
  local profile="$1" expected="$2"
  local actual
  actual=$(aws sts get-caller-identity --profile "$profile" --query Account --output text)
  if [[ "$actual" != "$expected" ]]; then
    err "Profile '$profile' resolves to account $actual, expected $expected. Aborting."
    exit 1
  fi
}
