# coding-style
- Prefer percentage-based thresholds over hard-coded absolute numbers when the input size is variable (e.g., "top 60%" rather than "top 30"), so filter behavior scales with data volume. Confidence: 0.70
- Prefer descriptive, order-agnostic names for pipeline stage/tag identifiers (e.g., `yoe_filter`, `ai_evaluation`) over sequentially-numbered prefixes (e.g., `3_blocked_companies`, `6b_yoe_filter`). Sequential numbering breaks when stages are inserted, removed, or reordered later. Confidence: 0.85
- Prefer logging individually removed/filtered items (with the reason or score that caused removal) during filtering operations, not just aggregate counts, for auditability and testing. Confidence: 0.70

# tooling
- Prefer using MCP servers as the interface to external services (e.g., databases) rather than raw connection strings or direct CLI clients like psql. Confidence: 0.70

# workflow
- Prefer disabling/commenting out code over deleting it, with a comment linking to the reason (e.g., link to bug tracker or issue thread) so it can be easily re-enabled later. Confidence: 0.70

# architecture
- For SQS-triggered Lambdas, handle retries within the same Lambda invocation using configurable delays (e.g., sleep/timeout between retries up to 3 attempts), rather than relying on visibility timeout redrives across separate cron invocations. Avoid using DLQs for this pattern. Confidence: 0.70
- Use a single SQS queue and a single poster Lambda that dispatches to the correct platform handler (linkedin/twitter/reddit) based on a `platform` field in the message payload, rather than creating separate queues and Lambdas per platform. Confidence: 0.70
- Prefer using LLMs strictly for structured extraction (e.g., pulling required/preferred skills from a job description) and keep all judgment/decision logic in deterministic business code (e.g., skill-matching ratios, relevance thresholds). Do not ask the LLM to decide whether something is a match. Confidence: 0.65
- Questions overlapping/redundant functionality. Prefers consolidating or extending existing mechanisms over layering new features that duplicate what is already covered (e.g., an auto-derived filter that overlaps with a manually configured one). Confidence: 0.65

# observability

- Prefers a database-level stage/phase identifier field (e.g., `exit_stage`) on run-audit tables, populated at every early-exit point in multi-stage pipelines, so developers can query which filter or phase caused a run to terminate — not just log messages, but queryable structured data. Confidence: 0.80

# defensive-coding

- Prefers checking for empty results after every filter stage in a data pipeline (not just at the final stage), with an immediate exit and logged reason including the stage identifier, rather than letting empty arrays silently cascade to subsequent stages. Confidence: 0.80
