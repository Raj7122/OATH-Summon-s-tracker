#!/usr/bin/env bash
# Phase 8 — Clean up source-account resources after `amplify env remove dev`.
# Some resources (S3 bucket with objects, deployment bucket) sometimes need
# manual deletion because amplify can't delete non-empty buckets.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

log "Source-account leftover check..."

# Evidence bucket — if it still exists (i.e. Amplify left it), empty + delete.
if aws s3api head-bucket --bucket "$SOURCE_S3_BUCKET" --profile "$SOURCE_PROFILE" 2>/dev/null; then
  log "Evidence bucket $SOURCE_S3_BUCKET still exists. Emptying + deleting..."
  log "  WARNING: this is destructive. Confirm by typing 'YES'."
  read -r CONFIRM
  if [[ "$CONFIRM" != "YES" ]]; then
    log "Aborted by user."
    exit 0
  fi
  aws s3 rm "s3://$SOURCE_S3_BUCKET" --recursive --profile "$SOURCE_PROFILE"
  aws s3api delete-bucket --bucket "$SOURCE_S3_BUCKET" --profile "$SOURCE_PROFILE"
  log "Deleted $SOURCE_S3_BUCKET."
else
  log "Evidence bucket already gone — nothing to do."
fi

# Deployment bucket
DEPLOY_BUCKET="amplify-oathsummonstracker-dev-0fcf6-deployment"
if aws s3api head-bucket --bucket "$DEPLOY_BUCKET" --profile "$SOURCE_PROFILE" 2>/dev/null; then
  log "Deployment bucket $DEPLOY_BUCKET still exists."
  log "  Skipping auto-delete — review manually before removing."
fi

log "Source teardown checks complete."
