import * as awsNative from "@pulumi/aws-native";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
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

// const mvnOutputs = command.local.runOutput({
//   command: "mvn install && mvn package",
//   dir: "../../lambda/blogLambdaSnapStart",
//   assetPaths: ["target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"]
// });

const bucket = new aws.s3.Bucket("bucket", {
  versioning: {
    enabled: true,
  }
});

const functionCode = new aws.s3.BucketObject("function-code", {
  bucket: bucket.bucket,
  source: new pulumi.asset.FileArchive("../../petstore.zip"),
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

  //handler: "com.pulumi.blogLambdaSnapStart.Handler",
  // timeout: 30,
});


// Gives our alias URL the necessary perms to be invoked without authentication"
// const perm = new aws.lambda.Permission("perm", {
//   action: "lambda:InvokeFunctionUrl",
//   "function": func.arn,
//   principal: "apigateway.amazonaws.com",
//   functionUrlAuthType: "NONE",
// });



//api.executionArn.apply(x => `${x}*/*`),

// Works:
// new aws.lambda.Permission("api-gateway-perm", {
//   action: "lambda:InvokeFunction",
//   function: func.arn,
//   principal: "apigateway.amazonaws.com",
//   sourceArn: api.executionArn.apply(x => `${x}*/*`),
// });



// const url = new awsNative.lambda.Url("func-url", {
//   targetFunctionArn: func.arn,
//   authType: "NONE",
// }, {
//   dependsOn: perm,
// });

const api = new aws.apigatewayv2.Api("snapstart-api", {
  protocolType: "HTTP",
});

const integration = new aws.apigatewayv2.Integration("lambdaIntegration", {
  apiId: api.id,
  integrationType: "AWS_PROXY",
  integrationUri: func.arn, // make this the alias ARN to use w/snapstart
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

const stage = new aws.apigatewayv2.Stage("apiStage", {
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

const perm2 = new aws.lambda.Permission("permission", {
  action: "lambda:InvokeFunction",
  principal: "apigateway.amazonaws.com",
  function: func.arn,
  sourceArn: api.executionArn.apply(x => `${x}/*/*`),
});

export const apiUrl = api.apiEndpoint;

// exports.noSnapStartUrl = url.functionUrl;
// exports.noSnapStartFunctionName = func.functionName;
