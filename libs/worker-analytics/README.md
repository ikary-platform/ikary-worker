# @ikary/worker-analytics

## Export Surface

- **Shared root (`@ikary/worker-analytics`)** — browser-safe Zod schemas and the pure `classifyAnalyticsEvent` function. Reuse in dashboards, UIs, any code that needs to label events.
- **Server (`@ikary/worker-analytics/server`)** — `WorkerAnalyticsModule`, `AnalyticsService`, `AnalyticsRepository`, `AnalyticsConsumer`, Kysely schema types, DI tokens.

## Purpose

Ships an OOTB consumer that classifies every event (`page`, `api`, `workflow`, `entity`, `other`) and maintains an hourly aggregation bucket table via `INSERT ... ON CONFLICT DO UPDATE SET event_count = event_count + 1`. One row per hour × scope × event × http-method × status-class.

## Installation

```json
"@ikary/worker-analytics": "workspace:*"
```

## Migrations

Two SQL files in `migrations/v0.1.0/`:
- `001_worker_analytics_create_buckets.pg.sql` — the bucket table (PK spans all scope dimensions using empty-string sentinels for nullable ones, which makes `ON CONFLICT` work under `NULL <> NULL` semantics).
- `002_worker_analytics_create_indexes.pg.sql` — three dashboard-tuned indexes (tenant-time-pattern, workspace-time-pattern, tenant-time-domain).

## Configuration

```ts
WorkerAnalyticsModule.register({
  databaseProviderToken: DatabaseService,
  retentionDays: 90,                       // default; see Retention below
})
```

Host DB schema must include `ikary_analytics_buckets_hourly`:
```ts
type AppDatabase =
  & ConsumerDatabaseSchema
  & WorkerAnalyticsDatabaseSchema
  & /* your own tables */ ;
```

## Retention

This module declares retention **intent** and exposes a DB **primitive**
— it does not schedule or perform cleanup itself.

- **Config:** `retentionDays` (default `90`) — the declared policy an
  external scheduler reads.
- **Primitive:** `AnalyticsRepository.deleteOlderThan(date)` — deletes
  buckets whose `bucket_start` is before the given date and returns the
  count of deleted rows.

A dedicated `ikary-scheduler` app (separate repo, post-v0.1.0) will
consume the spec and orchestrate deletes safely across multi-pod
deployments.

| Setting | Behaviour |
| ------- | --------- |
| `retentionDays: <positive integer>` | Scheduler deletes buckets older than that many days. |
| `retentionDays: null`               | Scheduler skips this lib's sweep. |
| *omitted*                           | Default: **90 days** — dashboards typically look back a quarter; older buckets either get rolled up or are statistical noise. |

The scheduler should filter on `bucket_start` (the hour being tracked),
not `updated_at` (the last time the bucket was incremented), so a
long-running event hitting an old bucket does not reset its retention
clock.

## Usage in NestJS

```ts
@Module({
  imports: [
    WorkerAnalyticsModule.register({ databaseProviderToken: DatabaseService }),
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: [
        { provide: CONSUMER, useClass: AnalyticsConsumer, multi: true },
      ],
    }),
  ],
})
export class AppModule {}
```

## Classifier — how events are labelled

The pure `classifyAnalyticsEvent(input)` function maps every envelope to:

| Field | Example values |
|---|---|
| `observabilityFamily` | `page` / `api` / `workflow` / `entity` / `other` |
| `observabilityAction` | `created` / `completed` / `failed` / `viewed` / … (last segment of event name) |
| `analyticsPattern` | `page.*` / `api.*` / `workflow.*` / `entity.*` / `other.*` |
| `businessDomain` | `invoice` / `customer` / `sequence` / … (slugified entity type, falls back to the first event-name segment) |
| `httpMethod` | `GET` / `POST` / … (from `event.data.method`, validated) |
| `statusClass` | `1xx` / `2xx` / `3xx` / `4xx` / `5xx` (from `event.data.statusCode` or `.status`) |

Family resolution priority (first match wins): `page` > `api` > `workflow` > `entity` (via `*.entity.*` path OR `.created|.updated|.deleted_soft|.rolled_back` suffix) > `other`.

## Failure counting

A bucket's `failure_count` is incremented when:
- the event name ends in `.failed`, OR
- the derived `statusClass` is `4xx` or `5xx`.

Otherwise `failure_count` stays unchanged.

## Example query (read side)

```ts
// Errors per hour in the last 24h for a tenant
await db
  .selectFrom('ikary_analytics_buckets_hourly')
  .select(['bucket_start', 'event_name', 'event_count', 'failure_count'])
  .where('tenant_id', '=', tenantId)
  .where('analytics_pattern', '=', 'api.*')
  .where('bucket_start', '>=', oneDayAgo)
  .orderBy('bucket_start', 'desc')
  .execute();
```

## Security / Isolation Notes

- The classifier and repository are tenant-scoped via the envelope's `tenant_id`. Aggregate rows are keyed on `tenant_id` — never mix aggregates from different tenants.
- Retention — see the [Retention](#retention) section. Default is 90 days; override `retentionDays` to match your dashboard window.

## Versioning

Part of the ikary-worker fixed-group. Releases together with `@ikary/worker`.

## Breaking Changes

Changes to `AnalyticsConsumer.name`/`eventTypes` rebind the queue in prod — treat as breaking.
