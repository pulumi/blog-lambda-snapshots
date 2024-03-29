import * as awsNative from "@pulumi/aws-native";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

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

const bucket = new aws.s3.Bucket("no-snapstart-bucket", {
  versioning: {
    enabled: true,
  }
});

const functionCode = new aws.s3.BucketObject("function-code", {
  bucket: bucket.bucket,
  source: new pulumi.asset.FileArchive("../petstore.zip"),
});

const func = new awsNative.lambda.Function("no-snapstart-func", {
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
});

const api = new aws.apigatewayv2.Api("no-snapstart-api", {
  protocolType: "HTTP",
});

const integration = new aws.apigatewayv2.Integration("integration", {
  apiId: api.id,
  integrationType: "AWS_PROXY",
  integrationUri: func.arn, // make this the alias ARN to use w/snapstart
  integrationMethod: "GET",
  payloadFormatVersion: "1.0",
  passthroughBehavior: "WHEN_NO_MATCH",
  connectionType: "INTERNET"
});

const route = new aws.apigatewayv2.Route("route", {
  apiId: api.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${integration.id}`,
});

new aws.apigatewayv2.Stage("stage", {
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
  function: func.arn,
  sourceArn: api.executionArn.apply(x => `${x}/*/*`),
});

export const apiUrl = pulumi.concat(api.apiEndpoint, "/pets");
