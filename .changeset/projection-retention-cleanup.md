---
"@ikary/worker-audit": minor
"@ikary/worker-analytics": minor
"@ikary/worker-activity-feed": minor
"@ikary/worker-consumer": minor
---

Add daily retention cleanup to every table this repo writes unbounded rows
into. Each job is a thin `@Cron`-scheduled service with a single
`retentionDays` knob on the owning module's config.

## Defaults

| Package | Table | Default window | Column |
| ------- | ----- | -------------- | ------ |
| `@ikary/worker-audit`         | `ikary_audit_entries`           | **2555 days (~7 years)** | `occurred_at` |
| `@ikary/worker-analytics`     | `ikary_analytics_buckets_hourly` | **90 days**             | `bucket_start` |
| `@ikary/worker-activity-feed` | `ikary_activity_entries`        | **30 days**             | `occurred_at` |
| `@ikary/worker-consumer`      | `ikary_event_consumer_receipts` | **7 days**              | `received_at` |

Schedules are staggered (03:10 → 03:20 → 03:30 → 04:00 UTC) so the jobs
don't all hit the database in the same instant.

## Configuration

Each projection module accepts an explicit override:

```ts
WorkerAuditModule.register({
  databaseProviderToken: DatabaseService,
  retentionDays: 365,      // or `null` to disable cleanup
})
```

The consumer framework exposes the same knob under `ConsumerModule.register`
options as `receiptRetentionDays` (named specifically to signal it only
applies to the receipts table — not the offsets table, which is
deliberately not cleaned up because it would break gap detection).

Passing `null` disables cleanup for that lib: the `@Cron` still registers
but every run exits immediately, keeping the set of scheduled jobs
auditable regardless of environment.

## Design notes

- Filtering uses `occurred_at` / `bucket_start` / `received_at` (event
  time, bucket time, receipt write time) — never `recorded_at`
  (projection write time). This prevents a backfill worker that catches
  up after downtime from silently deleting the rows it just wrote.
- The `ikary_event_consumer_offsets` table is intentionally NOT cleaned
  up. Deleting a dormant aggregate's last-version row would break gap
  detection when the aggregate reactivates.
- `retentionDays` must be a positive integer; `null` disables. `0` and
  negatives are rejected at the Zod boundary.
- Cleanup failures log and return 0 — they do not crash the pod. The
  next cron fire tries again.

## Dependencies

Each affected lib now lists `@nestjs/schedule` as a peer dependency
(the worker app already declared it at `^4.0.0`).
