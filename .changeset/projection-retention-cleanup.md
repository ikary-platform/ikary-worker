---
"@ikary/worker-audit": minor
"@ikary/worker-analytics": minor
"@ikary/worker-activity-feed": minor
"@ikary/worker-consumer": minor
---

Expose **retention primitives** on every table this repo writes unbounded
rows into. Each lib declares its retention intent + a DB delete method;
this repo does not schedule or run any sweep.

Scheduling is a separate concern — a dedicated `ikary-scheduler` app
(outside this repo, post-`ikary-worker-0.1.0`) will consume these specs
and orchestrate deletes safely across multi-pod deployments. Running
`@Cron` inside a worker app would fire N simultaneous sweeps (one per
pod), which is the class of problem a leader-elected scheduler solves.

## Spec per lib

| Package | Repo method | Default retention | Filter column |
| ------- | ----------- | ----------------- | ------------- |
| `@ikary/worker-audit`         | `AuditRepository.deleteOlderThan(Date)`            | `retentionDays: 2555` (~7y) | `occurred_at` |
| `@ikary/worker-analytics`     | `AnalyticsRepository.deleteOlderThan(Date)`        | `retentionDays: 90`          | `bucket_start` |
| `@ikary/worker-activity-feed` | `ActivityFeedRepository.deleteOlderThan(Date)`     | `retentionDays: 30`          | `occurred_at` |
| `@ikary/worker-consumer`      | `ConsumerReceiptsRepository.deleteOlderThan(Date)` | `receiptRetentionDays: 7`    | `received_at` |

`retentionDays` / `receiptRetentionDays` accept `number | null`. `null`
signals "externally managed" — the scheduler skips this lib's sweep.

`ikary_event_consumer_offsets` is intentionally excluded from the spec:
deleting a per-aggregate offset row would break gap detection if the
aggregate reactivates.

## What this repo does NOT do

- No `@Cron` decorator anywhere.
- No `@nestjs/schedule` peer dep on any of these libs.
- No cleanup service classes.

The spec sits in the config schema (intent) + the repository (primitive).
The scheduler app reads both and owns the "when".
