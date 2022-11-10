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
  // source: mvnOutputs.assets!.apply(x => x!["target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"]),
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

  // handler: "com.pulumi.blogLambdaSnapStart.Handler",
  // timeout: 30,
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

new aws.lambda.Alias("alias", {
  functionName: func.arn,
  functionVersion: "1",
  name: aliasName,
}, {
  dependsOn: publishVersion,
});

// Gives our alias URL the necessary perms to be invoked without authentication"
const perm = new aws.lambda.Permission("perm", {
  action: "lambda:InvokeFunctionUrl",
  "function": func.functionName.apply(name => `${name}:${aliasName}`),
  principal: "*",
  functionUrlAuthType: "NONE",
});

const url = new awsNative.lambda.Url("func-url", {
  targetFunctionArn: func.arn,
  qualifier: aliasName,
  authType: "NONE",
}, {
  dependsOn: perm,
});

exports.snapStartUrl = url.functionUrl;
exports.snapStartFunctionName = func.functionName;

const api = new aws.apigatewayv2.Api("snapstart-api", {
  protocolType: "HTTP",
  target: func.arn,
});

// Imported version from SAM:
// const sam_gateway = new aws.apigatewayv2.Api("sam-gateway", {
//   name: "jkodroff-test",
//   protocolType: "HTTP",
//   tags: {
//       "httpapi:createdBy": "SAM",
//   },
//   version: "1.0",
// }, {
//   protect: true,
// });

// const integration = new aws.apigatewayv2.Integration("snapstart-integration", {
//   apiId: api.id,
//   integrationType: "AWS_PROXY",
//   connectionType: "INTERNET",
//   integrationMethod: "GET",
//   integrationUri: func.arn,
//   passthroughBehavior: "WHEN_NO_MATCH",
// });

// const route = new aws.apigatewayv2.Route("snapstart-route", {
//   apiId: api.id,
//   routeKey: "ANY /{proxy+}",
//   target: integration.id.apply(x => `integrations/${x}`),
// });

// const apiGwRole = new aws.iam.Role("api-gw-role", {
//   assumeRolePolicy: JSON.stringify({
//     "Version": "2012-10-17",
//     "Statement": [{
//       "Effect": "Allow",
//       "Principal": {
//         "Service": "apigateway.amazonaws.com",
//       },
//       "Action": "sts:AssumeRole",
//     }],
//   }),
// });

// new aws.iam.RolePolicyAttachment("api-gw-role-policy-attachment", {
//   role: apiGwRole.name,
//   policyArn: "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs",
// });

// const account = new aws.apigateway.Account("snapstart-api-gw-account", {
//   cloudwatchRoleArn: apiGwRole.arn,
// });

// const logGroup = new aws.cloudwatch.LogGroup("snapstart-api-gw-access",
//   // : pulumi.interpolate`/aws/lambda/${func.functionName}`
//   name: pulumi.interpolate`/aws/lambda/${func.functionName}`
// );

// const stage = new aws.apigatewayv2.Stage("snapstart-stage", {
//   apiId: api.id,
//   routeSettings: [{
//     routeKey: route.routeKey,
//     throttlingBurstLimit: 1,
//     throttlingRateLimit: 0.5,
//   }],
//   autoDeploy: true,
//   defaultRouteSettings:
//   // accessLogSettings: {
//   //   destinationArn: logGroup.arn,
//   //   format: "$context.identity.sourceIp $context.identity.caller $context.identity.user [$context.requestTime] $context.httpMethod $context.resourcePath $context.protocol $context.status $context.responseLength $context.requestId $context.extendedRequestId"
//   // }
// });

new aws.lambda.Permission("api-gateway-perm", {
  action: "lambda:InvokeFunction",
  function: func.arn,
  principal: "apigateway.amazonaws.com",
  sourceArn: api.executionArn.apply(x => `${x}*/*`),
});

// exports.apiGwEndpoint = pulumi.concat(api.apiEndpoint, "/", stage.name, "/pets");