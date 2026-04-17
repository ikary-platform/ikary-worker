---
"@ikary/worker-consumer": patch
"@ikary/worker-audit": patch
"@ikary/worker-analytics": patch
"@ikary/worker-activity-feed": patch
---

Two cosmetic cleanups that land together:

## `@ikary/worker-consumer` — align folder layout with the repo template

`worker-consumer` pre-dated `LIBRARY_TEMPLATE.md` and shipped with a
flatter `src/server/` directory. Files are moved to the canonical
structure every other lib in this repo follows:

- `src/shared/consumer-options.schema.ts` → `src/config/consumer-options.schema.ts`
- `src/server/consumer.database.ts` → `src/server/db/schema.ts`
- `src/server/consumer-receipts.repository.{ts,spec.ts}` → `src/server/repositories/consumer-receipts.repository.{ts,spec.ts}`
- `src/server/consumer-offsets.repository.{ts,spec.ts}` → `src/server/repositories/consumer-offsets.repository.{ts,spec.ts}`
- Added `src/shared/index.ts` barrel.

Imports updated throughout; `vitest.config.ts` coverage exclusion path
updated. Every public export from `@ikary/worker-consumer` and
`@ikary/worker-consumer/server` keeps the same name — there is no API
surface change for consumers of the package. The top-level note in
`CLAUDE.md` calling out worker-consumer as "older flat layout" is
removed now that it matches.

## `@ikary/worker-audit`, `@ikary/worker-analytics`, `@ikary/worker-activity-feed`, `@ikary/worker-consumer` — retention knob README sections

Each lib's README gains a `## Retention` section documenting the
`retentionDays` (or `receiptRetentionDays`) config knob added in the
previous changeset: the default, what `null` means, which column is
filtered, and why that column was chosen. The stale "v0.1 has no
cleanup job" / "plan a cron" bullets in the Security/Isolation Notes
sections are replaced with cross-references to the new section.

No code change — READMEs only.
