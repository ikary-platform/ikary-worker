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
   * Activity rows whose `occurred_at` is older than this many days are
   * deleted by a daily cleanup job at 03:30 server time. Defaults to
   * 30 days — the feed is a "recent activity" view; older items aren't
   * useful for the user-facing timeline.
   *
   * Pass `null` to disable cleanup entirely — the cron still registers
   * but every run exits immediately. Useful for tests, short-lived
   * environments, or when an external job (e.g. a table partition
   * pruner) owns retention.
   *
   * Filtering uses `occurred_at` so that events backfilled by a catch-up
   * worker after downtime are not deleted before they have been shown.
   */
  retentionDays: z.number().int().positive().nullable().default(30),
});

export type WorkerActivityFeedConfig = z.infer<typeof workerActivityFeedConfigSchema>;
export type WorkerActivityFeedConfigInput = z.input<typeof workerActivityFeedConfigSchema>;
