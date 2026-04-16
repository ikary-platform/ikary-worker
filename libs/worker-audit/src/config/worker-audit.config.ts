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
});

export type WorkerAuditConfig = z.infer<typeof workerAuditConfigSchema>;
