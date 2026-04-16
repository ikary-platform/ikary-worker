import { describe, it, expect } from 'vitest';
import { workerActivityFeedConfigSchema } from './worker-activity-feed.config.js';

describe('workerActivityFeedConfigSchema', () => {
  it('accepts a class token', () => {
    class Fake {}
    expect(workerActivityFeedConfigSchema.parse({ databaseProviderToken: Fake }).databaseProviderToken).toBe(Fake);
  });
  it('accepts a string token', () => {
    expect(
      workerActivityFeedConfigSchema.parse({ databaseProviderToken: 'DB' }).databaseProviderToken,
    ).toBe('DB');
  });
  it('accepts a symbol token', () => {
    const s = Symbol('DB');
    expect(workerActivityFeedConfigSchema.parse({ databaseProviderToken: s }).databaseProviderToken).toBe(s);
  });
  it('rejects numbers', () => {
    expect(() => workerActivityFeedConfigSchema.parse({ databaseProviderToken: 42 })).toThrow();
  });
});
