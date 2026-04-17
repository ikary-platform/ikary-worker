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
   * Declared retention intent, in days — the spec an external scheduler
   * reads to decide what to delete. **This module does not schedule or
   * perform cleanup**; it only exposes `AuditRepository.deleteOlderThan`
   * as the DB primitive and this value as the policy.
   *
   * Scheduling lives in a separate `ikary-scheduler` app so that
   * multi-pod deployments don't fire N simultaneous sweeps (one per
   * worker pod).
   *
   * Defaults to 2555 (~7 years) to cover the retention windows most
   * audit/compliance regimes (SOX, HIPAA, PCI DSS, GDPR accountability)
   * treat as the safe floor. Callers with a specific regulatory
   * requirement should set this explicitly.
   *
   * Pass `null` to mark retention as "disabled / externally managed" —
   * the scheduler will skip this lib's sweep.
   *
   * Scheduler-level note: filter on `occurred_at` (event time), not
   * `recorded_at` (projection write time), so backfilled rows from a
   * catch-up worker aren't deleted before a human would reasonably
   * expect them to be.
   */
  retentionDays: z.number().int().positive().nullable().default(2555),
});

export type WorkerAuditConfig = z.infer<typeof workerAuditConfigSchema>;
export type WorkerAuditConfigInput = z.input<typeof workerAuditConfigSchema>;
