# blog-lambda-snapshots

This repository contains code to create 2 simple AWS Lambda functions in Java: one with SnapStart enabled (in the `pulumi/snapstart` directory) and one without SnapStart enabled (in the `pulumi/no-snapstart` directory).

This code can be modified to benchmark against a function of your choosing by modifying this line:

```typescript
source: mvnOutputs.assets!.apply(x => x!["target/blogLambdaSnapStart-1.0-SNAPSHOT.jar"]),
```

to something like:

```typescript
source: source: new pulumi.asset.FileArchive("path/to/file/jar"),
```

Be sure to include all necessary dependencies. For more information on packaging Java functions for use with AWS Lambda, see [Deploy Java Lambda functions with .zip or JAR file archives](https://docs.aws.amazon.com/lambda/latest/dg/java-package.html).

## Deploying the Functions

To deploy the function with SnapStart:

```bash
cd pulumi/snapstart && pulumi up -y
```

To deploy the function without SnapStart:

```bash
cd pulumi/no-snapstart && pulumi up -y
```

## Running benchmarks

To run performance benchmarks with [Apache ab](https://httpd.apache.org/docs/2.4/programs/ab.html) (installed by default on macOS), run the following:

```bash
cd pulumi/snapstart
ab -n 1000 -c 50 $(pulumi stack output snapStartUrl)
```

or:

```bash
cd pulumi/no-snapstart
ab -n 1000 -c 50 $(pulumi stack output noSnapStartUrl)
```

## Querying benchmark metrics

To retrieve metrics on SnapStart performance improvements, in the CloudWatch console, go to Log Insights, select the log group for one of the functions (either SnapStart or no SnapStart), and run the following query:

```sql
filter @type = "REPORT"
| parse @log /\d+:\/aws\/lambda\/(?<function>.*)/
| parse @message /Restore Duration: (?<restoreDuration>.*) ms/ | stats
count(*) as invocations, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 50) as p50, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 90) as p90, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 99) as p99, pct(@duration+coalesce(@initDuration,0)+coalesce(restoreDuration,0), 99.9) as p99.9 group by function, (ispresent(@initDuration) or ispresent(restoreDuration)) as coldstart
| sort by coldstart desc
```
