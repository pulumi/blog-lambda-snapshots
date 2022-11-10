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

const mvnOutputs = command.local.runOutput({
  command: "mvn install && mvn package",
  dir: "../../../lambda/blogLambdaSnapStart",
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

const func = new awsNative.lambda.Function("hello-world-no-snapstart-func", {
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

exports.functionUrl = url.functionUrl;
