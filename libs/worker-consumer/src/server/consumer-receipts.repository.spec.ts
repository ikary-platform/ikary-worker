import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';

// Minimal Kysely query-builder stub.
function makeQueryBuilder(returnValue: unknown) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['select']      = vi.fn().mockReturnValue(qb);
  qb['where']       = vi.fn().mockReturnValue(qb);
  qb['values']      = vi.fn().mockReturnValue(qb);
  qb['executeTakeFirst'] = vi.fn().mockResolvedValue(returnValue);
  qb['execute']     = vi.fn().mockResolvedValue(undefined);
  return qb;
}

function makeDeleteQueryBuilder(numDeletedRows: number | bigint = 0) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['where']            = vi.fn().mockReturnValue(qb);
  qb['executeTakeFirst'] = vi.fn().mockResolvedValue({ numDeletedRows });
  return qb;
}

function makeDbService(returnValue: unknown) {
  const qb = makeQueryBuilder(returnValue);
  const deleteQb = makeDeleteQueryBuilder(0);
  return {
    qb,
    deleteQb,
    db: {
      selectFrom: vi.fn().mockReturnValue(qb),
      insertInto: vi.fn().mockReturnValue(qb),
      deleteFrom: vi.fn().mockReturnValue(deleteQb),
    },
  };
}

describe('ConsumerReceiptsRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: ConsumerReceiptsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exists() returns true when a row is found', async () => {
    db = makeDbService({ event_id: 'evt-001' });
    repo = new ConsumerReceiptsRepository(db as never);
    await expect(repo.exists('audit', 'evt-001')).resolves.toBe(true);
    expect(db.db.selectFrom).toHaveBeenCalledWith('ikary_event_consumer_receipts');
  });

  it('exists() returns false when no row is found', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerReceiptsRepository(db as never);
    await expect(repo.exists('audit', 'evt-missing')).resolves.toBe(false);
  });

  it('insert() uses the DatabaseService.db when no client is supplied', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerReceiptsRepository(db as never);
    await repo.insert('audit', 'evt-002');
    expect(db.db.insertInto).toHaveBeenCalledWith('ikary_event_consumer_receipts');
    expect(db.qb.values).toHaveBeenCalledWith({
      consumer_name: 'audit',
      event_id:      'evt-002',
    });
  });

  it('insert() uses the supplied transaction client when one is provided', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerReceiptsRepository(db as never);
    const txQb = makeQueryBuilder(undefined);
    const tx = { insertInto: vi.fn().mockReturnValue(txQb) };
    await repo.insert('audit', 'evt-003', tx as never);
    expect(tx.insertInto).toHaveBeenCalledWith('ikary_event_consumer_receipts');
    expect(db.db.insertInto).not.toHaveBeenCalled();
  });

  describe('deleteOlderThan', () => {
    it('filters by received_at < ISO cutoff and returns the count', async () => {
      db = makeDbService(undefined);
      repo = new ConsumerReceiptsRepository(db as never);
      db.deleteQb.executeTakeFirst.mockResolvedValue({ numDeletedRows: 99 });
      const cutoff = new Date('2026-04-09T00:00:00.000Z');

      const deleted = await repo.deleteOlderThan(cutoff);

      expect(db.db.deleteFrom).toHaveBeenCalledWith('ikary_event_consumer_receipts');
      expect(db.deleteQb.where).toHaveBeenCalledWith('received_at', '<', cutoff);
      expect(deleted).toBe(99);
    });

    it('coerces a bigint numDeletedRows to number', async () => {
      db = makeDbService(undefined);
      repo = new ConsumerReceiptsRepository(db as never);
      db.deleteQb.executeTakeFirst.mockResolvedValue({ numDeletedRows: 10000n });
      const deleted = await repo.deleteOlderThan(new Date());
      expect(deleted).toBe(10000);
    });

    it('returns 0 when numDeletedRows is missing', async () => {
      db = makeDbService(undefined);
      repo = new ConsumerReceiptsRepository(db as never);
      db.deleteQb.executeTakeFirst.mockResolvedValue({});
      const deleted = await repo.deleteOlderThan(new Date());
      expect(deleted).toBe(0);
    });
  });
});
