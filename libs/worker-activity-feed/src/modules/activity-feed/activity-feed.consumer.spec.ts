import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { ActivityFeedConsumer } from './activity-feed.consumer.js';
import { ActivityFeedService } from './activity-feed.service.js';

const event: DomainEventEnvelope = {
  event_id:     'e1',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-04-16T10:00:00.000Z',
  tenant_id:    't1',
  workspace_id: 'w1',
  cell_id:      'c1',
  actor:        { type: 'user', id: 'u1' },
  entity:       { type: 'invoice', id: 'inv-1' },
  data:         {},
  previous:     {},
  metadata:     {},
};

describe('ActivityFeedConsumer', () => {
  it('exposes the public contract fields', () => {
    const consumer = new ActivityFeedConsumer({} as ActivityFeedService);
    expect(consumer.name).toBe('worker-activity-feed');
    expect(consumer.eventTypes).toBe('#');
    expect(consumer.ordered).toBe(false);
  });

  it('delegates to service.record', async () => {
    const service = { record: vi.fn().mockResolvedValue(undefined) } as unknown as ActivityFeedService;
    const consumer = new ActivityFeedConsumer(service);
    const tx = { TX: true } as never;
    await consumer.handle(event, tx);
    expect(service.record).toHaveBeenCalledWith(event, tx);
  });
});
