import { describe, it, expect } from 'vitest';
import { WorkerActivityFeedModule } from './worker-activity-feed.module.js';
import { ActivityFeedRepository } from './repositories/activity-feed.repository.js';
import { ActivityFeedService } from '../modules/activity-feed/activity-feed.service.js';
import { ActivityFeedConsumer } from '../modules/activity-feed/activity-feed.consumer.js';
import {
  WORKER_ACTIVITY_FEED_CONFIG,
  WORKER_ACTIVITY_FEED_DATABASE,
} from './worker-activity-feed.tokens.js';

const FAKE_DB_TOKEN = Symbol('FAKE_DB');

describe('WorkerActivityFeedModule.register', () => {
  it('returns a DynamicModule scoped to WorkerActivityFeedModule', () => {
    const mod = WorkerActivityFeedModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.module).toBe(WorkerActivityFeedModule);
  });

  it('provides the validated config', () => {
    const mod = WorkerActivityFeedModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const cfg = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_ACTIVITY_FEED_CONFIG,
    );
    expect((cfg as { useValue: { databaseProviderToken: symbol } }).useValue.databaseProviderToken).toBe(FAKE_DB_TOKEN);
  });

  it('wires the database token via useFactory', () => {
    const mod = WorkerActivityFeedModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const db = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_ACTIVITY_FEED_DATABASE,
    );
    const provider = db as { inject: unknown[]; useFactory: (v: unknown) => unknown };
    expect(provider.inject).toEqual([FAKE_DB_TOKEN]);
    const instance = { db: true };
    expect(provider.useFactory(instance)).toBe(instance);
  });

  it('registers and exports the repository, service, and consumer', () => {
    const mod = WorkerActivityFeedModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.providers).toContain(ActivityFeedRepository);
    expect(mod.providers).toContain(ActivityFeedService);
    expect(mod.providers).toContain(ActivityFeedConsumer);
    expect(mod.exports).toContain(ActivityFeedRepository);
    expect(mod.exports).toContain(ActivityFeedService);
    expect(mod.exports).toContain(ActivityFeedConsumer);
  });
});
