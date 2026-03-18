import { Amplify } from 'aws-amplify';

// Amplify v6 configuration for NYC OATH Summons Tracker
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_HXL5eyt3G',
      userPoolClientId: '5u3iqbnppofude6c0jao41pl06',
      identityPoolId: 'us-east-1:aac0e8b4-29f1-4a87-966c-c06b8d22adb9',
    }
  },
  API: {
    GraphQL: {
      endpoint: 'https://vp3li2qm6ffstf5gjbe5rnrs6u.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
      defaultAuthMode: 'userPool' as const,
    },
  },
  Storage: {
    S3: {
      bucket: 'oath-evidence-files-dev',
      region: 'us-east-1',
    },
  },
});

export default Amplify;