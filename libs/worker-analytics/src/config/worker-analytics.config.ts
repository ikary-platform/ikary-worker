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
   * Hourly buckets whose `bucket_start` is older than this many days are
   * deleted by a daily cleanup job at 03:20 server time. Defaults to 90
   * days — dashboards typically look back a quarter, and older buckets
   * either get rolled up into coarser-grained tables or become
   * statistical noise.
   *
   * Pass `null` to disable cleanup entirely — the cron still registers
   * but every run exits immediately. Useful for tests, short-lived
   * environments, or when an external job (e.g. a table partition
   * pruner) owns retention.
   */
  retentionDays: z.number().int().positive().nullable().default(90),
});

export type WorkerAnalyticsConfig = z.infer<typeof workerAnalyticsConfigSchema>;
export type WorkerAnalyticsConfigInput = z.input<typeof workerAnalyticsConfigSchema>;
