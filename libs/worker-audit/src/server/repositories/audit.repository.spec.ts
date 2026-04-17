import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditRepository } from './audit.repository.js';
import type { AuditEntry } from '../../shared/audit-entry.schema.js';

function makeQueryBuilder() {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['values']  = vi.fn().mockReturnValue(qb);
  qb['where']   = vi.fn().mockReturnValue(qb);
  qb['onConflict'] = vi.fn().mockImplementation((fn: (oc: unknown) => unknown) => {
    const oc = { column: vi.fn().mockReturnValue({ doNothing: vi.fn().mockReturnValue(qb) }) };
    fn(oc);
    return qb;
  });
  qb['execute'] = vi.fn().mockResolvedValue(undefined);
  qb['executeTakeFirst'] = vi.fn().mockResolvedValue({ numDeletedRows: BigInt(5) });
  return qb;
}

function makeDbService() {
  const qb = makeQueryBuilder();
  return {
    qb,
    db: {
      insertInto: vi.fn().mockReturnValue(qb),
      deleteFrom: vi.fn().mockReturnValue(qb),
    },
  };
}

const entry: AuditEntry = {
  eventId:          'evt-1',
  eventName:        'invoice.created',
  eventVersion:     1,
  occurredAt:       '2026-04-16T10:00:00.000Z',
  tenantId:         't1',
  workspaceId:      'w1',
  cellId:           'c1',
  actorId:          'u1',
  actorType:        'user',
  resourceType:     'invoice',
  resourceId:       'inv-1',
  resourceVersion:  1,
  changeKind:       'snapshot',
  diff:             null,
  snapshot:         { amount: 100 },
  metadata:         { src: 'unit-test' },
  redactionApplied: false,
};

describe('AuditRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: AuditRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDbService();
    repo = new AuditRepository(db as never);
  });

  it('uses the DatabaseService.db when no client is supplied', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.db.insertInto).toHaveBeenCalledWith('ikary_audit_entries');
  });

  it('uses the supplied transaction client when provided', async () => {
    const txQb = makeQueryBuilder();
    const tx = { insertInto: vi.fn().mockReturnValue(txQb) };
    await repo.insertIfNotExists(entry, tx as never);
    expect(tx.insertInto).toHaveBeenCalledWith('ikary_audit_entries');
    expect(db.db.insertInto).not.toHaveBeenCalled();
  });

  it('maps camelCase entry fields to snake_case DB columns', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id:          entry.eventId,
        event_name:        entry.eventName,
        event_version:     entry.eventVersion,
        occurred_at:       entry.occurredAt,
        tenant_id:         entry.tenantId,
        workspace_id:      entry.workspaceId,
        cell_id:           entry.cellId,
        actor_id:          entry.actorId,
        actor_type:        entry.actorType,
        resource_type:     entry.resourceType,
        resource_id:       entry.resourceId,
        resource_version:  entry.resourceVersion,
        change_kind:       entry.changeKind,
        snapshot:          entry.snapshot,
        diff:              entry.diff,
        metadata:          entry.metadata,
        redaction_applied: entry.redactionApplied,
      }),
    );
  });

  it('coerces a null diff to a literal null on the insert', async () => {
    await repo.insertIfNotExists({ ...entry, diff: null });
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ diff: null }),
    );
  });

  it('coerces a null snapshot to a literal null on the insert', async () => {
    await repo.insertIfNotExists({ ...entry, snapshot: null });
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: null }),
    );
  });

  it('uses ON CONFLICT DO NOTHING on event_id', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.qb.onConflict).toHaveBeenCalledOnce();
  });

  describe('deleteOlderThan', () => {
    it('uses DatabaseService.db when no client is supplied', async () => {
      await repo.deleteOlderThan(new Date('2026-01-01'));
      expect(db.db.deleteFrom).toHaveBeenCalledWith('ikary_audit_entries');
      expect(db.qb.where).toHaveBeenCalledWith('occurred_at', '<', new Date('2026-01-01'));
    });

    it('uses the supplied transaction client when provided', async () => {
      const txQb = makeQueryBuilder();
      const tx = { deleteFrom: vi.fn().mockReturnValue(txQb) };
      await repo.deleteOlderThan(new Date('2026-01-01'), tx as never);
      expect(tx.deleteFrom).toHaveBeenCalledWith('ikary_audit_entries');
      expect(db.db.deleteFrom).not.toHaveBeenCalled();
    });

    it('returns the count of deleted rows', async () => {
      const count = await repo.deleteOlderThan(new Date('2026-01-01'));
      expect(count).toBe(5);
    });

    it('returns 0 when numDeletedRows is undefined', async () => {
      db.qb.executeTakeFirst.mockResolvedValueOnce({ numDeletedRows: undefined });
      const count = await repo.deleteOlderThan(new Date('2026-01-01'));
      expect(count).toBe(0);
    });
  });
});
