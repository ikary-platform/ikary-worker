---
"@ikary/worker": minor
"@ikary/system-amqp": minor
"@ikary/worker-consumer": patch
"@ikary/worker-audit": minor
"@ikary/worker-analytics": minor
"@ikary/worker-activity-feed": minor
---

Delete the standalone migrate script, unify on the manifest CLI, and fix the
suite of wiring bugs that end-to-end smoke testing surfaced along the way.

## Cleanup

- Remove `apps/worker/scripts/migrate.ts` — the `migrate`, `migrate:status`,
  and `migrate:dry-run` package scripts already delegate to
  `ikary local db migrate`, and every worker-owned migration package is in
  the CLI's built-in default list.
- Drop the `migrate:standalone` script plus the `tsx` and
  `@ikary/system-migration-core` devDependencies that only existed to
  support it.
- Refresh stale `MIGRATION_PACKAGES` hints in `libs/worker-consumer/README.md`
  and `libs/worker-audit/README.md`.

## Bugs fixed (surfaced by the smoke test)

- **Consumer migrations silently skipped.** `@ikary/worker-consumer`,
  `@ikary/worker-audit`, `@ikary/worker-analytics`, and
  `@ikary/worker-activity-feed` shipped `"exports"` without
  `"./package.json"`, so the CLI's `createRequire(...).resolve('<pkg>/package.json')`
  threw and the migrations for those four libs were never applied —
  consumers would start against missing tables. Each package.json now
  exposes its `package.json` subpath.
- **`ConsumerModule` DI failed to find `AmqpConnectionService`.**
  `SystemAmqpModule.register()` now returns `global: true`, matching the
  convention used by `DatabaseModule` and `SystemLogModule`. Sibling
  modules no longer need to re-import it.
- **`ConsumerModule` DI failed to find the three projection services.**
  `WorkerAuditModule`, `WorkerAnalyticsModule`, and
  `WorkerActivityFeedModule`'s `register()` now return `global: true` so
  the consumer classes they provide can be injected from any module —
  critical because `ConsumerRegistry` instantiates the consumers in
  `ConsumerModule`'s scope, which does not otherwise import them.
- **Only one of three consumers subscribed on boot.** Three same-token
  `multi: true` providers on the `CONSUMER` token collapsed to a single
  instance under NestJS's dynamic-module DI, leaving the audit and
  analytics consumers silently un-subscribed. `apps/worker/src/app.module.ts`
  now uses a single `useFactory` provider that explicitly returns the
  `IConsumer[]` array, which is unambiguous and sidesteps the
  multi-provider trap entirely.

## Reference smoke procedure

A reproducible end-to-end smoke runbook now lives at
`docs/SMOKE_TEST.md` — migrations, boot, a synthetic envelope, idempotency
check, aggregation check, and a list of known gotchas each bug above would
have triggered if it regressed.
