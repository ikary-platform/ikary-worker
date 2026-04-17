import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerJobsRepository, type UpsertPendingInput } from './scheduler-jobs.repository.js';

function makeQueryBuilder() {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['values']     = vi.fn().mockReturnValue(qb);
  qb['set']        = vi.fn().mockReturnValue(qb);
  qb['where']      = vi.fn().mockReturnValue(qb);
  qb['onConflict'] = vi.fn().mockImplementation((fn: (oc: unknown) => unknown) => {
    const oc = {
      column: vi.fn().mockReturnValue({
        doUpdateSet: vi.fn().mockReturnValue(qb),
      }),
    };
    fn(oc);
    return qb;
  });
  qb['execute'] = vi.fn().mockResolvedValue(undefined);
  return qb;
}

function makeDbService() {
  const qb = makeQueryBuilder();
  return {
    qb,
    db: {
      insertInto:  vi.fn().mockReturnValue(qb),
      updateTable: vi.fn().mockReturnValue(qb),
    },
  };
}

const input: UpsertPendingInput = {
  id:          'scheduler-retention.audit-2026-04-17',
  jobName:     'retention.audit',
  tenantId:    '_scheduler',
  workspaceId: '_scheduler',
  cellId:      '_scheduler',
  entityKey:   null,
  entityId:    null,
  eventId:     'scheduler-retention.audit-2026-04-17',
  eventData:   { cutoffDate: '2019-04-17T03:00:00.000Z' },
  scheduledAt: new Date('2026-04-17T03:00:00.000Z'),
};

describe('SchedulerJobsRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: SchedulerJobsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDbService();
    repo = new SchedulerJobsRepository(db as never);
  });

  describe('upsertPending', () => {
    it('inserts into ikary_scheduler_jobs', async () => {
      await repo.upsertPending(input);
      expect(db.db.insertInto).toHaveBeenCalledWith('ikary_scheduler_jobs');
    });

    it('sets status to pending with scope fields', async () => {
      await repo.upsertPending(input);
      expect(db.qb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id:           input.id,
          job_name:     input.jobName,
          tenant_id:    input.tenantId,
          workspace_id: input.workspaceId,
          cell_id:      input.cellId,
          entity_key:   null,
          entity_id:    null,
          status:       'pending',
          event_id:     input.eventId,
          event_data:   input.eventData,
          scheduled_at: input.scheduledAt,
        }),
      );
    });

    it('persists entity_key and entity_id when provided', async () => {
      const scoped = { ...input, entityKey: 'invoice', entityId: 'inv-1' };
      await repo.upsertPending(scoped);
      expect(db.qb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_key: 'invoice',
          entity_id:  'inv-1',
        }),
      );
    });

    it('uses ON CONFLICT to upsert on restart', async () => {
      await repo.upsertPending(input);
      expect(db.qb.onConflict).toHaveBeenCalledOnce();
    });
  });

  describe('markEmitted', () => {
    it('updates status to emitted with timestamp', async () => {
      await repo.markEmitted('scheduler-retention.audit-2026-04-17');
      expect(db.db.updateTable).toHaveBeenCalledWith('ikary_scheduler_jobs');
      expect(db.qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'emitted' }),
      );
      expect(db.qb.where).toHaveBeenCalledWith('id', '=', 'scheduler-retention.audit-2026-04-17');
    });
  });

  describe('markFailed', () => {
    it('updates status to failed with error message', async () => {
      await repo.markFailed('scheduler-retention.audit-2026-04-17', 'connection refused');
      expect(db.db.updateTable).toHaveBeenCalledWith('ikary_scheduler_jobs');
      expect(db.qb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status:        'failed',
          error_message: 'connection refused',
        }),
      );
    });
  });
});
