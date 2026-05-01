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

## Prerequisites — Arthur's Side (~35 min on a screen share with Rajiv)

> **Note for Rajiv:** Schedule a 45-minute screen share with Arthur. He should share *his* screen so he keeps control of his account. Walk him through every click below. Do **not** ask him to do this alone — non-technical users get stuck on the IAM and Roles screens.
>
> **Order matters.** Do steps 1–7 in sequence in a single sitting. The access key from Step 4 is what Rajiv uses to do the migration; the cross-account role from Step 5 is what he uses for ongoing maintenance after the migration is done.

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

### Step 4 — Generate an Access Key for `rajiv-admin` (~10 min, READ THIS WHOLE SECTION FIRST)

#### What an "Access Key" actually is

An IAM **access key** is a two-part credential that lets the AWS CLI and SDKs sign in as the `rajiv-admin` IAM user without using a password. Think of it as a username/password specifically for *programs* (Rajiv's terminal, Amplify CLI, Node scripts).

- **Access Key ID** — looks like `AKIAIOSFODNN7EXAMPLE` (20 characters, starts with `AKIA`). Semi-public; appears in some logs.
- **Secret Access Key** — looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` (40 random characters). Treat like a password. **AWS shows this exactly once.** If you close the screen without copying it, the secret is gone forever and you have to delete the key and make a new one.

> **Why this is needed even though we're setting up Option A (cross-account role) later:** Rajiv uses this key only as a **bootstrap and break-glass credential** — to perform the initial migration before the cross-account role exists, and as a fallback if Rajiv's own AWS account is ever unavailable. After the role is set up (Step 5), day-to-day work goes through the role, not this key.

#### Where to find the screen (exact path)

Arthur should still be signed in as **root** in the AWS Console.

1. In the top **search bar** (the one that says "Search for services, features, blogs, docs, and more"), type **`IAM`**
2. Click the result labeled **"IAM"** with the tagline "Manage access to AWS resources"
3. The IAM dashboard opens. In the **left sidebar**, click **"Users"** (under the "Access management" group)
4. The Users table appears. Click on the username **`rajiv-admin`** (it's a clickable blue link, not a checkbox)
5. The user detail page opens with several tabs near the top: **Permissions | Groups | Tags | Security credentials | Access Advisor**
6. Click the **"Security credentials"** tab
   - ⚠️ **Do NOT click "Permissions"** — that's where the AdministratorAccess policy lives, not the keys.
7. Scroll past the **"Console sign-in"** section and the **"Multi-factor authentication (MFA)"** section
8. You will reach a section titled **"Access keys"**. It will say *"You have no access keys."*
9. Click the white button **"Create access key"** (top-right of the Access keys section)

#### Walking through the wizard

The wizard has 3 screens.

**Screen 1 — "Access key best practices & alternatives":**
- AWS lists 6 use cases with radio buttons:
  - Command Line Interface (CLI)
  - Local code
  - Application running on an AWS compute service
  - Third-party service
  - Application running outside AWS
  - Other
- ✅ Select **"Command Line Interface (CLI)"**
- A yellow warning box appears recommending IAM Identity Center instead. We're intentionally choosing the simpler path; that's fine for this use case.
- ✅ Scroll to the bottom and check the box: **"I understand the above recommendation and want to proceed to create an access key."**
- Click **"Next"**

**Screen 2 — "Set description tag (optional)":**
- **Description tag value:** `rajiv-cli-bootstrap-2026`
- Click **"Create access key"**

**Screen 3 — "Retrieve access keys":** ⚠️ **THIS IS THE CRITICAL SCREEN — DO NOT CLOSE IT YET**
- You'll see two fields:
  - **Access key:** `AKIA...` (visible)
  - **Secret access key:** masked by default, with a **"Show"** link next to it
- Click **"Download .csv file"** (the blue button) — this saves a file named `rajiv-admin_accessKeys.csv` to Arthur's Downloads folder.
- The .csv has two columns: `Access key ID` and `Secret access key`. Open it once with Numbers/Excel/a text editor to confirm both values are present and not blank.
- **Only after the .csv is confirmed saved**, click **"Done"**.

> **What to do if the screen is closed too early:** The secret is unrecoverable. Go back to Security credentials → Access keys → click the **"Actions"** dropdown next to the half-broken key → **"Delete"** → confirm. Then start Step 4 over from the beginning. No data lost; just an extra 5 minutes.

#### How Arthur sends the credentials to Rajiv (pick ONE secure channel)

The .csv file is the equivalent of handing over the keys to the entire AWS account. Treat it accordingly.

| Channel | Verdict |
|---|---|
| **1Password shared vault** (Arthur invites Rajiv as a guest) | ✅ **Best** — encrypted at rest, audit log, easy to revoke |
| **Bitwarden Send** with 7-day expiry + view limit of 1 | ✅ Best (free option) |
| **Signal** message, attach the .csv, then `Disappearing messages: 1 day` | ✅ Good |
| **AWS-encrypted email** (S/MIME or PGP) | 🟡 OK if both sides have it set up |
| Slack DM, Discord DM, plain email, SMS, iMessage | ❌ **NEVER** — these all log/back-up plaintext |
| GitHub gist, Pastebin, Google Doc | ❌ **NEVER** — indexed/cached even after deletion |

After Rajiv confirms receipt and that the key works (he'll run `aws sts get-caller-identity` to verify), Arthur should:
1. Move the .csv to the Trash on his computer
2. Empty the Trash
3. Delete the Bitwarden Send / Signal message / 1Password share

#### How Rajiv stores the key on his machine

Rajiv adds this to `~/.aws/credentials` (create the file if it doesn't exist; permissions must be `600`):

```ini
[arthur-rajiv-admin]
aws_access_key_id = AKIA...
aws_secret_access_key = wJalrXUtnFEMI/...
```

And to `~/.aws/config`:

```ini
[profile arthur-rajiv-admin]
region = us-east-1
output = json
```

Verify it works:

```bash
aws sts get-caller-identity --profile arthur-rajiv-admin
# Expected output:
# {
#   "UserId": "AIDA...",
#   "Account": "<arthur-account-id>",
#   "Arn": "arn:aws:iam::<arthur-account-id>:user/rajiv-admin"
# }
```

> **Never commit `~/.aws/credentials` to git.** Confirm it's in your global gitignore (`~/.config/git/ignore`) and that no project has it tracked. For extra safety, Rajiv can use [`aws-vault`](https://github.com/99designs/aws-vault) to keep the secret in macOS Keychain instead of a plaintext file.

#### What to do if the access key leaks (or you suspect it leaked)

1. Sign in to Arthur's AWS Console (root or `rajiv-admin` if still working)
2. IAM → Users → `rajiv-admin` → **Security credentials** tab → **Access keys** section
3. Find the leaked key by its **Access key ID** → **"Actions"** → **"Deactivate"** (immediately stops it working)
4. Then **"Actions"** → **"Delete"** (cleanup)
5. Create a fresh key (repeat Step 4 of this doc)
6. Review CloudTrail (search bar → **CloudTrail** → Event history) for any unfamiliar API calls in the last 24h

### Step 5 — Create the Cross-Account Maintainer Role for Rajiv (~5 min)

This is what lets Rajiv keep maintaining the app long-term **without holding Arthur's credentials**. Rajiv's own AWS account (`568438992037`) is granted permission to "assume" a role inside Arthur's account. Arthur can revoke this in one click if Rajiv ever stops being his developer.

> **Why do this in addition to the access key in Step 4?** The access key is for the initial migration (because the role doesn't exist yet) and as an emergency fallback. The role is the durable, day-to-day path — and it's much safer because secrets never leave Rajiv's own AWS account.

1. Still signed in to Arthur's account (root or `rajiv-admin` both work)
2. Search bar → type **`IAM`** → click **"IAM"**
3. Left sidebar → **"Roles"** (under "Access management") → click the orange **"Create role"** button (top-right)
4. **Step 1 of the wizard — "Select trusted entity":**
   - **Trusted entity type:** select the **"AWS account"** card (NOT "AWS service")
   - A new section appears below: **"An AWS account"**
   - Choose the radio button **"Another AWS account"**
   - **Account ID:** enter Rajiv's account number → `568438992037`
   - **Options:**
     - ✅ Check **"Require external ID (Best practice when a third party will assume this role)"**
     - In the **External ID** field that appears, type a shared secret string. Suggested: `oath-tracker-2026-mig` (any random string both sides agree on; this prevents the "confused deputy" attack)
     - ❌ Leave **"Require MFA"** unchecked (MFA can be added later for sensitive operations)
   - Click **"Next"**
5. **Step 2 — "Add permissions":**
   - In the search box, type `AdministratorAccess`
   - ✅ Check the box next to the policy named exactly **`AdministratorAccess`** (AWS managed)
   - Click **"Next"**
6. **Step 3 — "Name, review, and create":**
   - **Role name:** `OATHTrackerMaintainer`
   - **Description:** `Long-term role assumed by Rajiv (account 568438992037) to maintain the OATH Summons Tracker. Revoke by deleting this role.`
   - Scroll down, review the trust policy summary (it should reference `568438992037` and the external ID)
   - Click **"Create role"**
7. After creation, you'll land back on the Roles list. Click **`OATHTrackerMaintainer`** to open it.
8. Copy the **ARN** at the top — it looks like `arn:aws:iam::<arthur-account-id>:role/OATHTrackerMaintainer`
9. Send the ARN + the external ID string to Rajiv via the same secure channel used for the access key.

**What Rajiv adds to his `~/.aws/config` to use the role:**

```ini
[profile arthur-oath]
role_arn = arn:aws:iam::<arthur-account-id>:role/OATHTrackerMaintainer
external_id = oath-tracker-2026-mig
source_profile = default          # uses Rajiv's own AWS account credentials to assume the role
region = us-east-1
```

(If Rajiv's own AWS account is configured under a non-default profile, replace `default` with that profile's name.)

Verify the role works:

```bash
aws sts get-caller-identity --profile arthur-oath
# Expected:
# "Arn": "arn:aws:sts::<arthur-account-id>:assumed-role/OATHTrackerMaintainer/botocore-session-..."
```

From now on, every maintenance command (`amplify push`, `aws lambda update-function-code`, etc.) runs with `--profile arthur-oath`. **No further credential handoffs are needed from Arthur.**

**How Arthur revokes Rajiv's access (one click, anytime):**

Sign in → IAM → Roles → `OATHTrackerMaintainer` → **"Delete"** → type the role name to confirm. Done.

> **Fallback (Option B):** If for some reason the cross-account role can't be created (e.g., Arthur's account has SCPs that block `iam:AssumeRole`), Rajiv can keep using the `rajiv-admin` access key from Step 4 indefinitely. In that case: rotate the key every 90 days (IAM → Users → `rajiv-admin` → Security credentials → Create new key → delete old). Set a calendar reminder.

### Step 6 — Provide User Emails (~1 min)

Arthur sends Rajiv (in the same secure channel) the email addresses he wants for the 3 app users:

- Arthur: `__________________`
- Jackie: `__________________`
- Jelly:  `__________________`

These will be used to recreate their Cognito accounts. Each user will receive a "temporary password" email from AWS and must reset it on first login.

### Step 7 — Set Up Billing Alerts (Arthur's protection, ~3 min)

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

> Commands below use `--profile arthur-oath` (the cross-account role from Step 5). For the very first migration run, before the role is fully tested, Rajiv can substitute `--profile arthur-rajiv-admin` (the access-key profile from Step 4) — both have AdministratorAccess, so either works. Run all commands from the project root.

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
