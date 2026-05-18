#!/usr/bin/env bash
# Phase 1.3 — Export Cognito users + groups for documentation/fallback.
# We do NOT recreate users from this — the lazy migration trigger handles that.
# This export is for reference only (so we know who exists and can verify post-migration).

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

log "Exporting Cognito users from $SOURCE_USER_POOL_ID..."

aws cognito-idp list-users \
  --user-pool-id "$SOURCE_USER_POOL_ID" \
  --region "$SOURCE_REGION" \
  --profile "$SOURCE_PROFILE" \
  --output json > "$COGNITO_BACKUP_DIR/users.json"

aws cognito-idp list-groups \
  --user-pool-id "$SOURCE_USER_POOL_ID" \
  --region "$SOURCE_REGION" \
  --profile "$SOURCE_PROFILE" \
  --output json > "$COGNITO_BACKUP_DIR/groups.json"

USER_COUNT=$(jq '.Users | length' "$COGNITO_BACKUP_DIR/users.json")
GROUP_COUNT=$(jq '.Groups | length' "$COGNITO_BACKUP_DIR/groups.json")

log "Users: $USER_COUNT, Groups: $GROUP_COUNT"
log "User emails:"
jq -r '.Users[] | (.Attributes[] | select(.Name=="email") | .Value)' "$COGNITO_BACKUP_DIR/users.json" | sed 's/^/  - /'
