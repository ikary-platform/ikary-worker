import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalyticsCleanupService } from './analytics-cleanup.service.js';
import type { WorkerAnalyticsConfig } from '../../config/worker-analytics.config.js';
import type { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';

function makeConfig(retentionDays: number | null): WorkerAnalyticsConfig {
  return {
    databaseProviderToken: Symbol('db'),
    retentionDays,
  };
}

function makeRepository() {
  return {
    deleteOlderThan: vi.fn<(d: Date) => Promise<number>>().mockResolvedValue(0),
    upsertBucket: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<AnalyticsRepository, 'deleteOlderThan' | 'upsertBucket'>;
}

describe('AnalyticsCleanupService', () => {
  let repo: ReturnType<typeof makeRepository>;

  beforeEach(() => {
    repo = makeRepository();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('runCleanup', () => {
    it('deletes rows older than (now - retentionDays) days', async () => {
      const svc = new AnalyticsCleanupService(
        makeConfig(90),
        repo as unknown as AnalyticsRepository,
      );
      repo.deleteOlderThan.mockResolvedValue(123);

      const result = await svc.runCleanup();

      const cutoff = repo.deleteOlderThan.mock.calls[0]![0];
      // 2026-04-16T00:00:00Z minus 90 days == 2026-01-16T00:00:00Z.
      expect(cutoff.toISOString()).toBe('2026-01-16T00:00:00.000Z');
      expect(result).toBe(123);
    });

    it('no-ops and returns 0 when retentionDays is null', async () => {
      const svc = new AnalyticsCleanupService(
        makeConfig(null),
        repo as unknown as AnalyticsRepository,
      );

      const result = await svc.runCleanup();

      expect(result).toBe(0);
      expect(repo.deleteOlderThan).not.toHaveBeenCalled();
    });

    it('swallows repository Error and returns 0', async () => {
      const svc = new AnalyticsCleanupService(
        makeConfig(90),
        repo as unknown as AnalyticsRepository,
      );
      repo.deleteOlderThan.mockRejectedValue(new Error('db down'));

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });

    it('swallows non-Error rejection values (defensive)', async () => {
      const svc = new AnalyticsCleanupService(
        makeConfig(90),
        repo as unknown as AnalyticsRepository,
      );
      repo.deleteOlderThan.mockRejectedValue('boom');

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });
  });

  describe('handleScheduledCleanup', () => {
    it('delegates to runCleanup', () => {
      const svc = new AnalyticsCleanupService(
        makeConfig(90),
        repo as unknown as AnalyticsRepository,
      );
      const spy = vi.spyOn(svc, 'runCleanup').mockResolvedValue(0);

      svc.handleScheduledCleanup();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
