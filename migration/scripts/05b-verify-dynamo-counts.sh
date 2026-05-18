#!/usr/bin/env bash
# Phase 3 verification — compare row counts between source and target.

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

if [[ -z "${TARGET_TABLES[*]:-}" ]]; then
  err "Target tables not loaded. Run 05a-discover-target-tables.sh first."
  exit 1
fi

require_profile "$SOURCE_PROFILE"
require_profile "$TARGET_PROFILE"

printf "%-18s  %-12s  %-12s  %s\n" "Type" "Source" "Target" "Status"
printf "%s\n" "-----------------------------------------------------------"

OK=1
for i in "${!TABLE_TYPES[@]}"; do
  TYPE="${TABLE_TYPES[$i]}"
  SRC_TABLE="${SOURCE_TABLES[$i]}"
  TGT_TABLE="${TARGET_TABLES[$i]}"

  SRC_COUNT=$(aws dynamodb scan --table-name "$SRC_TABLE" --select COUNT \
    --profile "$SOURCE_PROFILE" --region "$SOURCE_REGION" --output json | jq -r '.Count')
  TGT_COUNT=$(aws dynamodb scan --table-name "$TGT_TABLE" --select COUNT \
    --profile "$TARGET_PROFILE" --region "$TARGET_REGION" --output json | jq -r '.Count')

  STATUS="OK"
  if [[ "$SRC_COUNT" != "$TGT_COUNT" ]]; then
    STATUS="MISMATCH"
    OK=0
  fi
  printf "%-18s  %-12s  %-12s  %s\n" "$TYPE" "$SRC_COUNT" "$TGT_COUNT" "$STATUS"
done

if [[ "$OK" -ne 1 ]]; then
  err "Row counts do not match. Investigate before proceeding."
  exit 1
fi
log "All counts match."
