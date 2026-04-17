import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { ReceiptRetentionConsumer } from './receipt-retention.consumer.js';
import { ConsumerReceiptsRepository } from '../../server/consumer-receipts.repository.js';

const event: DomainEventEnvelope = {
  event_id:     'scheduler-retention.consumer-receipts-2026-04-17',
  event_name:   'scheduler.retention.consumer-receipts',
  version:      1,
  timestamp:    '2026-04-17T03:30:00.000Z',
  tenant_id:    '_scheduler',
  workspace_id: '_scheduler',
  cell_id:      '_scheduler',
  actor:        { type: 'system', id: 'scheduler' },
  entity:       { type: 'scheduler', id: 'retention.consumer-receipts' },
  data:         { cutoffDate: '2026-04-10T03:30:00.000Z' },
  previous:     {},
  metadata:     {},
};

describe('ReceiptRetentionConsumer', () => {
  it('exposes the public contract fields', () => {
    const repo = { deleteOlderThan: vi.fn() } as unknown as ConsumerReceiptsRepository;
    const consumer = new ReceiptRetentionConsumer(repo);
    expect(consumer.name).toBe('worker-consumer-receipt-retention');
    expect(consumer.eventTypes).toBe('#.scheduler.retention.consumer-receipts');
    expect(consumer.ordered).toBe(false);
  });

  it('parses cutoffDate and delegates to repository.deleteOlderThan with tx', async () => {
    const repo = {
      deleteOlderThan: vi.fn().mockResolvedValue(3),
    } as unknown as ConsumerReceiptsRepository;
    const consumer = new ReceiptRetentionConsumer(repo);
    const tx = { TX: true } as never;

    await consumer.handle(event, tx);

    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      new Date('2026-04-10T03:30:00.000Z'),
      tx,
    );
    expect(repo.deleteOlderThan).toHaveBeenCalledOnce();
  });
});
