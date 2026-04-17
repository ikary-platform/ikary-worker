import { describe, it, expect, vi } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AuditRetentionConsumer } from './audit-retention.consumer.js';
import { AuditRepository } from '../../server/repositories/audit.repository.js';

const event: DomainEventEnvelope = {
  event_id:     'scheduler-retention.audit-2026-04-17',
  event_name:   'scheduler.retention.audit',
  version:      1,
  timestamp:    '2026-04-17T03:00:00.000Z',
  tenant_id:    '_scheduler',
  workspace_id: '_scheduler',
  cell_id:      '_scheduler',
  actor:        { type: 'system', id: 'scheduler' },
  entity:       { type: 'scheduler', id: 'retention.audit' },
  data:         { cutoffDate: '2019-04-17T03:00:00.000Z' },
  previous:     {},
  metadata:     {},
};

describe('AuditRetentionConsumer', () => {
  it('exposes the public contract fields', () => {
    const repo = { deleteOlderThan: vi.fn() } as unknown as AuditRepository;
    const consumer = new AuditRetentionConsumer(repo);
    expect(consumer.name).toBe('worker-audit-retention');
    expect(consumer.eventTypes).toBe('#.scheduler.retention.audit');
    expect(consumer.ordered).toBe(false);
  });

  it('parses cutoffDate and delegates to repository.deleteOlderThan with tx', async () => {
    const repo = {
      deleteOlderThan: vi.fn().mockResolvedValue(42),
    } as unknown as AuditRepository;
    const consumer = new AuditRetentionConsumer(repo);
    const tx = { TX: true } as never;

    await consumer.handle(event, tx);

    expect(repo.deleteOlderThan).toHaveBeenCalledWith(
      new Date('2019-04-17T03:00:00.000Z'),
      tx,
    );
    expect(repo.deleteOlderThan).toHaveBeenCalledOnce();
  });
});
