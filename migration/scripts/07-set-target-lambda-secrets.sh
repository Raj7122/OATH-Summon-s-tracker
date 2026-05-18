#!/usr/bin/env bash
# Phase 2.5 — Copy the runtime secrets from the source Lambdas (NYC tokens, Gemini key)
# onto the target Lambdas, while preserving the env vars Amplify already configured
# (table names, GraphQL endpoint, etc.).

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

if [[ -z "${TARGET_DAILYSWEEP_FN:-}" || -z "${TARGET_DATAEXTRACTOR_FN:-}" ]]; then
  err "Target Lambda names not set. Run 05a-discover-target-tables.sh first."
  exit 1
fi

require_profile "$SOURCE_PROFILE"
require_profile "$TARGET_PROFILE"

# Keys we want to copy from source -> target.
SECRET_KEYS=("NYC_OPEN_DATA_APP_TOKEN" "NYC_OPEN_DATA_APP_TOKEN_2" "GEMINI_API_KEY")

copy_secrets() {
  local SRC_FN="$1" TGT_FN="$2"
  log "Copying secrets: $SRC_FN -> $TGT_FN"

  # Pull source secrets.
  local SRC_VARS_JSON
  SRC_VARS_JSON=$(aws lambda get-function-configuration \
    --function-name "$SRC_FN" --profile "$SOURCE_PROFILE" --region "$SOURCE_REGION" \
    --query "Environment.Variables" --output json)

  # Pull target current vars (Amplify-managed values we must preserve).
  local TGT_VARS_JSON
  TGT_VARS_JSON=$(aws lambda get-function-configuration \
    --function-name "$TGT_FN" --profile "$TARGET_PROFILE" --region "$TARGET_REGION" \
    --query "Environment.Variables" --output json)

  # Merge: take target as base, overlay just the secret keys from source.
  local MERGED
  MERGED=$(jq -n \
    --argjson src "$SRC_VARS_JSON" \
    --argjson tgt "$TGT_VARS_JSON" \
    --argjson keys "$(printf '%s\n' "${SECRET_KEYS[@]}" | jq -R . | jq -s .)" \
    '$tgt + ($src | with_entries(select(.key as $k | $keys | index($k))))')

  local TMP_ENV
  TMP_ENV=$(mktemp -t lambda-env.XXXX.json)
  jq -n --argjson v "$MERGED" '{Variables: $v}' > "$TMP_ENV"

  aws lambda update-function-configuration \
    --function-name "$TGT_FN" \
    --profile "$TARGET_PROFILE" --region "$TARGET_REGION" \
    --environment "file://$TMP_ENV" \
    --output json > /dev/null

  rm -f "$TMP_ENV"

  log "  done — secrets present on $TGT_FN:"
  aws lambda get-function-configuration \
    --function-name "$TGT_FN" --profile "$TARGET_PROFILE" --region "$TARGET_REGION" \
    --query "Environment.Variables" --output json | \
    jq -r 'to_entries[] | select(.key | test("TOKEN|KEY|SECRET")) | "    \(.key)=<set>"'
}

copy_secrets "$SOURCE_DAILYSWEEP_FN"     "$TARGET_DAILYSWEEP_FN"
copy_secrets "$SOURCE_DATAEXTRACTOR_FN"  "$TARGET_DATAEXTRACTOR_FN"
