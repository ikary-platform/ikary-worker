---
"@ikary/worker": minor
"@ikary/worker-consumer": minor
"@ikary/worker-audit": minor
"@ikary/worker-analytics": minor
"@ikary/worker-activity-feed": minor
---

Three OOTB projection libraries using the thin-consumer pattern, plus a foundation fix to `worker-consumer`.

**`worker-consumer`** — added `ordered?: boolean` to `IConsumer`. When `false`, the runner skips per-aggregate gap detection and offset tracking — correct for cross-aggregate sinks like audit/analytics/activity feed where out-of-order delivery is safe. Receipts (idempotency) remain unconditional. Default remains `true` for per-aggregate projections.

**`worker-audit`** — derives a rich audit row from every `DomainEventEnvelope`:
- Writes to `ikary_audit_entries` (new table, owned by this lib)
- `change_kind` inferred from envelope (`previous` non-empty → `diff`; otherwise `snapshot`)
- Thin consumer → `AuditService.record(event, tx)` → `AuditRepository.insertIfNotExists` (ON CONFLICT DO NOTHING)
- 100% coverage

**`worker-analytics`** — classifies each event and maintains hourly buckets:
- Ported pure `classifyAnalyticsEvent` from the old `ikary-harbor` — `page`/`api`/`workflow`/`entity`/`other` taxonomy with `httpMethod`/`statusClass` extraction
- Writes to `ikary_analytics_buckets_hourly` with true `ON CONFLICT DO UPDATE SET event_count = event_count + 1` aggregation (the old repo mis-modeled this as one row per event)
- Empty-string sentinels for nullable PK dimensions so upsert idempotency works under PostgreSQL's `NULL <> NULL` semantics
- `failure_count` incremented when event name ends in `.failed` OR status class is 4xx/5xx
- 100% coverage

**`worker-activity-feed`** — user-facing event timeline:
- Writes to `ikary_activity_entries` (title = event name; summary = JSON.stringify(data) truncated to 240 chars; null summary for empty data)
- Thin consumer + service + repository; idempotent on `event_id`
- Subscribes to `'#'` — downstream UIs filter at query time
- 100% coverage

**`@ikary/worker`** — wires the three projection consumers into `apps/worker/src/app.module.ts` as OOTB defaults. Downstream `ikary-enterprise-worker` repos opt out by importing only the modules they want and registering the consumers they want.

All three libs follow the Zod-first contract rule: every boundary type (config, row shapes, classifier results) is a `z.ZodSchema` with `z.infer` for the TS type.

**Migrations** in `v0.1.0/` of each lib; added to `apps/worker/scripts/migrate.ts`'s `MIGRATION_PACKAGES` list. Companion update in `ikary-manifest`'s `apps/cli/src/commands/local-db.ts` so `ikary local db migrate` picks them up from the manifest CLI too.
