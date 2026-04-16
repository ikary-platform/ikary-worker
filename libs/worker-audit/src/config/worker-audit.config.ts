import { z } from 'zod';

/**
 * Escape hatch for NestJS provider tokens, which are runtime references that
 * cannot be serialised. Same pattern as system-entity's module options.
 */
const providerTokenSchema = z.custom<
  string | symbol | (abstract new (...args: never[]) => unknown)
>(
  (value) => {
    const t = typeof value;
    return t === 'string' || t === 'symbol' || t === 'function';
  },
  { message: 'databaseProviderToken must be a Nest provider token.' },
);

export const workerAuditConfigSchema = z.object({
  /**
   * NestJS injection token resolving to a DatabaseService whose schema
   * includes `ikary_audit_entries` (run the migration in this package).
   */
  databaseProviderToken: providerTokenSchema,

  /**
   * Rows whose `occurred_at` is older than this many days are deleted by a
   * daily cleanup job that runs at 03:10 server time. Defaults to 2555
   * (~7 years) to cover the retention windows most audit/compliance
   * regimes (SOX, HIPAA, PCI DSS, GDPR accountability) treat as the safe
   * floor. Callers with a specific regulatory requirement should set this
   * explicitly.
   *
   * Pass `null` to disable cleanup entirely — the cron still registers but
   * every run exits immediately. Useful for tests, short-lived
   * environments, or when an external job (e.g. a table partition pruner)
   * owns retention.
   *
   * Filtering uses `occurred_at` (event time) rather than `recorded_at`
   * (projection write time) so that events backfilled by a catch-up
   * worker after downtime are not deleted before a human would
   * reasonably expect them to be.
   */
  retentionDays: z.number().int().positive().nullable().default(2555),
});

export type WorkerAuditConfig = z.infer<typeof workerAuditConfigSchema>;
export type WorkerAuditConfigInput = z.input<typeof workerAuditConfigSchema>;
