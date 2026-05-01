# AWS Account Migration Plan: Transfer OATH Summons Tracker to Arthur's Account

## Context

Rajiv built the OATH Summons Tracker for his client Arthur (Law Office of Arthur L. Miller). The app currently runs in Rajiv's AWS account (`568438992037`, region `us-east-1`). The goal is to transfer everything — infrastructure + data — to Arthur's own AWS account so he fully owns the app, the billing, and the data.

Arthur is not tech-savvy, so Rajiv will do all the technical work using Arthur's IAM credentials. After the migration, Rajiv will continue to maintain the app (add features, fix bugs, deploy updates) using a dedicated developer/admin role inside Arthur's account.

---

## Goals

1. Move all infrastructure (Cognito, AppSync, DynamoDB, Lambda, EventBridge, Amplify Hosting) into Arthur's AWS account.
2. Move all client + summons data into Arthur's DynamoDB tables.
3. Recreate the 3 Cognito users (Arthur, Jackie, Jelly) so they can log back in.
4. Hand Arthur full ownership and billing control.
5. **Keep Rajiv as the long-term technical maintainer** with ongoing developer access (no need to repeatedly ask Arthur for credentials).

---

## Prerequisites — Arthur's Side (~20 min on a screen share with Rajiv)

> **Note for Rajiv:** Schedule a 30-minute screen share with Arthur. He should share *his* screen so he keeps control of his account. Walk him through every click below. Do **not** ask him to do this alone — non-technical users get stuck on the IAM screens.

### Step 1 — Create the AWS Account (~5 min)

1. Arthur opens a browser and goes to **https://aws.amazon.com**
2. Click the orange **"Create an AWS Account"** button (top-right corner of the page)
3. Fill in:
   - **Root user email address:** Use a long-lived business email (e.g. `arthur@millerlaw.com`, **not** a personal Gmail). This email permanently controls the account.
   - **AWS account name:** `Miller Law - OATH Tracker`
4. Click **"Verify email address"**, check inbox for the 6-digit code, paste it back, click **"Continue"**
5. Set a strong **root password** — Arthur should save this in a password manager (1Password, Bitwarden, or written down in a secure place)
6. Choose account type: **"Business"**
7. Fill in business address + phone number for the law office
8. Enter credit card (will be charged ~$1 verification, refunded)
9. SMS / phone verification (AWS calls or texts a code)
10. Choose **"Basic Support - Free"** plan
11. Click **"Complete sign up"**

> **Wait time:** AWS may take 5–15 minutes to fully activate the account. Arthur will get a confirmation email titled *"Welcome to Amazon Web Services"* when it's ready.

### Step 2 — Enable MFA on the Root Account (~3 min, CRITICAL)

The root account has unlimited power. If it's compromised, the attacker can delete everything and run up unlimited bills. MFA is non-negotiable.

1. Sign in as **root user** at **https://console.aws.amazon.com**
   - Choose **"Root user"** (not "IAM user")
   - Enter the email from Step 1
2. Top-right corner → click the **account name** → **"Security credentials"**
3. Scroll to **"Multi-factor authentication (MFA)"** section
4. Click **"Assign MFA device"**
5. Device name: `Arthur-Phone`
6. Choose **"Authenticator app"**
7. Open Google Authenticator / Authy on Arthur's phone, scan the QR code
8. Enter two consecutive 6-digit codes from the app
9. Click **"Add MFA"**

### Step 3 — Create an IAM User for Rajiv (~7 min)

This is the user Rajiv will use to do all the technical work. Arthur will **never** share his root password — only this IAM user's credentials.

1. Still signed in as root, in the search bar at the top, type **`IAM`** → click **"IAM"** under Services
2. Left sidebar → click **"Users"**
3. Click the orange **"Create user"** button (top-right)
4. **User name:** `rajiv-admin`
5. ✅ Check the box **"Provide user access to the AWS Management Console"**
6. Choose **"I want to create an IAM user"** (not Identity Center)
7. **Console password:** Choose **"Custom password"**, enter a strong password, save it for Rajiv
8. ❌ Uncheck **"Users must create a new password at next sign-in"** (Rajiv will rotate it himself)
9. Click **"Next"**
10. On the **"Set permissions"** screen, choose **"Attach policies directly"**
11. In the search box, type `AdministratorAccess`
12. ✅ Check the box next to **`AdministratorAccess`**
13. Click **"Next"** → **"Create user"**

### Step 4 — Generate an Access Key for Rajiv (~3 min)

1. On the IAM Users list, click on **`rajiv-admin`**
2. Click the **"Security credentials"** tab (NOT "Permissions")
3. Scroll down to **"Access keys"** section
4. Click **"Create access key"**
5. Use case: select **"Command Line Interface (CLI)"**
6. ✅ Check the confirmation box at the bottom
7. Click **"Next"**
8. Description tag: `rajiv-cli-migration` → click **"Create access key"**
9. **CRITICAL:** Click **"Download .csv file"** — this is the only chance to see the secret key
10. Send the .csv file to Rajiv via a secure channel:
    - **Best:** Signal, 1Password shared vault, or Bitwarden Send (expires in 7 days)
    - **OK:** Encrypted email
    - **NEVER:** Plain text email, SMS, Slack DM, or Discord

