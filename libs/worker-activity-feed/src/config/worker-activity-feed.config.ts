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

export const workerActivityFeedConfigSchema = z.object({
  /**
   * NestJS injection token resolving to a DatabaseService whose schema
   * includes `ikary_activity_entries` (run the migration in this package).
   */
  databaseProviderToken: providerTokenSchema,

  /**
   * Declared retention intent, in days — the spec an external scheduler
   * reads to decide what to delete. **This module does not schedule or
   * perform cleanup**; it only exposes `ActivityFeedRepository.deleteOlderThan`
   * as the DB primitive and this value as the policy.
   *
   * Scheduling lives in a separate `ikary-scheduler` app so that
   * multi-pod deployments don't fire N simultaneous sweeps.
   *
   * Defaults to 30 days — the feed is a "recent activity" view; older
   * items aren't useful for the user-facing timeline.
   *
   * Pass `null` to mark retention as "disabled / externally managed".
   *
   * Scheduler-level note: filter on `occurred_at` (event time) so
   * backfilled rows from a catch-up worker aren't deleted before they
   * have been shown.
   */
  retentionDays: z.number().int().positive().nullable().default(30),
});

export type WorkerActivityFeedConfig = z.infer<typeof workerActivityFeedConfigSchema>;
export type WorkerActivityFeedConfigInput = z.input<typeof workerActivityFeedConfigSchema>;
