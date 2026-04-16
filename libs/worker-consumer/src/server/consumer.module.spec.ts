import { describe, it, expect } from 'vitest';
import { ConsumerModule } from './consumer.module.js';
import { ConsumerRegistry } from './consumer.registry.js';
import { ConsumerCleanupService } from './consumer-cleanup.service.js';
import { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';
import { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';
import { CONSUMER_DATABASE, CONSUMER_OPTIONS } from './consumer.tokens.js';

const FAKE_DB_TOKEN = Symbol('FAKE_DB');

describe('ConsumerModule.register', () => {
  it('returns a DynamicModule scoped to ConsumerModule', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.module).toBe(ConsumerModule);
  });

  it('resolves defaults when no options are supplied', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const optionsProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_OPTIONS,
    );
    expect(optionsProvider).toBeDefined();
    const { useValue } = optionsProvider as { useValue: { queuePrefix: string } };
    expect(useValue.queuePrefix).toBe('ikary.');
  });

  it('merges user-supplied options with defaults', () => {
    const mod = ConsumerModule.register({
      databaseProviderToken: FAKE_DB_TOKEN,
      options: { prefetch: 100 },
    });
    const optionsProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_OPTIONS,
    );
    const { useValue } = optionsProvider as { useValue: { prefetch: number; queuePrefix: string } };
    expect(useValue.prefetch).toBe(100);
    expect(useValue.queuePrefix).toBe('ikary.');  // default still applied
  });

  it('wires CONSUMER_DATABASE to the supplied provider token', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const dbProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_DATABASE,
    );
    expect(dbProvider).toBeDefined();
    const { inject } = dbProvider as { inject: unknown[] };
    expect(inject).toEqual([FAKE_DB_TOKEN]);
  });

  it('CONSUMER_DATABASE factory returns the injected db instance unchanged', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const dbProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_DATABASE,
    );
    const { useFactory } = dbProvider as { useFactory: (db: unknown) => unknown };
    const dummyDb = { marker: 'the-real-database-service' };
    expect(useFactory(dummyDb)).toBe(dummyDb);
  });

  it('includes the registry, repositories, and cleanup service in providers', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.providers).toContain(ConsumerRegistry);
    expect(mod.providers).toContain(ConsumerReceiptsRepository);
    expect(mod.providers).toContain(ConsumerOffsetsRepository);
    expect(mod.providers).toContain(ConsumerCleanupService);
  });

  it('exports the repositories, the registry, and the cleanup service', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.exports).toContain(ConsumerRegistry);
    expect(mod.exports).toContain(ConsumerReceiptsRepository);
    expect(mod.exports).toContain(ConsumerOffsetsRepository);
    expect(mod.exports).toContain(ConsumerCleanupService);
  });

  it('applies the default receiptRetentionDays of 7 when not overridden', () => {
    const mod = ConsumerModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const optionsProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_OPTIONS,
    );
    const { useValue } = optionsProvider as {
      useValue: { receiptRetentionDays: number | null };
    };
    expect(useValue.receiptRetentionDays).toBe(7);
  });

  it('accepts receiptRetentionDays: null to disable cleanup', () => {
    const mod = ConsumerModule.register({
      databaseProviderToken: FAKE_DB_TOKEN,
      options: { receiptRetentionDays: null },
    });
    const optionsProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === CONSUMER_OPTIONS,
    );
    const { useValue } = optionsProvider as {
      useValue: { receiptRetentionDays: number | null };
    };
    expect(useValue.receiptRetentionDays).toBeNull();
  });

  it('merges user-supplied consumers into the provider list', () => {
    class FakeConsumer {}
    const consumerProvider = { provide: 'X', useClass: FakeConsumer, multi: true as const };
    const mod = ConsumerModule.register({
      databaseProviderToken: FAKE_DB_TOKEN,
      consumers: [consumerProvider],
    });
    expect(mod.providers).toContain(consumerProvider);
  });
});
