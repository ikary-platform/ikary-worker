# @ikary/scheduler

Event-driven scheduler app. Single-pod NestJS service that emits
`DomainEventEnvelope` messages on cron schedules through the existing
`cell.events` RabbitMQ exchange. Worker consumers do the actual work.

The scheduler's job is to decide **what** needs to happen and **when**, compute
parameters (cutoff dates, time ranges, target scopes), and publish events.
It never directly modifies projection tables or runs business logic.

## Architecture

```mermaid
flowchart LR
    subgraph scheduler["apps/scheduler (single pod)"]
        RS[RetentionScheduler<br/>@Cron handlers]
        SP[SchedulerPublisher]
        JR[(ikary_scheduler_jobs)]
        RS -- "compute cutoff<br/>+ emit" --> SP
        SP -- "upsert pending /<br/>mark emitted" --> JR
    end

    subgraph rabbit["RabbitMQ"]
        EX{{cell.events<br/>topic exchange}}
    end

    subgraph worker["apps/worker (N pods)"]
        ARC[AuditRetentionConsumer]
        ANRC[AnalyticsRetentionConsumer]
        AFRC[ActivityFeedRetentionConsumer]
        RRC[ReceiptRetentionConsumer]
    end

    SP -- "publish envelope" --> EX
    EX -- "#.scheduler.retention.audit" --> ARC
    EX -- "#.scheduler.retention.analytics" --> ANRC
    EX -- "#.scheduler.retention.activity-feed" --> AFRC
    EX -- "#.scheduler.retention.consumer-receipts" --> RRC
```

## What it is

- **General-purpose scheduled task system.** Retention is the first use case,
  but the `SchedulerPublisher` supports any future cron-triggered workflow
  (digests, rollups, report generation).
- **Event emitter, not a worker.** The scheduler publishes events; the existing
  consumer framework in `apps/worker` handles execution, retries, receipts,
  and deduplication.
- **Database-backed job tracker.** Every cron tick records a row in
  `ikary_scheduler_jobs` with status `pending -> emitted | failed`, providing
  full observability of what fired, when, and whether it succeeded.
- **Scope-aware.** Job rows carry `tenant_id`, `workspace_id`, `cell_id`, and
  optional `entity_key`/`entity_id` columns, enabling UI queries at every
  level (system-wide, per-tenant, per-workspace, per-entity).

## What it is not

- **Not a task runner.** It does not execute business logic or touch projection
  tables. The worker pods consume the events and do the work.
- **Not multi-pod safe by itself.** The scheduler MUST run as a single pod
  (`replicas: 1`). `@Cron` is process-local -- two pods means two emissions.
  Deterministic `event_id` values and consumer receipt dedup provide
  belt-and-suspenders protection, but the primary guarantee is single-pod
  deployment.
- **Not a replacement for the consumer framework.** It reuses `DomainEventEnvelope`,
  the `cell.events` exchange, and the existing routing/receipt/DLX infrastructure.
  No new messaging primitives are introduced.

## Multi-pod safety

Three layers prevent duplicate work:

```mermaid
flowchart TD
    subgraph L1["Layer 1 -- Scheduler: single pod"]
        A["replicas: 1<br/>One cron tick = one event"]
    end

    subgraph L2["Layer 2 -- AMQP: competing consumers"]
        B["Named queue per consumer<br/>RabbitMQ delivers to exactly one pod"]
    end

    subgraph L3["Layer 3 -- Receipt dedup + tx rollback"]
        C["Deterministic event_id<br/>scheduler-retention.audit-2026-04-17"]
        D{"Receipt exists?"}
        E["Skip (ack)"]
        F["Run handler in transaction"]
        G{"Unique violation<br/>on receipt insert?"}
        H["Commit (delete + receipt)"]
        I["Rollback (delete undone)"]
        C --> D
        D -- "yes" --> E
        D -- "no" --> F
        F --> G
        G -- "no" --> H
        G -- "yes" --> I
    end

    L1 --> L2 --> L3
```

The critical detail: `deleteOlderThan(cutoffDate, tx)` runs **inside** the
consumer framework's transaction. If a receipt unique-constraint violation
rolls back the transaction, the delete rolls back with it.

## Retention schedule

