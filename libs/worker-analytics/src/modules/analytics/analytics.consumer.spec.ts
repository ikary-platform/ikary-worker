import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AnalyticsConsumer } from './analytics.consumer.js';
import { AnalyticsService } from './analytics.service.js';

const event: DomainEventEnvelope = {
  event_id:     'evt-001',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-04-16T10:00:00.000Z',
  tenant_id:    't1',
  workspace_id: 'w1',
  cell_id:      'c1',
  actor:        { type: 'user', id: 'user-1' },
  entity:       { type: 'invoice', id: 'inv-1' },
  data:         { amount: 100 },
  previous:     {},
  metadata:     {},
};

describe('AnalyticsConsumer', () => {
  it('exposes the public contract fields', () => {
    const consumer = new AnalyticsConsumer({} as AnalyticsService);
    expect(consumer.name).toBe('worker-analytics');
    expect(consumer.eventTypes).toBe('#');
    expect(consumer.ordered).toBe(false);
  });

  it('delegates to AnalyticsService.record with the supplied event and tx', async () => {
    const service = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalyticsService;
    const consumer = new AnalyticsConsumer(service);
    const tx = { TX: true } as never;
    await consumer.handle(event, tx);
    expect(service.record).toHaveBeenCalledWith(event, tx);
    expect(service.record).toHaveBeenCalledOnce();
  });
});
