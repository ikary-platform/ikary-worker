import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityFeedRepository } from './activity-feed.repository.js';
import type { ActivityEntry } from '../../shared/activity-entry.schema.js';

function makeQueryBuilder() {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['values']     = vi.fn().mockReturnValue(qb);
  qb['onConflict'] = vi.fn().mockImplementation((fn: (oc: unknown) => unknown) => {
    const oc = { column: vi.fn().mockReturnValue({ doNothing: vi.fn().mockReturnValue(qb) }) };
    fn(oc);
    return qb;
  });
  qb['execute'] = vi.fn().mockResolvedValue(undefined);
  return qb;
}

function makeDbService() {
  const qb = makeQueryBuilder();
  return { qb, db: { insertInto: vi.fn().mockReturnValue(qb) } };
}

const entry: ActivityEntry = {
  eventId:      'e1',
  eventName:    'invoice.created',
  tenantId:     't1',
  workspaceId:  'w1',
  cellId:       'c1',
  actorId:      'u1',
  actorType:    'user',
  resourceType: 'invoice',
  resourceId:   'inv-1',
  title:        'invoice.created',
  summary:      '{"amount":100}',
  payload:      { amount: 100 },
  occurredAt:   '2026-04-16T10:00:00.000Z',
};

describe('ActivityFeedRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: ActivityFeedRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDbService();
    repo = new ActivityFeedRepository(db as never);
  });

  it('uses the DatabaseService.db when no client is supplied', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.db.insertInto).toHaveBeenCalledWith('ikary_activity_entries');
  });

  it('uses the supplied transaction client when provided', async () => {
    const txQb = makeQueryBuilder();
    const tx = { insertInto: vi.fn().mockReturnValue(txQb) };
    await repo.insertIfNotExists(entry, tx as never);
    expect(tx.insertInto).toHaveBeenCalledWith('ikary_activity_entries');
    expect(db.db.insertInto).not.toHaveBeenCalled();
  });

  it('maps camelCase entry to snake_case columns', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id:      entry.eventId,
        event_name:    entry.eventName,
        tenant_id:     entry.tenantId,
        workspace_id:  entry.workspaceId,
        cell_id:       entry.cellId,
        actor_id:      entry.actorId,
        actor_type:    entry.actorType,
        resource_type: entry.resourceType,
        resource_id:   entry.resourceId,
        title:         entry.title,
        summary:       entry.summary,
        payload:       entry.payload,
        occurred_at:   entry.occurredAt,
      }),
    );
  });

  it('uses ON CONFLICT DO NOTHING on event_id', async () => {
    await repo.insertIfNotExists(entry);
    expect(db.qb.onConflict).toHaveBeenCalledOnce();
  });
});
