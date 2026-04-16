import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';

function makeQueryBuilder(returnValue: unknown) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['select']           = vi.fn().mockReturnValue(qb);
  qb['where']            = vi.fn().mockReturnValue(qb);
  qb['values']           = vi.fn().mockReturnValue(qb);
  qb['executeTakeFirst'] = vi.fn().mockResolvedValue(returnValue);
  qb['execute']          = vi.fn().mockResolvedValue(undefined);
  qb['onConflict']       = vi.fn().mockImplementation((fn: (oc: unknown) => unknown) => {
    const oc = {
      columns: vi.fn().mockReturnValue({ doUpdateSet: vi.fn().mockReturnValue(undefined) }),
    };
    fn(oc);
    return qb;
  });
  return qb;
}

function makeDbService(returnValue: unknown) {
  const qb = makeQueryBuilder(returnValue);
  return {
    qb,
    db: {
      selectFrom: vi.fn().mockReturnValue(qb),
      insertInto: vi.fn().mockReturnValue(qb),
    },
  };
}

describe('ConsumerOffsetsRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: ConsumerOffsetsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getLastVersion returns the stored last_version', async () => {
    db = makeDbService({ last_version: 7 });
    repo = new ConsumerOffsetsRepository(db as never);
    await expect(repo.getLastVersion('audit', 'tenant-1', 'invoice:inv-1'))
      .resolves.toBe(7);
  });

  it('getLastVersion returns null when no offset is recorded', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerOffsetsRepository(db as never);
    await expect(repo.getLastVersion('audit', 'tenant-1', 'invoice:inv-1'))
      .resolves.toBeNull();
  });

  it('upsert uses DatabaseService.db when no client is supplied', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerOffsetsRepository(db as never);
    await repo.upsert('audit', 'tenant-1', 'invoice:inv-1', 5);
    expect(db.db.insertInto).toHaveBeenCalledWith('ikary_event_consumer_offsets');
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer_name: 'audit',
        tenant_id:     'tenant-1',
        aggregate_key: 'invoice:inv-1',
        last_version:  5,
      }),
    );
    expect(db.qb.onConflict).toHaveBeenCalled();
  });

  it('upsert uses the supplied transaction client when provided', async () => {
    db = makeDbService(undefined);
    repo = new ConsumerOffsetsRepository(db as never);
    const txQb = makeQueryBuilder(undefined);
    const tx = { insertInto: vi.fn().mockReturnValue(txQb) };
    await repo.upsert('audit', 'tenant-1', 'invoice:inv-1', 5, tx as never);
    expect(tx.insertInto).toHaveBeenCalledWith('ikary_event_consumer_offsets');
    expect(db.db.insertInto).not.toHaveBeenCalled();
  });
});
