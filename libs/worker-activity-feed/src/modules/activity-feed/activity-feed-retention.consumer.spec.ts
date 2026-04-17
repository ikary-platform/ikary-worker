import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { ActivityFeedRetentionConsumer } from './activity-feed-retention.consumer.js';
import { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';

const event: DomainEventEnvelope = {
  event_id:     'scheduler-retention.activity-feed-2026-04-17',
  event_name:   'scheduler.retention.activity-feed',
  version:      1,
  timestamp:    '2026-04-17T03:20:00.000Z',
  tenant_id:    '_scheduler',
  workspace_id: '_scheduler',
  cell_id:      '_scheduler',
  actor:        { type: 'system', id: 'scheduler' },
  entity:       { type: 'scheduler', id: 'retention.activity-feed' },
  data:         { cutoffDate: '2026-03-18T03:20:00.000Z' },
  previous:     {},
  metadata:     {},
};

describe('ActivityFeedRetentionConsumer', () => {
  it('exposes the public contract fields', () => {
    const repo = { deleteOlderThan: vi.fn() } as unknown as ActivityFeedRepository;
    const consumer = new ActivityFeedRetentionConsumer(repo);
    expect(consumer.name).toBe('worker-activity-feed-retention');
    expect(consumer.eventTypes).toBe('#.scheduler.retention.activity-feed');
    expect(consumer.ordered).toBe(false);
  });

  it('parses cutoffDate and delegates to repository.deleteOlderThan with tx', async () => {
    const repo = {
      deleteOlderThan: vi.fn().mockResolvedValue(8),
    } as unknown as ActivityFeedRepository;
    const consumer = new ActivityFeedRetentionConsumer(repo);
    const tx = { TX: true } as never;

    await consumer.handle(event, tx);

    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      new Date('2026-03-18T03:20:00.000Z'),
      tx,
    );
    expect(repo.deleteOlderThan).toHaveBeenCalledOnce();
  });
});
