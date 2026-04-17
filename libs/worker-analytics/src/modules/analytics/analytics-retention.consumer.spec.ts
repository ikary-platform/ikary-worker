import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AnalyticsRetentionConsumer } from './analytics-retention.consumer.js';
import { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';

const event: DomainEventEnvelope = {
  event_id:     'scheduler-retention.analytics-2026-04-17',
  event_name:   'scheduler.retention.analytics',
  version:      1,
  timestamp:    '2026-04-17T03:10:00.000Z',
  tenant_id:    '_scheduler',
  workspace_id: '_scheduler',
  cell_id:      '_scheduler',
  actor:        { type: 'system', id: 'scheduler' },
  entity:       { type: 'scheduler', id: 'retention.analytics' },
  data:         { cutoffDate: '2026-01-17T03:10:00.000Z' },
  previous:     {},
  metadata:     {},
};

describe('AnalyticsRetentionConsumer', () => {
  it('exposes the public contract fields', () => {
    const repo = { deleteOlderThan: vi.fn() } as unknown as AnalyticsRepository;
    const consumer = new AnalyticsRetentionConsumer(repo);
    expect(consumer.name).toBe('worker-analytics-retention');
    expect(consumer.eventTypes).toBe('#.scheduler.retention.analytics');
    expect(consumer.ordered).toBe(false);
  });

  it('parses cutoffDate and delegates to repository.deleteOlderThan with tx', async () => {
    const repo = {
      deleteOlderThan: vi.fn().mockResolvedValue(15),
    } as unknown as AnalyticsRepository;
    const consumer = new AnalyticsRetentionConsumer(repo);
    const tx = { TX: true } as never;

    await consumer.handle(event, tx);

    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      new Date('2026-01-17T03:10:00.000Z'),
      tx,
    );
    expect(repo.deleteOlderThan).toHaveBeenCalledOnce();
  });
});
