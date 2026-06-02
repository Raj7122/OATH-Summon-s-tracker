#!/usr/bin/env bash
# Phase 4 — Sync the local backup of the evidence bucket up to the target bucket
# in Arthur's account. We go through the local copy (rather than direct
# cross-account sync) so we don't need a cross-account bucket policy.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

if [[ -z "${TARGET_S3_BUCKET:-}" ]]; then
  err "TARGET_S3_BUCKET not set. Run 05a-discover-target-tables.sh first."
  exit 1
fi

require_profile "$TARGET_PROFILE"

log "Syncing $S3_BACKUP_DIR -> s3://$TARGET_S3_BUCKET"
aws s3 sync "$S3_BACKUP_DIR/" "s3://$TARGET_S3_BUCKET/" \
  --profile "$TARGET_PROFILE" \
  --region "$TARGET_REGION"

log "Sync complete."
