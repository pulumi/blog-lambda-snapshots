import * as awsNative from "@pulumi/aws-native";
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

// const role = new aws.iam.Role("role", {
//   assumeRolePolicy: JSON.stringify({
//     "Version": "2012-10-17",
//     "Statement": [{
//       "Effect": "Allow",
//       "Principal": {
//         "Service": "lambda.amazonaws.com",
//       },
//       "Action": "sts:AssumeRole",
//     }],
//   }),
// });

// new aws.iam.RolePolicyAttachment("role-policy-attachment", {
//   role: role.name,
//   policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
// });

const role = new aws.iam.Role("role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(aws.iam.Principals.LambdaPrincipal),
  managedPolicyArns: [aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole]
});

const mvnOutputs = command.local.runOutput({
  command: "mvn install && mvn package",
  dir: "../../lambda/blogLambdaSnapStart",
  assetPaths: ["target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"]
});

const bucket = new aws.s3.Bucket("bucket", {
  versioning: {
    enabled: true,
  }
});

const functionCode = new aws.s3.BucketObject("function-code", {
  bucket: bucket.bucket,
  source: mvnOutputs.assets!.apply(x => x!["target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"]),
});

const func = new awsNative.lambda.Function("no-snapstart-func", {
  code: {
    s3Bucket: functionCode.bucket,
    s3Key: functionCode.key,
    s3ObjectVersion: functionCode.versionId,
  },
  role: role.arn,
  runtime: "java11",
  handler: "com.pulumi.blogLambdaSnapStart.Handler",
  timeout: 30,
});

// const classicFunc = new aws.lambda.Function("lambda", {
//   role: role.arn,
//   s3Bucket: functionCode.bucket,
//   s3Key: functionCode.key,
//   s3ObjectVersion: functionCode.versionId,
//   runtime: "java11",
//   handler: "com.pulumi.blogLambdaSnapStart.Handler",
//   timeout: 30,
// })

// export const invokearn = classicFunc.invokeArn;

const api = new aws.apigatewayv2.Api("api", {
    protocolType: "HTTP",
    routeKey: "GET /",
    target: pulumi.interpolate`arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/${func.arn}/invocations`
})

const perm2 = new aws.lambda.Permission("permission", {
  action: "lambda:InvokeFunction",
  principal: "apigateway.amazonaws.com",
  function: func.arn
})

export const apiurl = api.apiEndpoint;


// Gives our alias URL the necessary perms to be invoked without authentication"
const perm = new aws.lambda.Permission("perm", {
  action: "lambda:InvokeFunctionUrl",
  "function": func.arn,
  principal: "*",
  functionUrlAuthType: "NONE",
});

const url = new awsNative.lambda.Url("func-url", {
  targetFunctionArn: func.arn,
  authType: "NONE",
}, {
  dependsOn: perm,
});

exports.noSnapStartUrl = url.functionUrl;
exports.noSnapStartFunctionName = func.functionName;
