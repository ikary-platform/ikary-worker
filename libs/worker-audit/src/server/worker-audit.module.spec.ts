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
});