### Step 5 — Provide User Emails (~1 min)

Arthur sends Rajiv (in the same secure channel) the email addresses he wants for the 3 app users:

- Arthur: `__________________`
- Jackie: `__________________`
- Jelly:  `__________________`

These will be used to recreate their Cognito accounts. Each user will receive a "temporary password" email from AWS and must reset it on first login.

---

## Granting Rajiv Long-Term Developer Access (Important — do this before the screen share ends)

Rajiv plans to keep maintaining the app (new features, bug fixes, dependency updates, redeploys). Without a durable access path, every future change would require Arthur to regenerate credentials — friction Arthur should not have to deal with.

There are two ways to handle this. **Option A is strongly recommended.**

### Option A (Recommended): Cross-Account IAM Role

Rajiv keeps using his own AWS account (`568438992037`). Arthur's account has a role that Rajiv's account is allowed to "assume." Rajiv never holds Arthur's credentials, and Arthur can revoke access in one click if he ever needs to.

**What Arthur does (one-time, ~5 min, with Rajiv on screen share):**

1. Sign in to Arthur's account as root or as `rajiv-admin`
2. Search bar → **`IAM`** → click **"IAM"**
3. Left sidebar → **"Roles"** → click **"Create role"** (top-right)
4. **Trusted entity type:** select **"AWS account"**
5. Choose **"Another AWS account"**
6. **Account ID:** enter Rajiv's AWS account number: `568438992037`
7. ✅ Check **"Require external ID"** → set external ID to a random string Arthur and Rajiv agree on (e.g. `oath-tracker-2026`). This prevents the "confused deputy" attack.
8. ❌ Leave **"Require MFA"** unchecked for now (can be enabled later for sensitive ops)
9. Click **"Next"**
10. Search for `AdministratorAccess` → ✅ check it → **"Next"**
11. **Role name:** `OATHTrackerMaintainer`
12. **Description:** `Long-term role assumed by Rajiv to maintain the OATH Summons Tracker.`
13. Click **"Create role"**
14. Open the new role → copy the **Role ARN** (looks like `arn:aws:iam::<arthur-account-id>:role/OATHTrackerMaintainer`) → send it to Rajiv

**What Rajiv does on his side (one-time):**

Add this profile to `~/.aws/config`:

```ini
[profile arthur-oath]
role_arn = arn:aws:iam::<arthur-account-id>:role/OATHTrackerMaintainer
external_id = oath-tracker-2026
source_profile = default
region = us-east-1
```

From then on, any maintenance command runs with `--profile arthur-oath` — no credential handoff needed.

**How Arthur revokes access (if Rajiv stops working with him):**

- IAM → Roles → `OATHTrackerMaintainer` → **"Delete"**. Done. One click.

### Option B (Fallback): Permanent IAM User for Rajiv

This is the `rajiv-admin` user from Step 3 above. It works, but:
- Access keys live on Rajiv's machine and need rotation every 90 days
- If Rajiv's laptop is compromised, Arthur's account is exposed until the key is revoked
- Recommended only as a backup if Option A can't be set up

If using Option B, set a calendar reminder to rotate the access key every 90 days (IAM → Users → `rajiv-admin` → Security credentials → Create new access key → delete old one).

### Step 6 — Set Up Billing Alerts (Arthur's protection, ~3 min)

Arthur is now paying the AWS bill. Set a billing alarm so a misconfigured Lambda doesn't surprise him with a $500 charge.

1. Sign in as root → top-right account name → **"Billing and Cost Management"**
2. Left sidebar → **"Billing preferences"**
3. ✅ Enable **"Receive AWS Free Tier alerts"** + enter Arthur's email
4. ✅ Enable **"Receive Billing alerts"**
5. Save preferences
6. Left sidebar → **"Budgets"** → **"Create budget"**
7. Choose **"Use a template"** → **"Monthly cost budget"**
8. Budget amount: `$50` (the app should cost <$10/mo; $50 gives headroom)
9. Email recipient: Arthur's email + Rajiv's email
10. Click **"Create budget"**

---

## Migration Steps (Rajiv's Side)

> All commands below assume Rajiv has set up the `arthur-oath` profile (Option A) or is exporting Arthur's `rajiv-admin` access key (Option B). Run from the project root.

### Phase 1 — Inventory & Backup (Rajiv's account)

```bash
# Export all DynamoDB data from Rajiv's account
aws dynamodb scan --table-name Client-<env-suffix> --output json > backups/clients.json
aws dynamodb scan --table-name Summons-<env-suffix> --output json > backups/summonses.json

# Export Cognito user list (emails only — passwords cannot be exported)
aws cognito-idp list-users --user-pool-id <old-pool-id> > backups/users.json

# Export GraphQL schema
cp amplify/backend/api/oathtracker/schema.graphql backups/schema.graphql

# Snapshot Lambda environment variables
aws lambda get-function-configuration --function-name dailySweep-<env> > backups/dailySweep-config.json
aws lambda get-function-configuration --function-name dataExtractor-<env> > backups/dataExtractor-config.json
```

