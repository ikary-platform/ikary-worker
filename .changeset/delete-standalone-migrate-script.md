---
"@ikary/worker": patch
---

Remove the duplicated `apps/worker/scripts/migrate.ts` standalone migration
script. The `migrate`, `migrate:status`, and `migrate:dry-run` scripts already
delegate to `ikary local db migrate`, and every worker-owned migration package
is in the CLI's built-in default list — so the standalone runner was a
second, drift-prone copy of the same logic.

Downstream effects:

- `apps/worker/package.json` drops the `migrate:standalone` script, along with
  the `tsx` and `@ikary/system-migration-core` devDependencies that only
  existed to support it.
- `libs/worker-consumer/README.md` and `libs/worker-audit/README.md` drop the
  stale "add to the CLI's `MIGRATION_PACKAGES` list" hint now that both
  packages are part of the CLI's default list out of the box. Projects that
  still need to add their own packages should use the CLI's `--package <name>`
  flag or an `ikary.config.json` entry instead.
