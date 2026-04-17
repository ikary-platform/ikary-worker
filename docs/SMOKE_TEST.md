# Worker smoke test

End-to-end verification that every OOTB projection consumer boots, subscribes,
and writes the expected rows on a real Postgres + RabbitMQ stack. Run this
after any change to the consumer framework, the projection libs, or the
app wiring.

## Prerequisites

- Docker Desktop or Podman running
- A Postgres container on `localhost:5432`
- A RabbitMQ container on `localhost:5672` (management plugin enabled)

The examples below assume Postgres with user/password `micro:micro` and the
same for RabbitMQ — adjust to match your local compose. If you have the
ikary-local stack running you already have both.

## 1. Apply migrations

Create an isolated database so the smoke test does not pollute anything else:

```bash
docker exec <pg-container> psql -U micro -d postgres -c "DROP DATABASE IF EXISTS ikary_worker_smoke;"
docker exec <pg-container> psql -U micro -d postgres -c "CREATE DATABASE ikary_worker_smoke;"

DATABASE_URL=postgres://micro:micro@localhost:5432/ikary_worker_smoke \
  pnpm --filter @ikary/worker migrate
```

Expected output: `Applied 9 migration(s) across 6 package(s)`. Confirm the
three projection tables exist:

```bash
docker exec <pg-container> psql -U micro -d ikary_worker_smoke -c "\dt" | \
  grep -E "ikary_(audit|analytics|activity)"
```

## 2. Start the worker

```bash
DATABASE_URL=postgres://micro:micro@localhost:5432/ikary_worker_smoke \
RABBITMQ_URL=amqp://micro:micro@localhost:5672 \
LOG_PRETTY=true \
PORT=3099 \
pnpm --filter @ikary/worker start:dev
```

Expected log lines:

```
INFO: Subscribed worker-audit on ikary.worker-audit (patterns: #)
INFO: Subscribed worker-analytics on ikary.worker-analytics (patterns: #)
INFO: Subscribed worker-activity-feed on ikary.worker-activity-feed (patterns: #)
INFO: Nest application successfully started
```

If any of the three "Subscribed" lines are missing, stop here — DI is wired
incorrectly and events will silently bypass the missing consumer.

## 3. Publish a synthetic event

Any AMQP client works. Using the management plugin's `rabbitmqadmin`:

```bash
docker exec <rabbit-container> rabbitmqadmin -u micro -p micro publish \
  exchange=cell.events routing_key=invoice.created payload='{
    "event_id":     "evt-smoke-001",
    "event_name":   "invoice.created",
    "version":      1,
    "timestamp":    "2026-04-16T20:15:00.000Z",
    "tenant_id":    "t-smoke",
    "workspace_id": "ws-smoke",
    "cell_id":      "c-smoke",
    "actor":        {"type":"user","id":"u-smoke"},
    "entity":       {"type":"invoice","id":"inv-123"},
    "data":         {"amount":99.50,"status":"open"},
    "previous":     {},
    "metadata":     {}
  }'
```

## 4. Verify all three projections populated

```sql
SELECT event_id, event_name, resource_type, change_kind
  FROM ikary_audit_entries;

SELECT event_name, analytics_pattern, business_domain, event_count, failure_count
  FROM ikary_analytics_buckets_hourly;

SELECT event_id, event_name, title, summary
  FROM ikary_activity_entries;
```

Expected:

| Table           | Expected state                                        |
| --------------- | ----------------------------------------------------- |
| `audit`         | one row, `change_kind='snapshot'` (because `previous={}`)   |
| `analytics`     | one row, `event_count=1`, `pattern='entity.*'`, `domain='invoice'` |
| `activity_feed` | one row, `title='invoice.created'`, `summary` = truncated JSON of `data` |

## 5. Verify framework-level idempotency

Re-publish the **same event_id**. Expectation:

- `ikary_audit_entries` stays at **1 row** (event_id is the primary key).
- `ikary_activity_entries` stays at **1 row** (same).
- `ikary_analytics_buckets_hourly.event_count` stays at **1** — the consumer
  framework deduplicates via `ikary_event_consumer_receipts`, so the analytics
  upsert never re-runs.
- `ikary_event_consumer_receipts` has exactly **three rows** (one per consumer),
  all for `evt-smoke-001`.

```sql
SELECT consumer_name, count(*) FROM ikary_event_consumer_receipts GROUP BY consumer_name;
```

## 6. Verify analytics aggregation

Publish a **different** event_id in the same hour / tenant / pattern:

```bash
# same payload shape, but event_id=evt-smoke-002 and different entity.id
```

Expectation: `ikary_analytics_buckets_hourly` still has **one row** for
`invoice.created` (same bucket key), but `event_count=2`.

## 7. Verify failure_count increment

Publish an event whose name ends in `.failed`:

```bash
# routing_key=invoice.failed, event_name=invoice.failed
```

Expectation: a **new** bucket row for `invoice.failed`, with
`event_count=1` and `failure_count=1`.

## 8. Verify diff vs snapshot audit path

Publish an `invoice.updated` with a non-empty `previous`. Expectation:
`ikary_audit_entries.change_kind='diff'`, `diff IS NOT NULL`,
`snapshot IS NULL`. Snapshot rows (empty `previous`) keep
`snapshot IS NOT NULL`, `diff IS NULL`.

## Teardown

```bash
# Stop the worker (Ctrl-C)
docker exec <pg-container> psql -U micro -d postgres -c "DROP DATABASE ikary_worker_smoke;"
```

## Known gotchas

- **Migrations silently missing packages.** The CLI resolves migrations via
  `createRequire().resolve('<pkg>/package.json')`, which requires each
  `libs/worker-*` package to export `./package.json` explicitly. If the CLI
  says `Applied N migration(s) across 2 package(s)` instead of 6, a lib is
  missing that export and the table for that lib's consumer won't exist.
- **Only some consumers subscribe.** If fewer than three `Subscribed ...`
  lines appear, the `CONSUMER` DI factory in `apps/worker/src/app.module.ts`
  is wrong. Three same-token `multi: true` providers collapse to one across
  sibling dynamic modules — use the single `useFactory` pattern that
  returns the array explicitly.
- **Service injection fails at boot.** If `ConsumerModule` can't inject an
  `AuditService` / `AnalyticsService` / `ActivityFeedService`, the owning
  `Worker*Module` isn't registered as `global: true`. All three projection
  modules (and `SystemAmqpModule`) must be global so the sibling
  `ConsumerModule` can see their providers.
