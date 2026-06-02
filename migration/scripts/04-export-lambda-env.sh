#!/usr/bin/env bash
# Phase 1.4 — Capture Lambda environment variables from the source account.
# The interesting ones are the secrets: NYC_OPEN_DATA_APP_TOKEN, NYC_OPEN_DATA_APP_TOKEN_2, GEMINI_API_KEY.
# These are NOT in source control, so we have to harvest them from the live function config.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

for FN in "$SOURCE_DAILYSWEEP_FN" "$SOURCE_DATAEXTRACTOR_FN"; do
  OUT="$LAMBDA_BACKUP_DIR/${FN}.json"
  log "  -> $FN"
  aws lambda get-function-configuration \
    --function-name "$FN" \
    --region "$SOURCE_REGION" \
    --profile "$SOURCE_PROFILE" \
    --output json > "$OUT"
done

log "Captured. Secrets to copy into Arthur's account:"
echo "--- $SOURCE_DAILYSWEEP_FN ---"
jq -r '.Environment.Variables | to_entries[] | select(.key | test("TOKEN|KEY|SECRET")) | "\(.key)=\(.value)"' \
  "$LAMBDA_BACKUP_DIR/${SOURCE_DAILYSWEEP_FN}.json"
echo "--- $SOURCE_DATAEXTRACTOR_FN ---"
jq -r '.Environment.Variables | to_entries[] | select(.key | test("TOKEN|KEY|SECRET")) | "\(.key)=\(.value)"' \
  "$LAMBDA_BACKUP_DIR/${SOURCE_DATAEXTRACTOR_FN}.json"

log "Full env vars saved to $LAMBDA_BACKUP_DIR/*.json (gitignored)"
