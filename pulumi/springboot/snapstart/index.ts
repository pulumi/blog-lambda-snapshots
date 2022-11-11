import * as pulumi from "@pulumi/pulumi";
import * as awsNative from "@pulumi/aws-native";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";

const role = new aws.iam.Role("role", {
  assumeRolePolicy: JSON.stringify({
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com",
      },
      "Action": "sts:AssumeRole",
    }],
  }),
});

new aws.iam.RolePolicyAttachment("role-policy-attachment", {
  role: role.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

const bucket = new aws.s3.Bucket("snapstart-bucket", {
  versioning: {
    enabled: true,
  }
});

const functionCode = new aws.s3.BucketObject("function-code", {
  bucket: bucket.bucket,
  source: new pulumi.asset.FileArchive("../petstore.zip"),
});

const func = new awsNative.lambda.Function("snapstart-func", {
  code: {
    s3Bucket: functionCode.bucket,
    s3Key: functionCode.key,
    s3ObjectVersion: functionCode.versionId,
  },
  role: role.arn,
  runtime: "java11",

  handler: "com.amazonaws.serverless.sample.springboot2.StreamLambdaHandler::handleRequest",
  memorySize: 1512,
  timeout: 60,
  snapStart: {
    applyOn: "PublishedVersions",
  },
});

// Function versions are not currently supported in AWS Native, so
// we need to create them via the AWS CLI.
const publishVersion = new command.local.Command("publish-version", {
  create: func.arn.apply(arn => `aws lambda publish-version --function-name ${arn}`),
  triggers: [func],
}, {
  dependsOn: func,
});

const aliasName = "v1";

const alias = new aws.lambda.Alias("alias", {
  functionName: func.arn,
  functionVersion: "1",
  name: aliasName,
}, {
  dependsOn: publishVersion,
});

const api = new aws.apigatewayv2.Api("snapstart-api", {
  protocolType: "HTTP",
});

const integration = new aws.apigatewayv2.Integration("lambdaIntegration", {
  apiId: api.id,
  integrationType: "AWS_PROXY",
  integrationUri: alias.arn,
  integrationMethod: "GET",
  payloadFormatVersion: "1.0",
  passthroughBehavior: "WHEN_NO_MATCH",
  connectionType: "INTERNET"
});

const route = new aws.apigatewayv2.Route("apiRoute", {
  apiId: api.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${integration.id}`,
});

new aws.apigatewayv2.Stage("apiStage", {
  apiId: api.id,
  name: "$default",
  routeSettings: [
    {
      routeKey: route.routeKey,
      throttlingBurstLimit: 5000,
      throttlingRateLimit: 10000,
    },
  ],
  autoDeploy: true,
}, { dependsOn: [route] });

new aws.lambda.Permission("permission", {
  action: "lambda:InvokeFunction",
  principal: "apigateway.amazonaws.com",
  function: alias.arn,
  sourceArn: api.executionArn.apply(x => `${x}/*/*`),
});

export const apiUrl = pulumi.concat(api.apiEndpoint, "/pets");
