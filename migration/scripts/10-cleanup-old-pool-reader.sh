#!/usr/bin/env bash
# Phase 8.5 — Once all users have migrated, delete the temporary IAM user
# the migration Lambda used to call the old pool.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

USER_NAME="oath-old-pool-reader"
POLICY_NAME="OathOldPoolReaderPolicy"

if ! aws iam get-user --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" >/dev/null 2>&1; then
  log "User $USER_NAME doesn't exist — already cleaned up."
  exit 0
fi

# Delete access keys
KEYS=$(aws iam list-access-keys --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" --query 'AccessKeyMetadata[*].AccessKeyId' --output text)
for KEY in $KEYS; do
  log "Deleting access key $KEY"
  aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$KEY" --profile "$SOURCE_PROFILE"
done

# Detach inline policy
log "Removing inline policy"
aws iam delete-user-policy --user-name "$USER_NAME" --policy-name "$POLICY_NAME" --profile "$SOURCE_PROFILE" 2>/dev/null || true

# Delete user
log "Deleting user"
aws iam delete-user --user-name "$USER_NAME" --profile "$SOURCE_PROFILE"

# Remove the local key file
rm -f "$BACKUPS_DIR/old-pool-reader-key.json"

log "Cleanup done."
