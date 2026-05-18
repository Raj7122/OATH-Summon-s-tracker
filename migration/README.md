# Migration Workspace

Scripts and templates for moving the backend from Raj's AWS account to Arthur's.

**Read `docs/MIGRATION.md` first** — it's the master runbook. This README covers script-level details only.

## Quick start (for Claude)

When the user pastes Arthur's access key + secret:

```bash
# Phase 0 — configure target profile
aws configure --profile arthur   # paste keys, region us-east-1, output json
aws sts get-caller-identity --profile arthur   # MUST NOT be 568438992037

# Phase 1 — snapshot source
bash migration/scripts/01-export-dynamo.sh
bash migration/scripts/02-export-s3.sh
bash migration/scripts/03-export-cognito.sh
bash migration/scripts/04-export-lambda-env.sh

# Phase 2 — provision (interactive amplify CLI)
# See docs/MIGRATION.md Phase 2

# Phase 3 — DynamoDB
bash migration/scripts/05a-discover-target-tables.sh
node migration/scripts/05-import-dynamo.js
bash migration/scripts/05b-verify-dynamo-counts.sh

# Phase 4 — S3
bash migration/scripts/06-import-s3.sh
bash migration/scripts/06b-verify-s3-counts.sh

# Phase 5 — Cognito user-migration trigger creds
bash migration/scripts/08-create-old-pool-reader.sh

# Phase 7 — verify (manual sign-in tests + sweep dry run)

# Phase 8 — teardown
amplify env remove dev
bash migration/scripts/09-teardown-source.sh
bash migration/scripts/10-cleanup-old-pool-reader.sh
```

## Conventions

- All scripts source `migration/scripts/00-config.sh` for shared values (source resource names, profiles).
- Source profile: `Raj712`. Target profile: `arthur`.
- Backups in `migration/backups/` (gitignored).
- Target resource names are populated by `05a-discover-target-tables.sh` into `migration/.env.target` once `amplify push --env prod` has completed.

## Why scripts and not just `amplify env add` + AWS Backup?

- AWS Backup requires opt-in per resource and cross-account vaults, which is more setup than a 5-table dynamo scan.
- Amplify CLI `amplify env add` provisions the new env but doesn't migrate data. We still need to copy DynamoDB items + S3 objects + lazy-migrate Cognito users ourselves.
- Keeping it as plain bash + node scripts means it's reviewable, idempotent (safe to rerun), and doesn't depend on extra services.
