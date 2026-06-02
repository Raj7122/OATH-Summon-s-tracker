#!/usr/bin/env bash
# Phase 4 verification — compare object counts between source and target buckets.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

if [[ -z "${TARGET_S3_BUCKET:-}" ]]; then
  err "TARGET_S3_BUCKET not set. Run 05a-discover-target-tables.sh first."
  exit 1
fi

require_profile "$SOURCE_PROFILE"
require_profile "$TARGET_PROFILE"

SRC_COUNT=$(aws s3 ls "s3://$SOURCE_S3_BUCKET" --recursive --profile "$SOURCE_PROFILE" | wc -l | tr -d ' ')
TGT_COUNT=$(aws s3 ls "s3://$TARGET_S3_BUCKET" --recursive --profile "$TARGET_PROFILE" | wc -l | tr -d ' ')

echo "Source ($SOURCE_S3_BUCKET): $SRC_COUNT objects"
echo "Target ($TARGET_S3_BUCKET): $TGT_COUNT objects"

if [[ "$SRC_COUNT" != "$TGT_COUNT" ]]; then
  err "Object counts do not match."
  exit 1
fi
log "Object counts match."
