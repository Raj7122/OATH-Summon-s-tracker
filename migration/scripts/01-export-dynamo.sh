#!/usr/bin/env bash
# Phase 1.1 — Export every DynamoDB table from the source account to JSON.
# Output: migration/backups/dynamodb/<TypeName>.json + counts.txt

set -euo pipefail
source "$(dirname "$0")/00-config.sh"

require_profile "$SOURCE_PROFILE"
assert_account "$SOURCE_PROFILE" "$SOURCE_ACCOUNT_ID"

log "Exporting DynamoDB tables from source account ($SOURCE_ACCOUNT_ID, $SOURCE_REGION)..."
COUNTS_FILE="$DYNAMO_BACKUP_DIR/counts.txt"
: > "$COUNTS_FILE"

for i in "${!SOURCE_TABLES[@]}"; do
  TABLE="${SOURCE_TABLES[$i]}"
  TYPE="${TABLE_TYPES[$i]}"
  OUT="$DYNAMO_BACKUP_DIR/${TYPE}.json"

  log "  -> $TABLE"
  # Paginated scan; aws cli v2 handles pagination automatically when output is json.
  aws dynamodb scan \
    --table-name "$TABLE" \
    --region "$SOURCE_REGION" \
    --profile "$SOURCE_PROFILE" \
    --output json > "$OUT"

  COUNT=$(jq '.Items | length' "$OUT")
  echo "$TYPE  $TABLE  $COUNT" | tee -a "$COUNTS_FILE"
done

log "Done. Backups in $DYNAMO_BACKUP_DIR"
log "Baseline counts saved to $COUNTS_FILE"
