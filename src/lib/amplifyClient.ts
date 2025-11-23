import { Amplify } from 'aws-amplify';

// Amplify v6 configuration for NYC OATH Summons Tracker
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_HXL5eyt3G',
      userPoolClientId: '5u3iqbnppofude6c0jao41pl06',
    }
  },
  API: {
    GraphQL: {
      endpoint: 'https://vp3li2qm6ffstf5gjbe5rnrs6u.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
      defaultAuthMode: 'userPool',
    },
  },
};

Amplify.configure(amplifyConfig);

export default Amplify;