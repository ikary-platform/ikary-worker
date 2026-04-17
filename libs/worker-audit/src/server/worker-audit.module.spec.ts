import { describe, it, expect } from 'vitest';
import { WorkerAuditModule } from './worker-audit.module.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuditConsumer } from '../modules/audit/audit.consumer.js';
import { WORKER_AUDIT_CONFIG, WORKER_AUDIT_DATABASE } from './worker-audit.tokens.js';

const FAKE_DB_TOKEN = Symbol('FAKE_DB');

describe('WorkerAuditModule.register', () => {
  it('returns a DynamicModule scoped to WorkerAuditModule', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.module).toBe(WorkerAuditModule);
  });

  it('parses the options through the Zod schema and provides the validated config', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const configProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_CONFIG,
    );
    expect(configProvider).toBeDefined();
    const { useValue } = configProvider as { useValue: { databaseProviderToken: symbol } };
    expect(useValue.databaseProviderToken).toBe(FAKE_DB_TOKEN);
  });

  it('wires WORKER_AUDIT_DATABASE to the supplied provider token', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const dbProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_DATABASE,
    );
    expect(dbProvider).toBeDefined();
    const { inject } = dbProvider as { inject: unknown[] };
    expect(inject).toEqual([FAKE_DB_TOKEN]);
  });

  it('CONSUMER_DATABASE factory returns the injected instance unchanged', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const dbProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_DATABASE,
    );
    const { useFactory } = dbProvider as { useFactory: (db: unknown) => unknown };
    const dummyDb = { marker: 'host-db' };
    expect(useFactory(dummyDb)).toBe(dummyDb);
  });

  it('registers the repository, service, and consumer as providers', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.providers).toContain(AuditRepository);
    expect(mod.providers).toContain(AuditService);
    expect(mod.providers).toContain(AuditConsumer);
  });

  it('exports the repository, service, and consumer for wiring into the app', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.exports).toContain(AuditRepository);
    expect(mod.exports).toContain(AuditService);
    expect(mod.exports).toContain(AuditConsumer);
  });

  it('applies the default retention of 2555 days when retentionDays is omitted', () => {
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    const configProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_CONFIG,
    );
    const { useValue } = configProvider as { useValue: { retentionDays: number } };
    expect(useValue.retentionDays).toBe(2555);
  });

  it('accepts an explicit retentionDays override', () => {
    const mod = WorkerAuditModule.register({
      databaseProviderToken: FAKE_DB_TOKEN,
      retentionDays: 30,
    });
    const configProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_CONFIG,
    );
    const { useValue } = configProvider as { useValue: { retentionDays: number } };
    expect(useValue.retentionDays).toBe(30);
  });

  it('accepts retentionDays: null to disable cleanup', () => {
    const mod = WorkerAuditModule.register({
      databaseProviderToken: FAKE_DB_TOKEN,
      retentionDays: null,
    });
    const configProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WORKER_AUDIT_CONFIG,
    );
    const { useValue } = configProvider as { useValue: { retentionDays: number | null } };
    expect(useValue.retentionDays).toBeNull();
  });

  it('is registered as a global module so ConsumerModule can inject AuditService', () => {
    // ConsumerModule instantiates AuditConsumer via its CONSUMER multi-provider
    // token, which means the consumer's constructor dependencies (including
    // AuditService) must be resolvable from ConsumerModule's scope. Marking the
    // dynamic registration global matches the DatabaseModule / SystemAmqpModule
    // convention and avoids requiring every sibling module to re-import this one.
    const mod = WorkerAuditModule.register({ databaseProviderToken: FAKE_DB_TOKEN });
    expect(mod.global).toBe(true);
  });
});
