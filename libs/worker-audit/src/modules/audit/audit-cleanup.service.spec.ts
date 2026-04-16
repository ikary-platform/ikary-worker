import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditCleanupService } from './audit-cleanup.service.js';
import type { WorkerAuditConfig } from '../../config/worker-audit.config.js';
import type { AuditRepository } from '../../server/repositories/audit.repository.js';

/**
 * Build a config whose DI-critical fields are stubbed. Tests tweak just
 * `retentionDays` — everything else is noise for cleanup behaviour.
 */
function makeConfig(retentionDays: number | null): WorkerAuditConfig {
  return {
    databaseProviderToken: Symbol('db'),
    retentionDays,
  };
}

function makeRepository() {
  return {
    deleteOlderThan: vi.fn<(d: Date) => Promise<number>>().mockResolvedValue(0),
    insertIfNotExists: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<AuditRepository, 'deleteOlderThan' | 'insertIfNotExists'>;
}

describe('AuditCleanupService', () => {
  let repo: ReturnType<typeof makeRepository>;

  beforeEach(() => {
    repo = makeRepository();
    // Pin Date.now so the cutoff is deterministic. 2026-04-16T00:00:00Z.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('runCleanup', () => {
    it('deletes rows older than (now - retentionDays) days', async () => {
      const svc = new AuditCleanupService(makeConfig(30), repo as unknown as AuditRepository);
      repo.deleteOlderThan.mockResolvedValue(7);

      const result = await svc.runCleanup();

      expect(repo.deleteOlderThan).toHaveBeenCalledOnce();
      const cutoff = repo.deleteOlderThan.mock.calls[0]![0];
      // 2026-04-16T00:00:00Z minus 30 days == 2026-03-17T00:00:00Z.
      expect(cutoff.toISOString()).toBe('2026-03-17T00:00:00.000Z');
      expect(result).toBe(7);
    });

    it('uses the default 2555-day window (≈ 7 years) when not overridden', async () => {
      const svc = new AuditCleanupService(makeConfig(2555), repo as unknown as AuditRepository);

      await svc.runCleanup();

      const cutoff = repo.deleteOlderThan.mock.calls[0]![0];
      const expected = new Date('2026-04-16T00:00:00.000Z').getTime() - 2555 * 86_400_000;
      expect(cutoff.getTime()).toBe(expected);
    });

    it('no-ops and returns 0 when retentionDays is null', async () => {
      const svc = new AuditCleanupService(makeConfig(null), repo as unknown as AuditRepository);

      const result = await svc.runCleanup();

      expect(result).toBe(0);
      expect(repo.deleteOlderThan).not.toHaveBeenCalled();
    });

    it('swallows repository errors, logs, and returns 0 — does not crash the pod', async () => {
      const svc = new AuditCleanupService(makeConfig(30), repo as unknown as AuditRepository);
      repo.deleteOlderThan.mockRejectedValue(new Error('db down'));

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });

    it('swallows non-Error rejection values too (defensive path)', async () => {
      const svc = new AuditCleanupService(makeConfig(30), repo as unknown as AuditRepository);
      repo.deleteOlderThan.mockRejectedValue('string failure');

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });
  });

  describe('handleScheduledCleanup', () => {
    it('delegates to runCleanup (fire-and-forget — method returns void)', () => {
      const svc = new AuditCleanupService(makeConfig(30), repo as unknown as AuditRepository);
      const spy = vi.spyOn(svc, 'runCleanup').mockResolvedValue(0);

      svc.handleScheduledCleanup();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
