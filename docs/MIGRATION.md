# Migration Runbook: Move Backend to Arthur's AWS Account

This is a step-by-step playbook for moving the OATH Summons Tracker backend from Raj's AWS account (`568438992037`) into Arthur's AWS account. It is designed to be run by Claude Code with AWS CLI access — every step has a script under `migration/scripts/`.

**End state:** the firm's production system runs entirely in Arthur's AWS account, with all client/summons data, S3 evidence files, and Cognito users (passwords preserved) carried over. The old account is then torn down.

---

## Source resources (Raj's account, `568438992037`, `us-east-1`)

| Type | Name / ID |
|---|---|
| Cognito User Pool | `us-east-1_HXL5eyt3G` |
| Cognito Identity Pool | `us-east-1:aac0e8b4-29f1-4a87-966c-c06b8d22adb9` |
| AppSync API ID | `y3ftocckkvaqrn43xz6cn6vfgq` |
| DynamoDB tables | `Client-y3ftocckkvaqrn43xz6cn6vfgq-dev`, `Summons-…-dev`, `SyncStatus-…-dev`, `Invoice-…-dev`, `InvoiceSummons-…-dev` |
| S3 evidence bucket | `oath-evidence-files-dev` |
| Lambdas | `dailySweep-dev`, `dataExtractor-dev` |
| EventBridge rule | `amplify-oathsummonstracker-dev-0fcf-CloudWatchEvent-tMKQS4BkZO6a` |
| AWS CLI profile | `Raj712` |

---

## Phase 0 — Hand Arthur's keys to Claude (5 min, one-time)

When you paste Arthur's access key + secret into the chat, Claude will:

```bash
aws configure --profile arthur
# region: us-east-1, output: json
aws sts get-caller-identity --profile arthur
```

The `get-caller-identity` output **must** show a different `Account` than `568438992037`. If it doesn't, stop and re-check.

---

## Phase 1 — Snapshot source data

Run from repo root:

```bash
bash migration/scripts/01-export-dynamo.sh
bash migration/scripts/02-export-s3.sh
bash migration/scripts/03-export-cognito.sh
bash migration/scripts/04-export-lambda-env.sh
```

Outputs land in `migration/backups/` (gitignored). Each script prints baseline counts that we re-check after import.

---

## Phase 2 — Provision new env in Arthur's account

> Manual interactive step — Amplify CLI prompts can't be fully scripted. Claude will guide each prompt.

```bash
amplify env add
# Name: prod
# AWS profile: arthur
```