| Cron | Event name | Default retention | Env var |
|---|---|---|---|
| `0 3 * * *` | `scheduler.retention.audit` | 2555 days (~7 years) | `RETENTION_AUDIT_DAYS` |
| `10 3 * * *` | `scheduler.retention.analytics` | 90 days | `RETENTION_ANALYTICS_DAYS` |
| `20 3 * * *` | `scheduler.retention.activity-feed` | 30 days | `RETENTION_ACTIVITY_FEED_DAYS` |
| `30 3 * * *` | `scheduler.retention.consumer-receipts` | 7 days | `RETENTION_CONSUMER_RECEIPTS_DAYS` |

Staggered cron times avoid concurrent large deletes across tables.
Set any env var to empty/unset to disable that target's cron.

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | -- | Postgres connection string (shared with worker) |
| `RABBITMQ_URL` | no | `amqp://guest:guest@localhost:5672` | RabbitMQ connection |
| `RABBITMQ_EXCHANGE` | no | `cell.events` | Topic exchange name |
| `RABBITMQ_DLX` | no | `cell.events.dlx` | Dead-letter exchange |
| `RETENTION_AUDIT_DAYS` | no | `2555` | Days to keep audit entries (null = disabled) |
| `RETENTION_ANALYTICS_DAYS` | no | `90` | Days to keep analytics buckets |
| `RETENTION_ACTIVITY_FEED_DAYS` | no | `30` | Days to keep activity entries |
| `RETENTION_CONSUMER_RECEIPTS_DAYS` | no | `7` | Days to keep consumer receipts |
| `PORT` | no | `3003` | HTTP port (health endpoint) |
| `LOG_PRETTY` | no | `false` | Pretty-print logs (dev only) |

## Event naming convention

```
scheduler.<category>.<target>
```

Examples:
- `scheduler.retention.audit` -- retention category, audit target
- `scheduler.digest.notifications` -- future digest category
- `scheduler.rollup.analytics-weekly` -- future rollup category

Consumer binding patterns use `#.scheduler.<category>.<target>` to match
regardless of the scope prefix in the routing key.

## Job tracking

Every cron tick records a row in `ikary_scheduler_jobs`:

```
pending  ->  emitted   (publish succeeded)
         ->  failed    (publish failed, error_message recorded)
```

The row `id` is the deterministic event ID (`scheduler-retention.audit-2026-04-17`).
On same-day restart, `ON CONFLICT (id) DO UPDATE` upserts instead of duplicating.

Scope columns enable queries at every level:

```sql
-- System-wide jobs (retention, etc.)
SELECT * FROM ikary_scheduler_jobs WHERE tenant_id = '_scheduler';
-- All jobs for a tenant
SELECT * FROM ikary_scheduler_jobs WHERE tenant_id = 'tenant-123';
-- Jobs targeting a specific entity
SELECT * FROM ikary_scheduler_jobs WHERE entity_key = 'invoice' AND entity_id = 'inv-456';
```

## Adding a new scheduled task

1. **Scheduler side:** add a `@Cron` method in `src/retention/` or a new
   folder under `src/` (e.g. `src/digest/digest.scheduler.ts`)
2. **Worker side:** add a thin consumer in the relevant lib
3. **Wire:** add the consumer to `apps/worker/src/app.module.ts` `CONSUMER_PROVIDERS`
4. **Event name:** follow `scheduler.<category>.<target>`

## Running locally

```bash
# Start dependencies
docker compose up -d   # Postgres + RabbitMQ

# Apply migrations
pnpm --filter @ikary/worker migrate

# Start both apps
pnpm --filter @ikary/scheduler start:dev
pnpm --filter @ikary/worker start:dev
```

## Folder structure

```
apps/scheduler/
  migrations/v0.1.0/
    001_scheduler_create_jobs.pg.sql   # Job tracking table + indexes
  src/
    config/env.ts                      # Zod-validated env vars
    db/schema.ts                       # Kysely table types
    health/                            # GET /health endpoint
    retention/
      retention.scheduler.ts           # @Cron handlers (4 targets)
      retention.scheduler.spec.ts
    scheduler/
      scheduler-jobs.repository.ts     # Job CRUD (upsert, mark emitted/failed)
      scheduler.publisher.ts           # Envelope builder + AMQP publish + job tracking
    app.module.ts                      # Root module
    database.module.ts                 # @Global DatabaseService
    scheduler.module.ts                # Reusable scheduler core
    main.ts                            # Bootstrap
```
