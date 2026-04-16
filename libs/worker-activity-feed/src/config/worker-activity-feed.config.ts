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
});

export type WorkerActivityFeedConfig = z.infer<typeof workerActivityFeedConfigSchema>;
