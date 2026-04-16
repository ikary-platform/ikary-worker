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
})
```

Host DB schema:
```ts
type AppDatabase =
  & ConsumerDatabaseSchema
  & WorkerActivityFeedDatabaseSchema
  & /* your own tables */ ;
```

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
- Retention — v0.1 has no cleanup job. `ikary_activity_entries` grows unbounded; add a scheduled `DELETE` per your UX retention window (e.g. 90 days).

## Versioning

Part of the ikary-worker fixed-group. Releases with `@ikary/worker`.

## Breaking Changes

`ActivityFeedConsumer.name` / `eventTypes` rebind the queue in prod — treat as breaking.
