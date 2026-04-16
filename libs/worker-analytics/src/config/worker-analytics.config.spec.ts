import { describe, it, expect } from 'vitest';
import { workerAnalyticsConfigSchema } from './worker-analytics.config.js';

describe('workerAnalyticsConfigSchema', () => {
  it('accepts a class constructor', () => {
    class Fake {}
    expect(workerAnalyticsConfigSchema.parse({ databaseProviderToken: Fake }).databaseProviderToken).toBe(Fake);
  });

  it('accepts a string token', () => {
    expect(
      workerAnalyticsConfigSchema.parse({ databaseProviderToken: 'DB' }).databaseProviderToken,
    ).toBe('DB');
  });

  it('accepts a symbol token', () => {
    const sym = Symbol('DB');
    expect(
      workerAnalyticsConfigSchema.parse({ databaseProviderToken: sym }).databaseProviderToken,
    ).toBe(sym);
  });

  it('rejects numbers', () => {
    expect(() => workerAnalyticsConfigSchema.parse({ databaseProviderToken: 42 })).toThrow();
  });
});
