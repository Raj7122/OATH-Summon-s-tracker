#!/usr/bin/env bash
# Phase 5 — Create a minimal IAM user in Raj's source account that the
# cognitoUserMigration-prod Lambda can use to call AdminInitiateAuth against
# the OLD user pool. After all 3 users have migrated, run 10-cleanup-old-pool-reader.sh
# to delete it.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

USER_NAME="oath-old-pool-reader"
POLICY_NAME="OathOldPoolReaderPolicy"

# Idempotent: skip create if user already exists.
if aws iam get-user --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" >/dev/null 2>&1; then
  log "IAM user $USER_NAME already exists — reusing it."
else
  log "Creating IAM user $USER_NAME"
  aws iam create-user --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" >/dev/null
fi

# Inline policy: minimum perms to authenticate users against the old pool.
POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminGetUser"
      ],
      "Resource": "arn:aws:cognito-idp:${SOURCE_REGION}:${SOURCE_ACCOUNT_ID}:userpool/${SOURCE_USER_POOL_ID}"
    }
  ]
}
EOF
)

log "Attaching policy $POLICY_NAME"
aws iam put-user-policy \
  --user-name "$USER_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_DOC" \
  --profile "$SOURCE_PROFILE"

# Create a fresh access key (only one per user is fine; if 2 exist, we error out).
EXISTING_KEYS=$(aws iam list-access-keys --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" --query 'AccessKeyMetadata[*].AccessKeyId' --output text)
KEY_COUNT=$(echo "$EXISTING_KEYS" | wc -w | tr -d ' ')

if [[ "$KEY_COUNT" -ge 2 ]]; then
  err "User already has 2 access keys. Delete one before running this script."
  err "  aws iam delete-access-key --user-name $USER_NAME --access-key-id <id> --profile $SOURCE_PROFILE"
  exit 1
fi

log "Creating new access key (this is the only time the secret is shown)..."
KEY_JSON=$(aws iam create-access-key --user-name "$USER_NAME" --profile "$SOURCE_PROFILE" --output json)
ACCESS_KEY_ID=$(echo "$KEY_JSON" | jq -r '.AccessKey.AccessKeyId')
SECRET_ACCESS_KEY=$(echo "$KEY_JSON" | jq -r '.AccessKey.SecretAccessKey')

# Save to backups dir (gitignored) so we don't lose it if next step fails.
KEY_FILE="$BACKUPS_DIR/old-pool-reader-key.json"
echo "$KEY_JSON" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

cat <<EOF

------------------------------------------------------------------------
Created IAM user: $USER_NAME
Access Key ID:    $ACCESS_KEY_ID
Secret:           (saved to $KEY_FILE)

Next: set these on the cognitoUserMigration-prod Lambda env vars:
  OLD_POOL_AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID
  OLD_POOL_AWS_SECRET_ACCESS_KEY=<see $KEY_FILE>
  OLD_POOL_ID=$SOURCE_USER_POOL_ID
  OLD_POOL_CLIENT_ID=$SOURCE_USER_POOL_CLIENT_ID
  OLD_POOL_REGION=$SOURCE_REGION

(Claude can run the aws lambda update-function-configuration command after this.)
------------------------------------------------------------------------
EOF
