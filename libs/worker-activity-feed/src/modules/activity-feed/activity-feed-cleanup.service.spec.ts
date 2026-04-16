import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActivityFeedCleanupService } from './activity-feed-cleanup.service.js';
import type { WorkerActivityFeedConfig } from '../../config/worker-activity-feed.config.js';
import type { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';

function makeConfig(retentionDays: number | null): WorkerActivityFeedConfig {
  return {
    databaseProviderToken: Symbol('db'),
    retentionDays,
  };
}

function makeRepository() {
  return {
    deleteOlderThan: vi.fn<(d: Date) => Promise<number>>().mockResolvedValue(0),
    insertIfNotExists: vi.fn().mockResolvedValue(undefined),
  } satisfies Pick<ActivityFeedRepository, 'deleteOlderThan' | 'insertIfNotExists'>;
}

describe('ActivityFeedCleanupService', () => {
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
      const svc = new ActivityFeedCleanupService(
        makeConfig(30),
        repo as unknown as ActivityFeedRepository,
      );
      repo.deleteOlderThan.mockResolvedValue(55);

      const result = await svc.runCleanup();

      const cutoff = repo.deleteOlderThan.mock.calls[0]![0];
      // 2026-04-16T00:00:00Z minus 30 days == 2026-03-17T00:00:00Z.
      expect(cutoff.toISOString()).toBe('2026-03-17T00:00:00.000Z');
      expect(result).toBe(55);
    });

    it('no-ops and returns 0 when retentionDays is null', async () => {
      const svc = new ActivityFeedCleanupService(
        makeConfig(null),
        repo as unknown as ActivityFeedRepository,
      );

      const result = await svc.runCleanup();

      expect(result).toBe(0);
      expect(repo.deleteOlderThan).not.toHaveBeenCalled();
    });

    it('swallows repository Error and returns 0', async () => {
      const svc = new ActivityFeedCleanupService(
        makeConfig(30),
        repo as unknown as ActivityFeedRepository,
      );
      repo.deleteOlderThan.mockRejectedValue(new Error('db down'));

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });

    it('swallows non-Error rejection values (defensive)', async () => {
      const svc = new ActivityFeedCleanupService(
        makeConfig(30),
        repo as unknown as ActivityFeedRepository,
      );
      repo.deleteOlderThan.mockRejectedValue('boom');

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });
  });

  describe('handleScheduledCleanup', () => {
    it('delegates to runCleanup', () => {
      const svc = new ActivityFeedCleanupService(
        makeConfig(30),
        repo as unknown as ActivityFeedRepository,
      );
      const spy = vi.spyOn(svc, 'runCleanup').mockResolvedValue(0);

      svc.handleScheduledCleanup();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
