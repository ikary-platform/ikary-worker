import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AuditConsumer } from './audit.consumer.js';
import { AuditService } from './audit.service.js';

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

describe('AuditConsumer', () => {
  it('exposes the public contract fields expected by the framework', () => {
    const service = { record: vi.fn() } as unknown as AuditService;
    const consumer = new AuditConsumer(service);

    // Queue name + routing key behaviour is part of the public contract —
    // changing them would re-bind in prod.
    expect(consumer.name).toBe('worker-audit');
    expect(consumer.eventTypes).toBe('#');
    // Must be unordered — audit is a cross-aggregate sink.
    expect(consumer.ordered).toBe(false);
  });

  it('delegates to service.record with the supplied event and transaction', async () => {
    const service = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const consumer = new AuditConsumer(service);
    const tx = { TX: true } as never;

    await consumer.handle(event, tx);

    expect(service.record).toHaveBeenCalledWith(event, tx);
    expect(service.record).toHaveBeenCalledOnce();
  });
});