Then add the user-migration Lambda **before** pushing (so it's wired into the pool from the first deploy):

```bash
amplify add function
# Name: cognitoUserMigration
# Runtime: nodejs22.x
# Template: Hello World (we'll paste the body afterward)
```

Copy the handler body from `migration/templates/cognitoUserMigration-handler.js` into `amplify/backend/function/cognitoUserMigration/src/index.js`. Then:

```bash
amplify update auth
# Walkthrough -> Manual configuration
# Trigger: User migration -> point at cognitoUserMigration
```

Push:
```bash
amplify push --env prod
```

After push completes, immediately disable the new EventBridge cron so it doesn't sweep against an empty DB:
```bash
NEW_RULE=$(aws events list-rules --profile arthur --query "Rules[?contains(Name, 'CloudWatchEvent')].Name | [0]" --output text)
aws events disable-rule --name "$NEW_RULE" --profile arthur
```

Set Lambda secrets in Arthur's account using values captured in Phase 1 step 4:
```bash
bash migration/scripts/07-set-target-lambda-secrets.sh
```

---

## Phase 3 — Migrate DynamoDB

Capture the new (target) table names — they end in `-prod` and use the new AppSync API ID:
```bash
bash migration/scripts/05a-discover-target-tables.sh   # writes migration/.env.target
node migration/scripts/05-import-dynamo.js
```

Verify counts match Phase 1 baselines:
```bash
bash migration/scripts/05b-verify-dynamo-counts.sh
```

---

## Phase 4 — Migrate S3 evidence

```bash
bash migration/scripts/06-import-s3.sh
```

Verify counts:
```bash
bash migration/scripts/06b-verify-s3-counts.sh
```

---

## Phase 5 — Cognito users (lazy, password-preserving)

The `cognitoUserMigration-prod` Lambda was deployed in Phase 2. It needs credentials to call `AdminInitiateAuth` against the **old** pool. Create a minimal IAM user in Raj's account:

```bash
bash migration/scripts/08-create-old-pool-reader.sh
```

This prints an access key + secret. Set them as env vars on the migration Lambda:

```bash
aws lambda update-function-configuration \
  --function-name cognitoUserMigration-prod \
  --environment "Variables={OLD_POOL_ID=us-east-1_HXL5eyt3G,OLD_POOL_CLIENT_ID=5u3iqbnppofude6c0jao41pl06,OLD_POOL_REGION=us-east-1,OLD_POOL_AWS_ACCESS_KEY_ID=...,OLD_POOL_AWS_SECRET_ACCESS_KEY=...}" \
  --profile arthur
```

(Claude will run this with the freshly-created credentials.)

User-facing behavior: each of the 3 users (Arthur, Jackie, Jelly) signs in to the new app once with their **existing** password. The trigger silently authenticates against the old pool, copies the user into the new pool, and sets their password. Subsequent sign-ins are direct against the new pool. See `migration/USER_MIGRATION.md`.

---

## Phase 6 — Frontend cutover

`amplify push --env prod` already regenerated `src/amplifyconfiguration.json` and `src/aws-exports.js` with the new endpoints. The remaining work is `src/lib/amplifyClient.ts`, which currently has hardcoded values from the old account:

```ts
userPoolId: 'us-east-1_HXL5eyt3G',
userPoolClientId: '5u3iqbnppofude6c0jao41pl06',
identityPoolId: 'us-east-1:aac0e8b4-29f1-4a87-966c-c06b8d22adb9',
```

Two options:
- **Quick:** swap in the new pool/client/identity IDs (read from the regenerated `amplifyconfiguration.json`).
- **Better:** refactor to read from `amplifyconfiguration.json` directly so this never needs touching again.

Then build and deploy the frontend through Arthur's Amplify Hosting:
```bash
npm run build
# Deploy via Amplify Console (or amplify publish if Hosting is wired to CLI)
```

---

## Phase 7 — Verify (the day of cutover)

- [ ] Sign in as Arthur → succeeds, password preserved
- [ ] Sign in as Jackie → succeeds
- [ ] Sign in as Jelly → succeeds
- [ ] Dashboard summons count matches Phase 1 baseline
- [ ] Click a summons → evidence PDF/video loads (proves S3 and AppSync wiring)
- [ ] Manual sweep test:
  ```bash
  aws lambda invoke --function-name dailySweep-prod /tmp/sweep-out.json --profile arthur
  aws logs tail /aws/lambda/dailySweep-prod --follow --profile arthur
  ```
- [ ] Confirm `dataExtractor-prod` runs against new summonses (OCR fields populate)
- [ ] Re-enable cron in Arthur's account:
  ```bash
  aws events enable-rule --name "$NEW_RULE" --profile arthur
  ```
- [ ] Disable cron in source account:
  ```bash
  aws events disable-rule --name amplify-oathsummonstracker-dev-0fcf-CloudWatchEvent-tMKQS4BkZO6a --profile Raj712
  ```

Run parallel for at least a few days (recommended: 1 week).

---

## Phase 8 — Tear down source

After verification window:

```bash
amplify env checkout dev
amplify env remove dev
# answer "yes" to delete CloudFormation stack
```

Cleanup leftover resources Amplify may not auto-delete:
```bash
bash migration/scripts/09-teardown-source.sh
```

After all 3 users have signed in once and migrated:
- Delete the temporary IAM user from Phase 5: `bash migration/scripts/10-cleanup-old-pool-reader.sh`
- (Optional) Remove the User Migration trigger and `cognitoUserMigration` function — `amplify update auth` then `amplify remove function cognitoUserMigration`, then `amplify push`.

---

## Risks & how we mitigate them

| Risk | Mitigation |
|---|---|
| `amplify push` fails partway | CloudFormation rolls back; rerun after fixing perms. Source untouched. |
| UserMigration Lambda can't reach old pool | Test by signing in as Raj first, *before* announcing the new URL to Arthur/Jackie/Jelly. |
| DynamoDB import overruns capacity | New tables default to on-demand billing; import script retries `UnprocessedItems`. |
| Loss of access to old account mid-migration | Phase 1 backups in `migration/backups/` cover everything. |
| Frontend pointing at wrong pool after cutover | Phase 6 explicitly verifies; old hardcoded IDs are easy to grep for. |

---

## File layout

```
docs/MIGRATION.md                    <- this runbook
migration/
  README.md                          <- start here
  scripts/
    00-config.sh                     <- shared variables
    01-export-dynamo.sh
    02-export-s3.sh
    03-export-cognito.sh
    04-export-lambda-env.sh
    05-import-dynamo.js              <- node, uses AWS SDK v3
    05a-discover-target-tables.sh
    05b-verify-dynamo-counts.sh
    06-import-s3.sh
    06b-verify-s3-counts.sh
    07-set-target-lambda-secrets.sh
    08-create-old-pool-reader.sh
    09-teardown-source.sh
    10-cleanup-old-pool-reader.sh
  templates/
    cognitoUserMigration-handler.js  <- paste into amplify function after `amplify add function`
  USER_MIGRATION.md                  <- runbook for the lazy migration trigger
  backups/                           <- gitignored; contains DynamoDB JSON, S3 mirror, Cognito user list
  .env.source                        <- gitignored; source resource names (auto-populated)
  .env.target                        <- gitignored; target resource names (auto-populated post-push)
```
