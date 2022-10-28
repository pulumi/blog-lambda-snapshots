import * as pulumi from "@pulumi/pulumi";
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

new aws.lambda.Function("streaming-func", {
  code: new pulumi.asset.FileArchive("../lambda/blogLambdaSnapStart/target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"),
  role: role.arn,
  handler: "com.pulumi.blogLambdaSnapStart.Handler",
  runtime: "java11",
  publish: true,
});