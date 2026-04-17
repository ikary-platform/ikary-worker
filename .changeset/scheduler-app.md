---
"@ikary/scheduler": minor
"@ikary/worker": minor
"@ikary/worker-audit": minor
"@ikary/worker-analytics": minor
"@ikary/worker-activity-feed": minor
"@ikary/worker-consumer": minor
---

Add event-driven scheduler app and per-lib retention consumers.

**Scheduler (`apps/scheduler`):** single-pod NestJS app that emits
`DomainEventEnvelope` messages on cron schedules. Job tracking via
`ikary_scheduler_jobs` table with scope columns (`tenant_id`,
`workspace_id`, `cell_id`, `entity_key`, `entity_id`).

**Retention consumers:** each projection lib (`worker-audit`,
`worker-analytics`, `worker-activity-feed`) and the consumer framework
(`worker-consumer`) gain a thin retention consumer that calls
`deleteOlderThan(cutoffDate, tx)` inside the framework's transaction.

**Repository updates:** all four `deleteOlderThan` methods now accept an
optional `client` parameter so deletes ride on the consumer transaction
— receipt deduplication rolls back the delete on duplicate events.
