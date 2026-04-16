# @ikary/worker-activity-feed

## Export Surface

- **Shared root (`@ikary/worker-activity-feed`)** — browser-safe Zod schemas (`activityEntrySchema`, `ActivityEntry`).
- **Server (`@ikary/worker-activity-feed/server`)** — `WorkerActivityFeedModule`, `ActivityFeedService`, `ActivityFeedRepository`, `ActivityFeedConsumer`, Kysely schema types, DI tokens.

## Purpose

OOTB user-facing activity-feed consumer. Every `DomainEventEnvelope` is written as a feed row with:
- **title** — the raw `event_name` (e.g. `invoice.created`, `workspace.cell.created`)
- **summary** — `JSON.stringify(event.data)` truncated to 240 chars, or `null` when data is empty
- the full **payload** stored as JSONB
- standard scope/actor/resource fields for filtering

Idempotent on `event_id`. Subscribe pattern is `'#'` (catch-all) — downstream UIs filter at query time. A future v0.2 can add a Zod-validated allow-list in the module config.

## Installation

```json
"@ikary/worker-activity-feed": "workspace:*"
```

## Migrations

`migrations/v0.1.0/001_worker_activity_feed_create_entries.pg.sql` — creates `ikary_activity_entries` plus three time-ordered indexes (tenant, workspace, actor).

## Configuration

```ts
WorkerActivityFeedModule.register({
  databaseProviderToken: DatabaseService,
  retentionDays: 30,                       // default; see Retention below
})
```

Host DB schema:
```ts
type AppDatabase =
  & ConsumerDatabaseSchema
  & WorkerActivityFeedDatabaseSchema
  & /* your own tables */ ;
```

## Retention

This module declares retention **intent** and exposes a DB **primitive**
— it does not schedule or perform cleanup itself.

- **Config:** `retentionDays` (default `30`) — the declared policy an
  external scheduler reads.
- **Primitive:** `ActivityFeedRepository.deleteOlderThan(date)` — deletes
  rows whose `occurred_at` is before the given date and returns the count
  of deleted rows.

A dedicated `ikary-scheduler` app (separate repo, post-v0.1.0) will
consume the spec and orchestrate deletes safely across multi-pod
deployments.

| Setting | Behaviour |
| ------- | --------- |
| `retentionDays: <positive integer>` | Scheduler deletes rows older than that many days. |
| `retentionDays: null`               | Scheduler skips this lib's sweep. |
| *omitted*                           | Default: **30 days** — the feed is a "recent activity" view; older items aren't useful for the timeline. |

The scheduler should filter on `occurred_at` so that events backfilled
by a catch-up worker after downtime are not deleted before they have been
shown.

## Usage in NestJS

```ts
@Module({
  imports: [
    WorkerActivityFeedModule.register({ databaseProviderToken: DatabaseService }),
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: [
        { provide: CONSUMER, useClass: ActivityFeedConsumer, multi: true },
      ],
    }),
  ],
})
export class AppModule {}
```

## Example query (read side)

```ts
// Recent activity for a workspace
await db
  .selectFrom('ikary_activity_entries')
  .selectAll()
  .where('tenant_id', '=', tenantId)
  .where('workspace_id', '=', workspaceId)
  .orderBy('occurred_at', 'desc')
  .limit(50)
  .execute();

// Everything an actor did
await db
  .selectFrom('ikary_activity_entries')
  .selectAll()
  .where('tenant_id', '=', tenantId)
  .where('actor_id', '=', userId)
  .orderBy('occurred_at', 'desc')
  .limit(50)
  .execute();
```

## Security / Isolation Notes

- Payload is stored verbatim. If events may carry PII that shouldn't leak into a user-facing feed, redact at the producer before publishing.
- Retention — see the [Retention](#retention) section. Default is 30 days; override `retentionDays` if your UX surfaces older activity.

## Versioning

Part of the ikary-worker fixed-group. Releases with `@ikary/worker`.

## Breaking Changes

`ActivityFeedConsumer.name` / `eventTypes` rebind the queue in prod — treat as breaking.
