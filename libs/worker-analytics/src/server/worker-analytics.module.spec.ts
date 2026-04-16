import { describe, it, expect } from 'vitest';
import { WorkerAnalyticsModule } from './worker-analytics.module.js';
import { AnalyticsRepository } from './repositories/analytics.repository.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { AnalyticsConsumer } from '../modules/analytics/analytics.consumer.js';
import { WORKER_ANALYTICS_CONFIG, WORKER_ANALYTICS_DATABASE } from './worker-analytics.tokens.js';

const FAKE_DB_TOKEN = Symbol('FAKE_DB');

describe('WorkerAnalyticsModule.register', () => {
  it('returns a DynamicModule scoped to WorkerAnalyticsModule', () => {
    const mod = WorkerAnalyticsModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.module).toBe(WorkerAnalyticsModule);
  });

  it('provides the validated config at WORKER_ANALYTICS_CONFIG', () => {
    const mod = WorkerAnalyticsModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const cfg = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_ANALYTICS_CONFIG,
    );
    expect(cfg).toBeDefined();
    expect((cfg as { useValue: { databaseProviderToken: symbol } }).useValue.databaseProviderToken).toBe(FAKE_DB_TOKEN);
  });

  it('wires WORKER_ANALYTICS_DATABASE via useFactory', () => {
    const mod = WorkerAnalyticsModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const db = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_ANALYTICS_DATABASE,
    );
    expect(db).toBeDefined();
    const provider = db as { inject: unknown[]; useFactory: (v: unknown) => unknown };
    expect(provider.inject).toEqual([FAKE_DB_TOKEN]);
    const instance = { id: 'db' };
    expect(provider.useFactory(instance)).toBe(instance);
  });

  it('registers and exports the repository, service, and consumer', () => {
    const mod = WorkerAnalyticsModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.providers).toContain(AnalyticsRepository);
    expect(mod.providers).toContain(AnalyticsService);
    expect(mod.providers).toContain(AnalyticsConsumer);
    expect(mod.exports).toContain(AnalyticsRepository);
    expect(mod.exports).toContain(AnalyticsService);
    expect(mod.exports).toContain(AnalyticsConsumer);
  });
});
