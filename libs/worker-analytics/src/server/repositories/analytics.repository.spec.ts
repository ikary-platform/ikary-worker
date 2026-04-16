import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsRepository } from './analytics.repository.js';
import type { AnalyticsBucket } from '../../shared/analytics-bucket.schema.js';

vi.mock('@ikary/system-db-core', async () => {
  const actual = await vi.importActual<typeof import('@ikary/system-db-core')>('@ikary/system-db-core');
  return {
    ...actual,
    sql: Object.assign(
      (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ __sql_fragment: true }),
      {
        raw: (_s: string) => ({ __sql_raw: true }),
      },
    ),
  };
});

function makeQueryBuilder() {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['values']     = vi.fn().mockReturnValue(qb);
  qb['onConflict'] = vi.fn().mockImplementation((fn: (oc: unknown) => unknown) => {
    const oc = {
      columns: vi.fn().mockReturnValue({
        doUpdateSet: vi.fn().mockReturnValue(qb),
      }),
    };
    fn(oc);
    return qb;
  });
  qb['execute']    = vi.fn().mockResolvedValue(undefined);
  return qb;
}

function makeDeleteQueryBuilder(numDeletedRows: number | bigint = 0) {
  const qb: Record<string, ReturnType<typeof vi.fn>> = {};
  qb['where']            = vi.fn().mockReturnValue(qb);
  qb['executeTakeFirst'] = vi.fn().mockResolvedValue({ numDeletedRows });
  return qb;
}

function makeDbService() {
  const qb = makeQueryBuilder();
  const deleteQb = makeDeleteQueryBuilder(0);
  return {
    qb,
    deleteQb,
    db: {
      insertInto: vi.fn().mockReturnValue(qb),
      deleteFrom: vi.fn().mockReturnValue(deleteQb),
    },
  };
}

const bucket: AnalyticsBucket = {
  bucketStart:      '2026-04-16T10:00:00.000Z',
  tenantId:         't1',
  workspaceId:      'w1',
  cellId:           'c1',
  eventName:        'invoice.created',
  analyticsPattern: 'entity.*',
  businessDomain:   'invoice',
  httpMethod:       '',
  statusClass:      '',
  eventCount:       1,
  failureCount:     0,
};

describe('AnalyticsRepository', () => {
  let db: ReturnType<typeof makeDbService>;
  let repo: AnalyticsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDbService();
    repo = new AnalyticsRepository(db as never);
  });

  it('uses the DatabaseService.db when no client is supplied', async () => {
    await repo.upsertBucket(bucket);
    expect(db.db.insertInto).toHaveBeenCalledWith('ikary_analytics_buckets_hourly');
  });

  it('uses the supplied transaction client when provided', async () => {
    const txQb = makeQueryBuilder();
    const tx = { insertInto: vi.fn().mockReturnValue(txQb) };
    await repo.upsertBucket(bucket, tx as never);
    expect(tx.insertInto).toHaveBeenCalledWith('ikary_analytics_buckets_hourly');
    expect(db.db.insertInto).not.toHaveBeenCalled();
  });

  it('inserts with event_count=1 and failure_count from the bucket', async () => {
    await repo.upsertBucket({ ...bucket, failureCount: 1 });
    expect(db.qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ event_count: 1, failure_count: 1 }),
    );
  });

  it('registers an ON CONFLICT clause on the composite PK', async () => {
    await repo.upsertBucket(bucket);
    expect(db.qb.onConflict).toHaveBeenCalledOnce();
  });

  describe('deleteOlderThan', () => {
    it('filters by bucket_start < ISO cutoff and returns the count', async () => {
      db.deleteQb.executeTakeFirst.mockResolvedValue({ numDeletedRows: 12 });
      const cutoff = new Date('2026-01-01T00:00:00.000Z');

      const deleted = await repo.deleteOlderThan(cutoff);

      expect(db.db.deleteFrom).toHaveBeenCalledWith('ikary_analytics_buckets_hourly');
      expect(db.deleteQb.where).toHaveBeenCalledWith('bucket_start', '<', cutoff);
      expect(deleted).toBe(12);
    });

    it('coerces a bigint numDeletedRows to number', async () => {
      db.deleteQb.executeTakeFirst.mockResolvedValue({ numDeletedRows: 5000n });
      const deleted = await repo.deleteOlderThan(new Date());
      expect(deleted).toBe(5000);
    });

    it('returns 0 when numDeletedRows is missing', async () => {
      db.deleteQb.executeTakeFirst.mockResolvedValue({});
      const deleted = await repo.deleteOlderThan(new Date());
      expect(deleted).toBe(0);
    });
  });
});
