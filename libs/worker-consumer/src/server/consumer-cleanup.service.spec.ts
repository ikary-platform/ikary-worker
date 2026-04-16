import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsumerCleanupService } from './consumer-cleanup.service.js';
import type { ConsumerOptions } from '../shared/consumer-options.schema.js';
import type { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';

function makeOptions(receiptRetentionDays: number | null): ConsumerOptions {
  return {
    queuePrefix: 'ikary.',
    exchange: 'cell.events',
    prefetch: 32,
    maxRetries: 5,
    dlx: 'cell.events.dlx',
    receiptRetentionDays,
  };
}

function makeReceipts() {
  return {
    deleteOlderThan: vi.fn<(d: Date) => Promise<number>>().mockResolvedValue(0),
    exists: vi.fn(),
    insert: vi.fn(),
  } satisfies Pick<ConsumerReceiptsRepository, 'deleteOlderThan' | 'exists' | 'insert'>;
}

describe('ConsumerCleanupService', () => {
  let receipts: ReturnType<typeof makeReceipts>;

  beforeEach(() => {
    receipts = makeReceipts();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('runCleanup', () => {
    it('deletes receipts older than (now - receiptRetentionDays) days', async () => {
      const svc = new ConsumerCleanupService(
        makeOptions(7),
        receipts as unknown as ConsumerReceiptsRepository,
      );
      receipts.deleteOlderThan.mockResolvedValue(14);

      const result = await svc.runCleanup();

      const cutoff = receipts.deleteOlderThan.mock.calls[0]![0];
      // 2026-04-16 minus 7 days == 2026-04-09
      expect(cutoff.toISOString()).toBe('2026-04-09T00:00:00.000Z');
      expect(result).toBe(14);
    });

    it('no-ops and returns 0 when receiptRetentionDays is null', async () => {
      const svc = new ConsumerCleanupService(
        makeOptions(null),
        receipts as unknown as ConsumerReceiptsRepository,
      );

      const result = await svc.runCleanup();

      expect(result).toBe(0);
      expect(receipts.deleteOlderThan).not.toHaveBeenCalled();
    });

    it('swallows repository Error and returns 0', async () => {
      const svc = new ConsumerCleanupService(
        makeOptions(7),
        receipts as unknown as ConsumerReceiptsRepository,
      );
      receipts.deleteOlderThan.mockRejectedValue(new Error('db down'));

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });

    it('swallows non-Error rejection values (defensive)', async () => {
      const svc = new ConsumerCleanupService(
        makeOptions(7),
        receipts as unknown as ConsumerReceiptsRepository,
      );
      receipts.deleteOlderThan.mockRejectedValue('boom');

      const result = await svc.runCleanup();

      expect(result).toBe(0);
    });
  });

  describe('handleScheduledCleanup', () => {
    it('delegates to runCleanup', () => {
      const svc = new ConsumerCleanupService(
        makeOptions(7),
        receipts as unknown as ConsumerReceiptsRepository,
      );
      const spy = vi.spyOn(svc, 'runCleanup').mockResolvedValue(0);

      svc.handleScheduledCleanup();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
