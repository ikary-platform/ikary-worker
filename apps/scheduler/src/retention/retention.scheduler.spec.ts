import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const envMock = vi.hoisted(() => ({
  RETENTION_AUDIT_DAYS:             2555  as number | null,
  RETENTION_ANALYTICS_DAYS:         90    as number | null,
  RETENTION_ACTIVITY_FEED_DAYS:     30    as number | null,
  RETENTION_CONSUMER_RECEIPTS_DAYS: 7     as number | null,
}));

vi.mock('../config/env.js', () => ({ env: envMock }));

import { RetentionScheduler } from './retention.scheduler.js';

const MS_PER_DAY = 86_400_000;

function makePublisher() {
  return { emit: vi.fn().mockResolvedValue(undefined) };
}

describe('RetentionScheduler', () => {
  let publisher: ReturnType<typeof makePublisher>;
  let scheduler: RetentionScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T03:00:00.000Z'));
    publisher = makePublisher();
    scheduler = new RetentionScheduler(publisher as never);

    // Reset env defaults
    envMock.RETENTION_AUDIT_DAYS = 2555;
    envMock.RETENTION_ANALYTICS_DAYS = 90;
    envMock.RETENTION_ACTIVITY_FEED_DAYS = 30;
    envMock.RETENTION_CONSUMER_RECEIPTS_DAYS = 7;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('auditRetention', () => {
    it('emits with correct name and cutoff date', async () => {
      await scheduler.auditRetention();
      const expected = new Date(Date.now() - 2555 * MS_PER_DAY).toISOString();
      expect(publisher.emit).toHaveBeenCalledWith({
        name: 'retention.audit',
        data: { cutoffDate: expected },
      });
    });

    it('skips when RETENTION_AUDIT_DAYS is null', async () => {
      envMock.RETENTION_AUDIT_DAYS = null;
      await scheduler.auditRetention();
      expect(publisher.emit).not.toHaveBeenCalled();
    });
  });

  describe('analyticsRetention', () => {
    it('emits with correct name and cutoff date', async () => {
      await scheduler.analyticsRetention();
      const expected = new Date(Date.now() - 90 * MS_PER_DAY).toISOString();
      expect(publisher.emit).toHaveBeenCalledWith({
        name: 'retention.analytics',
        data: { cutoffDate: expected },
      });
    });

    it('skips when RETENTION_ANALYTICS_DAYS is null', async () => {
      envMock.RETENTION_ANALYTICS_DAYS = null;
      await scheduler.analyticsRetention();
      expect(publisher.emit).not.toHaveBeenCalled();
    });
  });

  describe('activityFeedRetention', () => {
    it('emits with correct name and cutoff date', async () => {
      await scheduler.activityFeedRetention();
      const expected = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      expect(publisher.emit).toHaveBeenCalledWith({
        name: 'retention.activity-feed',
        data: { cutoffDate: expected },
      });
    });

    it('skips when RETENTION_ACTIVITY_FEED_DAYS is null', async () => {
      envMock.RETENTION_ACTIVITY_FEED_DAYS = null;
      await scheduler.activityFeedRetention();
      expect(publisher.emit).not.toHaveBeenCalled();
    });
  });

  describe('consumerReceiptsRetention', () => {
    it('emits with correct name and cutoff date', async () => {
      await scheduler.consumerReceiptsRetention();
      const expected = new Date(Date.now() - 7 * MS_PER_DAY).toISOString();
      expect(publisher.emit).toHaveBeenCalledWith({
        name: 'retention.consumer-receipts',
        data: { cutoffDate: expected },
      });
    });

    it('skips when RETENTION_CONSUMER_RECEIPTS_DAYS is null', async () => {
      envMock.RETENTION_CONSUMER_RECEIPTS_DAYS = null;
      await scheduler.consumerReceiptsRetention();
      expect(publisher.emit).not.toHaveBeenCalled();
    });
  });
});
