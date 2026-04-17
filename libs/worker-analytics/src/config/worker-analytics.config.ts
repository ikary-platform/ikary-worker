import { z } from 'zod';

const providerTokenSchema = z.custom<
  string | symbol | (abstract new (...args: never[]) => unknown)
>(
  (value) => {
    const t = typeof value;
    return t === 'string' || t === 'symbol' || t === 'function';
  },
  { message: 'databaseProviderToken must be a Nest provider token.' },
);

export const workerAnalyticsConfigSchema = z.object({
  /**
   * NestJS injection token resolving to a DatabaseService whose schema
   * includes `ikary_analytics_buckets_hourly` (run the migrations in this
   * package).
   */
  databaseProviderToken: providerTokenSchema,

  /**
   * Declared retention intent, in days — the spec an external scheduler
   * reads to decide what to delete. **This module does not schedule or
   * perform cleanup**; it only exposes `AnalyticsRepository.deleteOlderThan`
   * as the DB primitive and this value as the policy.
   *
   * Scheduling lives in a separate `ikary-scheduler` app so that
   * multi-pod deployments don't fire N simultaneous sweeps.
   *
   * Defaults to 90 days — dashboards typically look back a quarter;
   * older buckets either get rolled up or become statistical noise.
   *
   * Pass `null` to mark retention as "disabled / externally managed".
   *
   * Scheduler-level note: filter on `bucket_start` (the hour being
   * tracked), not `updated_at` (the last time a bucket was incremented),
   * so a long-running event hitting an old bucket doesn't reset its
   * retention clock.
   */
  retentionDays: z.number().int().positive().nullable().default(90),
});

export type WorkerAnalyticsConfig = z.infer<typeof workerAnalyticsConfigSchema>;
export type WorkerAnalyticsConfigInput = z.input<typeof workerAnalyticsConfigSchema>;
