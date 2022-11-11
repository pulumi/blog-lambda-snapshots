# blog-lambda-snapshots

This repository contains code to deploy 2 AWS Lambda functions, each with 2 versions: with and without SnapStart enabled:

- `lambda/` contains the code for the simple Hello World function.
- `pulumi/hello-world/snapstart` and `pulumi/hello-world/no-snapstart` contain Pulumi code to deploy the Hello World function with and without SnapStart enabled, respectively.
- `pulumi/springboot/snapstart` and `pulumi/springboot/no-snapstart` contain Pulumi code to deploy a Spring Boot 2 Lambda with and without SnapStart enabled, respectively.
- `pulumi/springboot/petstore.zip` contains the code for the Spring Boot Lambda function, taken from: <https://github.com/awslabs/aws-serverless-java-container/tree/main/samples/springboot2/pet-store>

## Deploying the Functions

To deploy one of the stacks:

```bash
cd pulumi/springboot/snapstart && pulumi up -y
```

Substitute `hello-world` for `springboot` above for the Hello World function. Substitute `no-snapstart` for the version of the function without SnapStart enabled.

## Running benchmarks

To run performance benchmarks with [Apache ab](https://httpd.apache.org/docs/2.4/programs/ab.html) (installed by default on macOS) for the Hello World function, run the following command in the same directory as the Pulumi stack you want to test:

```bash
ab -n 1000 -c 50 $(pulumi stack output functionUrl)
```

For the Spring Boot function, the command is:

```bash
ab -n 1000 -c 50 $(pulumi stack output apiUrl)
```

## Querying benchmark metrics

To retrieve metrics on SnapStart performance improvements, in the CloudWatch console, go to Log Insights, select the log group for the function you're testing, and run the following query:

```sql
filter @type = "REPORT"
| parse @log /\d+:\/aws\/lambda\/(?<function>.*)/
| parse @message /Restore Duration: (?<restoreDuration>.*) ms/ | stats
count(*) as invocations, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 50) as p50, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 90) as p90, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 99) as p99, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 99.9) as p99.9 group by function, (ispresent(@initDuration) or ispresent(restoreDuration)) as coldstart
| sort by coldstart desc
```

In testing, the Hello World function yielded about a 40% improvement, whereas the Spring Boot function yielded about a 1200% improvement.
