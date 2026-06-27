# workflow
- Prefer disabling/commenting out code over deleting it, with a comment linking to the reason (e.g., link to bug tracker or issue thread) so it can be easily re-enabled later. Confidence: 0.70

# architecture
- For SQS-triggered Lambdas, handle retries within the same Lambda invocation using configurable delays (e.g., sleep/timeout between retries up to 3 attempts), rather than relying on visibility timeout redrives across separate cron invocations. Avoid using DLQs for this pattern. Confidence: 0.70
