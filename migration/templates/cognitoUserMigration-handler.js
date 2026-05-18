/**
 * Cognito User Migration trigger.
 * Paste this body into amplify/backend/function/cognitoUserMigration/src/index.js
 * AFTER `amplify add function` creates the Lambda scaffold.
 *
 * This Lambda runs in Arthur's account and authenticates users against the OLD
 * pool (in Raj's account) on first sign-in. Cognito then auto-creates the user
 * in the new pool with the password they just typed — no password reset needed.
 *
 * Required env vars (set via aws lambda update-function-configuration after deploy):
 *   OLD_POOL_ID                       e.g. us-east-1_HXL5eyt3G
 *   OLD_POOL_CLIENT_ID                e.g. 5u3iqbnppofude6c0jao41pl06
 *   OLD_POOL_REGION                   e.g. us-east-1
 *   OLD_POOL_AWS_ACCESS_KEY_ID        from migration/scripts/08-create-old-pool-reader.sh
 *   OLD_POOL_AWS_SECRET_ACCESS_KEY    from migration/scripts/08-create-old-pool-reader.sh
 *
 * Trigger sources Cognito will invoke this for:
 *   - UserMigration_Authentication       (sign-in flow with username + password)
 *   - UserMigration_ForgotPassword       (forgot-password flow, no password)
 *
 * For sign-in we authenticate against the old pool and merge attributes.
 * For forgot-password we lookup the user attributes only (no auth).
 */

const {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const oldPoolClient = new CognitoIdentityProviderClient({
  region: process.env.OLD_POOL_REGION,
  credentials: {
    accessKeyId: process.env.OLD_POOL_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.OLD_POOL_AWS_SECRET_ACCESS_KEY,
  },
});

const OLD_POOL_ID = process.env.OLD_POOL_ID;
const OLD_POOL_CLIENT_ID = process.env.OLD_POOL_CLIENT_ID;

function pickAttrs(userAttrs) {
  const out = {};
  for (const a of userAttrs ?? []) {
    if (a.Name === 'email') out.email = a.Value;
    if (a.Name === 'email_verified') out.email_verified = a.Value;
  }
  out.email_verified = 'true'; // user verified during initial pool sign-up
  return out;
}

async function authenticateAgainstOld(username, password) {
  const cmd = new AdminInitiateAuthCommand({
    UserPoolId: OLD_POOL_ID,
    ClientId: OLD_POOL_CLIENT_ID,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
  // Will throw NotAuthorizedException on bad password — Cognito treats that
  // as "user not migrated" and sign-in fails normally.
  await oldPoolClient.send(cmd);
}

async function lookupOldUser(username) {
  const cmd = new AdminGetUserCommand({
    UserPoolId: OLD_POOL_ID,
    Username: username,
  });
  const res = await oldPoolClient.send(cmd);
  return res.UserAttributes;
}

exports.handler = async (event) => {
  console.log('UserMigration trigger:', JSON.stringify({
    triggerSource: event.triggerSource,
    userName: event.userName,
  }));

  try {
    if (event.triggerSource === 'UserMigration_Authentication') {
      await authenticateAgainstOld(event.userName, event.request.password);
      const oldAttrs = await lookupOldUser(event.userName);
      event.response.userAttributes = pickAttrs(oldAttrs);
      event.response.finalUserStatus = 'CONFIRMED';
      event.response.messageAction = 'SUPPRESS';
      return event;
    }

    if (event.triggerSource === 'UserMigration_ForgotPassword') {
      const oldAttrs = await lookupOldUser(event.userName);
      event.response.userAttributes = pickAttrs(oldAttrs);
      event.response.messageAction = 'SUPPRESS';
      return event;
    }

    throw new Error(`Unsupported trigger source: ${event.triggerSource}`);
  } catch (err) {
    // Bad password / user not in old pool -> let Cognito show "User does not exist"
    console.error('Migration failed:', err.name, err.message);
    throw err;
  }
};
