import { Amplify } from 'aws-amplify';
import config from '../amplifyconfiguration.json';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: config.aws_user_pools_id,
      userPoolClientId: config.aws_user_pools_web_client_id,
      identityPoolId: config.aws_cognito_identity_pool_id,
    },
  },
  API: {
    GraphQL: {
      endpoint: config.aws_appsync_graphqlEndpoint,
      region: config.aws_appsync_region,
      defaultAuthMode: 'userPool' as const,
    },
  },
  Storage: {
    S3: {
      bucket: config.aws_user_files_s3_bucket,
      region: config.aws_user_files_s3_bucket_region,
    },
  },
});

export default Amplify;