Store the `backups/` directory somewhere safe (encrypted drive, 1Password vault). **Do not commit it to git** — it contains client PII.

### Phase 2 — Stand Up the New Amplify Environment (Arthur's account)

```bash
# Configure Amplify CLI to use Arthur's profile
amplify configure --profile arthur-oath

# In the project directory, initialize a new Amplify env pointing at Arthur's account
amplify env add
# Env name: prod
# AWS profile: arthur-oath
# Region: us-east-1

amplify push
# This creates: Cognito User Pool, AppSync API, DynamoDB tables, Lambda functions
```

Capture the new resource IDs (User Pool ID, AppSync endpoint, etc.) — they go into `.env.production` and Amplify Hosting environment variables.

### Phase 3 — Restore Data into New DynamoDB Tables

```bash
# Use the AWS CLI batch-write-item or a small Node script to re-insert
node scripts/restore-dynamodb.js \
  --input backups/clients.json \
  --table Client-<new-env-suffix> \
  --profile arthur-oath

node scripts/restore-dynamodb.js \
  --input backups/summonses.json \
  --table Summons-<new-env-suffix> \
  --profile arthur-oath
```

> The `owner` field on each record will need to be remapped to the new Cognito `sub` IDs (see Phase 4). Consider doing this in the same script.

### Phase 4 — Recreate Cognito Users

For each user (Arthur, Jackie, Jelly):

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <new-pool-id> \
  --username arthur@millerlaw.com \
  --user-attributes Name=email,Value=arthur@millerlaw.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --profile arthur-oath
```

Each user receives an AWS-generated email with a temporary password. They reset it on first login. **Capture each new user's `sub` (UUID)** from the response — you need these to remap the `owner` field on the migrated DynamoDB records.

### Phase 5 — Migrate Lambda Secrets

In Arthur's AWS Console (Rajiv signed in as `rajiv-admin` or via assumed role):

1. **Lambda** → click `dailySweep-prod` → **Configuration** tab → **Environment variables** → **Edit**
2. Add `NYC_OPEN_DATA_APP_TOKEN` = `<value from backup>` → **Save**
3. Repeat for `dataExtractor-prod` with `GEMINI_API_KEY`

> **Better long-term:** move these to **AWS Secrets Manager** so they're not visible in plain text on the Lambda console.

### Phase 6 — Reconnect Amplify Hosting to GitHub

1. Sign in to Arthur's AWS Console
2. **Amplify** → **"New app"** → **"Host web app"**
3. Choose **GitHub** → authorize → select `raj7122/oath-summon-s-tracker` repo, `main` branch
4. Build settings should auto-detect from `amplify.yml`
5. Add environment variables: all `VITE_*` vars from `.env.production`
6. Deploy. First build takes ~5 min.
7. Confirm the production URL works and the 3 users can log in.

### Phase 7 — Cutover

1. Have all 3 users log in to the new URL, change their temp passwords
2. Spot-check: do all their existing summonses appear?
3. Wait 24h to confirm `dailySweep` runs in the new account
4. Update any DNS / bookmarks pointing at the old URL
5. **Wait 30 days** before deleting Rajiv-account resources (in case rollback is needed)

### Phase 8 — Decommission Old Account

After 30 days of stable operation:

```bash
# Switch Amplify CLI back to Rajiv's profile
amplify env remove prod-old --profile rajiv-personal

# Or delete via console: Amplify → old app → Actions → Delete app
```

---

## Post-Migration Checklist

- [ ] Arthur received the welcome email and can sign in to AWS Console as root
- [ ] Arthur has MFA enabled on root
- [ ] Arthur has billing alerts at $50/mo
- [ ] Rajiv can assume `OATHTrackerMaintainer` role (Option A) without asking Arthur
- [ ] All 3 users (Arthur, Jackie, Jelly) can log in to the new app URL
- [ ] All client + summons records visible to the correct user (no cross-user leakage)
- [ ] `dailySweep` Lambda has run successfully at least once in the new account (check CloudWatch Logs)
- [ ] `dataExtractor` Lambda has populated OCR fields for at least one new summons
- [ ] Old AWS account resources deleted after 30-day buffer
- [ ] Rajiv removed the original Rajiv-account access key + Amplify CLI profile

---

## Risk Notes

- **Cognito passwords cannot be migrated.** All 3 users must reset on first login. Communicate this to them in advance so the AWS email isn't mistaken for phishing.
- **Owner field remap is the trickiest step.** A bug here = User A seeing User B's data, which violates the `@auth(rules: [{ allow: owner }])` contract. Test with a sample of records before doing the full restore.
- **Don't skip the 30-day buffer.** If a regression appears, having the old infra still running is the rollback plan.
- **External ID on the assumed role is mandatory.** Without it, anyone who guesses Arthur's account ID could attempt to assume the role from any AWS account.
