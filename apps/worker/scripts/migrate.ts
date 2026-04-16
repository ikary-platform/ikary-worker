/**
 * Standalone migration script for ikary-worker.
 *
 * Mirrors the logic in the ikary-manifest CLI's `local db migrate` command
 * so both repos share the same migration tool (@ikary/system-migration-core)
 * and the same tracking table (ikary_schema_versions).
 *
 * Usage:
 *   pnpm migrate                 — apply all pending migrations
 *   pnpm migrate:status          — show applied / pending per package
 *   pnpm migrate:dry-run         — preview without applying
 *
 * Or with flags directly:
 *   tsx scripts/migrate.ts [--status] [--dry-run] [--force] [--database-url <url>]
 *
 * Run order
 * ---------
 * The shared ikary_schema_versions table is idempotent: if ikary-manifest
 * already applied @ikary/cell-runtime-core migrations, those rows are present
 * and this script skips them. This script's primary job is to ensure
 * @ikary/system-log-core tables exist before the worker boots.
 *
 * Packages are resolved relative to process.cwd() using the same strategy
 * as `ikary local db migrate` — packages not installed are silently skipped.
 */

import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseService, databaseConnectionOptionsSchema } from '@ikary/system-db-core';
import { MigrationRunner } from '@ikary/system-migration-core';

// ── config ───────────────────────────────────────────────────────────────────

/**
 * Packages with migrations to run, in dependency order.
 * Must match the list in ikary-manifest/apps/cli/src/commands/local-db.ts.
 */
const MIGRATION_PACKAGES = [
  '@ikary/cell-runtime-core',  // outbox + audit tables (owned by ikary-manifest)
  '@ikary/system-log-core',     // log settings, sinks, entries (worker requirement)
  '@ikary/worker-consumer',     // consumer receipts + offsets (worker requirement)
] as const;

// ── arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isStatus   = args.includes('--status');
const isDryRun   = args.includes('--dry-run');
const isForce    = args.includes('--force');
const dbUrlArg   = (() => {
  const idx = args.indexOf('--database-url');
  return idx !== -1 ? args[idx + 1] : undefined;
})();

const dbUrl =
  dbUrlArg ??
  process.env['DATABASE_URL'] ??
  'postgres://ikary:ikary@localhost:5432/ikary';

// ── resolution ───────────────────────────────────────────────────────────────

interface MigrationSource { packageName: string; migrationsRoot: string }

function resolveMigrationSource(packageName: string): MigrationSource | null {
  try {
    // Use CWD as resolution root so this works from any project.
    const req = createRequire(resolve(process.cwd(), '__cwd_resolver__.js'));
    const pkgJsonPath = req.resolve(`${packageName}/package.json`);
    const migrationsRoot = resolve(pkgJsonPath, '..', 'migrations');
    if (!existsSync(migrationsRoot)) return null;
    return { packageName, migrationsRoot };
  } catch {
    return null;
  }
}

// ── output helpers ───────────────────────────────────────────────────────────

const CHECK  = '✓';
const CIRCLE = '○';
const CROSS  = '✗';

function log(msg: string)  { console.log(msg); }
function ok(msg: string)   { console.log(`  ${CHECK}  ${msg}`); }
function warn(msg: string) { console.log(`  ${CIRCLE}  ${msg}`); }
function fail(msg: string) { console.error(`  ${CROSS}  ${msg}`); }

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sources = MIGRATION_PACKAGES
    .map(resolveMigrationSource)
    .filter((s): s is MigrationSource => s !== null);

  if (sources.length === 0) {
    log('No migration packages found.');
    return;
  }

  log('');
  log(isStatus ? 'Migration status' : isDryRun ? 'Migration dry-run' : 'Database migrations');
  log(`Database: ${dbUrl}`);
  log('');

  const dbService = new DatabaseService(
    databaseConnectionOptionsSchema.parse({ connectionString: dbUrl }),
  );

  try {
    if (isStatus) {
      for (const source of sources) {
        const runner = new MigrationRunner(dbService, source);
        const status = await runner.status();
        log(`${source.packageName}`);
        for (const v of status.applied)  ok(`${v}`);
        for (const v of status.pending)  warn(`${v}`);
        if (status.applied.length === 0 && status.pending.length === 0) {
          log('  — no migrations found —');
        }
        log('');
      }
    } else {
      let totalApplied = 0;
      for (const source of sources) {
        const runner = new MigrationRunner(dbService, source);
        const result = await runner.migrate({ dryRun: isDryRun, force: isForce });
        totalApplied += result.applied;
        if (result.applied > 0) {
          const label = isDryRun ? 'pending' : 'applied';
          ok(`${source.packageName}  ${result.applied} migration(s) ${label}`);
        }
      }

      if (totalApplied === 0) {
        ok('Database is up to date');
      } else if (isDryRun) {
        warn(`${totalApplied} migration(s) pending — run without --dry-run to apply`);
      } else {
        ok(`Applied ${totalApplied} migration(s)`);
      }
      log('');
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    log('');
    process.exitCode = 1;
  } finally {
    await dbService.destroy();
  }
}

main();
