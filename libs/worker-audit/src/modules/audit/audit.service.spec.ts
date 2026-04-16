import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AuditService } from './audit.service.js';
import { AuditRepository } from '../../server/repositories/audit.repository.js';

const baseEvent: DomainEventEnvelope = {
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
  metadata:     { source: 'test' },
};

describe('AuditService', () => {
  let repo: AuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repo = {
      insertIfNotExists: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditRepository;
    service = new AuditService(repo);
  });

  describe('buildEntry', () => {
    it('produces a snapshot entry when previous is empty', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.changeKind).toBe('snapshot');
      expect(entry.snapshot).toEqual({ amount: 100 });
      expect(entry.diff).toBeNull();
    });

    it('produces a diff entry when previous has keys', () => {
      const entry = service.buildEntry({
        ...baseEvent,
        data:     { amount: 200 },
        previous: { amount: 100 },
      });
      expect(entry.changeKind).toBe('diff');
      expect(entry.diff).toEqual({ from: { amount: 100 }, to: { amount: 200 } });
      expect(entry.snapshot).toBeNull();
    });

    it('carries over the actor, entity, and versioning fields verbatim', () => {
      const entry = service.buildEntry({
        ...baseEvent,
        actor:   { type: 'system', id: 'sys-1' },
        entity:  { type: 'customer', id: 'cust-1' },
        version: 7,
      });
      expect(entry.actorId).toBe('sys-1');
      expect(entry.actorType).toBe('system');
      expect(entry.resourceType).toBe('customer');
      expect(entry.resourceId).toBe('cust-1');
      expect(entry.resourceVersion).toBe(7);
      expect(entry.eventVersion).toBe(7);
    });

    it('passes through nullable workspace and cell ids unchanged', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.workspaceId).toBe('w1');
      expect(entry.cellId).toBe('c1');
    });

    it('defaults redactionApplied to false', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.redactionApplied).toBe(false);
    });
  });

  describe('record', () => {
    it('delegates the built entry to the repository with the supplied transaction', async () => {
      const fakeTx = { TX: true } as never;
      await service.record(baseEvent, fakeTx);
      expect(repo.insertIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'evt-001', changeKind: 'snapshot' }),
        fakeTx,
      );
    });
  });
});
