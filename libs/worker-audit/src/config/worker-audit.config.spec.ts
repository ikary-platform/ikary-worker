import { describe, it, expect } from 'vitest';
import { workerAuditConfigSchema } from './worker-audit.config.js';

describe('workerAuditConfigSchema', () => {
  it('accepts a class constructor as databaseProviderToken', () => {
    class FakeDb {}
    const { databaseProviderToken } = workerAuditConfigSchema.parse({
      databaseProviderToken: FakeDb,
    });
    expect(databaseProviderToken).toBe(FakeDb);
  });

  it('accepts a string token', () => {
    const { databaseProviderToken } = workerAuditConfigSchema.parse({
      databaseProviderToken: 'DATABASE_SERVICE',
    });
    expect(databaseProviderToken).toBe('DATABASE_SERVICE');
  });

  it('accepts a symbol token', () => {
    const sym = Symbol('DATABASE_SERVICE');
    const { databaseProviderToken } = workerAuditConfigSchema.parse({
      databaseProviderToken: sym,
    });
    expect(databaseProviderToken).toBe(sym);
  });

  it('rejects an invalid token type', () => {
    expect(() => workerAuditConfigSchema.parse({ databaseProviderToken: 42 })).toThrow();
  });
});
