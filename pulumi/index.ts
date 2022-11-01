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

command.local.run({
  command: "mvn install && mvn package",
  dir: "../lambda/blogLambdaSnapStart",
});

// Unable to use awsNative.s3.Bucket because bucketName can't be used as an
// input to BucketObject. This may be because it can be undefined.
const bucket = new aws.s3.Bucket("bucket", {
  versioning: {
    enabled: true,
  }
});

const functionCode = new aws.s3.BucketObject("function-code", {
  bucket: bucket.bucket,
  source: new pulumi.asset.FileAsset("../lambda/blogLambdaSnapStart/target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"),
});

// TODO: Cannot use this resource because updating a function is broken. See:
// https://github.com/pulumi/pulumi-aws-native/issues/277
// const func = new awsNative.lambda.Function("snapstart-func", {
//   code: {
//     s3Bucket: functionCode.bucket,
//     s3Key: functionCode.key,
//     s3ObjectVersion: functionCode.versionId,
//   },
//   role: role.arn,
//   runtime: "java11",
//   handler: "com.pulumi.blogLambdaSnapStart.Handler",
// });

// new command.local.Command("publish-version", {
//   create: func.arn.apply(arn => `aws lambda publish-version --function-name ${arn} --profile ${profile}`),
//   triggers: [func],
// });


// TODO: Delete this. Keeping it until we're sure we have the native function working right.
const classicFunc = new aws.lambda.Function("classic-snapstart-func", {
  s3Bucket: functionCode.bucket,
  s3Key: functionCode.key,
  s3ObjectVersion: functionCode.versionId,
  role: role.arn,
  handler: "com.pulumi.blogLambdaSnapStart.Handler",
  runtime: "java11",
  publish: true,
});

new command.local.Command("publish-version-classic", {
  create: classicFunc.arn.apply(arn => `aws lambda publish-version --function-name ${arn} --profile ${profile}`),
  triggers: [classicFunc],
});

const profile = new pulumi.Config("aws").require("profile");


