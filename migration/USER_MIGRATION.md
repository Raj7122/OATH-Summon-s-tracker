# Cognito User Migration (Lazy, Password-Preserving)

## What this does

Each of the 3 users (Arthur, Jackie, Jelly) signs in to the new app at the new URL **with their existing password**. The first time they do, a Lambda silently authenticates them against the old user pool (in Raj's account), Cognito creates the user in the new pool with the password they typed, and they're in. No password reset email, no friction, no shared secrets handed around.

## What users see

1. They go to the new URL.
2. Sign in with the email + password they've always used.
3. They land on the dashboard.

That's it. The migration happens transparently inside the Lambda.

## How it works

1. Cognito in the new (target) pool gets a sign-in attempt for a user it doesn't have yet.
2. Cognito invokes the `UserMigration_Authentication` trigger → `cognitoUserMigration-prod` Lambda.
3. The Lambda calls `AdminInitiateAuth` against the **old** pool with the same username/password.
4. If the old pool accepts it, the Lambda returns the user's email attribute → Cognito creates the user in the new pool with the typed password and marks them confirmed.
5. Subsequent sign-ins go directly against the new pool — the trigger doesn't fire again for that user.

## Required setup (already documented in `docs/MIGRATION.md` Phase 5)

1. After `amplify push --env prod`, paste `migration/templates/cognitoUserMigration-handler.js` into `amplify/backend/function/cognitoUserMigration/src/index.js`.
2. `npm install --save @aws-sdk/client-cognito-identity-provider` inside the Lambda's `src/` (or include it in the function's `package.json`).
3. `amplify push --env prod` again to upload the handler.
4. Run `migration/scripts/08-create-old-pool-reader.sh` to mint a minimal IAM user in Raj's account with permission to call `AdminInitiateAuth` on the old pool.
5. Set the access key + secret as env vars on `cognitoUserMigration-prod`:
   - `OLD_POOL_ID=us-east-1_HXL5eyt3G`
   - `OLD_POOL_CLIENT_ID=5u3iqbnppofude6c0jao41pl06`
   - `OLD_POOL_REGION=us-east-1`
   - `OLD_POOL_AWS_ACCESS_KEY_ID=…`
   - `OLD_POOL_AWS_SECRET_ACCESS_KEY=…`

## How to verify

**Smoke test before announcing the new URL** — sign in as Raj at the new URL with the old password. If it works, the trigger is wired correctly.

**Confirming users have migrated**:
```bash
source migration/scripts/00-config.sh
source migration/.env.target
aws cognito-idp list-users --user-pool-id "$TARGET_USER_POOL_ID" --profile arthur
```
Once a user shows up in the new pool, they've migrated. Old pool stays intact until Phase 8 teardown.

## When it's safe to remove the trigger

After all 3 users have signed in at least once (verifiable via the list-users command above), the trigger is redundant. Remove it via `amplify update auth` and `amplify remove function cognitoUserMigration`, then `amplify push --env prod`. Then run `migration/scripts/10-cleanup-old-pool-reader.sh` to tear down the temporary IAM user in Raj's account.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| User gets "Incorrect username or password" with their correct old password | Lambda can't reach the old pool — bad creds, missing env var, or expired access key | Check CloudWatch logs for `cognitoUserMigration-prod`. The error message will name the missing variable. |
| User gets "User does not exist" | They never existed in the old pool — typo? | Confirm against `migration/backups/cognito/users.json`. |
| Migration succeeds but app shows blank dashboard | DynamoDB tables empty in new account | Phase 3 didn't run successfully. Re-run `node migration/scripts/05-import-dynamo.js`. |
| Lambda times out | Old pool latency too high (rare) | Default 25s timeout is plenty; investigate via CloudWatch. |
