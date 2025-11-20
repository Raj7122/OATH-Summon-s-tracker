import { Amplify } from 'aws-amplify';

// Amplify configuration for NYC OATH Summons Tracker
const amplifyConfig = {
  aws_project_region: 'us-east-1',
  aws_cognito_region: 'us-east-1',
  aws_user_pools_id: 'us-east-1_HXL5eyt3G',
  aws_user_pools_web_client_id: '5u3iqbnppofude6c0jao41pl06',
  aws_appsync_graphqlEndpoint: 'https://vp3li2qm6ffstf5gjbe5rnrs6u.appsync-api.us-east-1.amazonaws.com/graphql',
  aws_appsync_region: 'us-east-1',
  aws_appsync_authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_HXL5eyt3G',
    userPoolWebClientId: '5u3iqbnppofude6c0jao41pl06',
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