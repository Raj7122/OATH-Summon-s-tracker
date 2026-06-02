#!/usr/bin/env bash
# Phase 1.2 — Mirror the source S3 evidence bucket to a local backup directory.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

log "Syncing s3://$SOURCE_S3_BUCKET -> $S3_BACKUP_DIR"
aws s3 sync "s3://$SOURCE_S3_BUCKET" "$S3_BACKUP_DIR" \
  --profile "$SOURCE_PROFILE" \
  --region "$SOURCE_REGION"

# Object-count baseline.
COUNT=$(aws s3 ls "s3://$SOURCE_S3_BUCKET" --recursive --profile "$SOURCE_PROFILE" | wc -l | tr -d ' ')
echo "$SOURCE_S3_BUCKET  $COUNT" > "$BACKUPS_DIR/s3-source-count.txt"

log "Source bucket object count: $COUNT (saved to s3-source-count.txt)"
