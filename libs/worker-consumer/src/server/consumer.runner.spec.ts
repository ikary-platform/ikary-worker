import { describe, it, expect, vi, beforeEach } from 'vitest';
import type amqplib from 'amqplib';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer } from '../shared/consumer.contract.js';
import type { ConsumerOptions } from '../shared/consumer-options.schema.js';
import { RETRY_COUNT_HEADER } from '../shared/retry-metadata.js';
import {
  ConsumerRunner,
  aggregateKeyOf,
  isUniqueViolation,
  transactionRunnerFor,
  type RunnerChannel,
  type TransactionRunner,
} from './consumer.runner.js';
import type { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';
import type { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';

// ── test fixtures ────────────────────────────────────────────────────────────

const TEST_OPTIONS: ConsumerOptions = {
  queuePrefix: 'ikary.',
  exchange:    'cell.events',
  prefetch:    32,
  maxRetries:  5,
  dlx:         'cell.events.dlx',
};

const validEnvelope: DomainEventEnvelope = {
  event_id:     'evt-001',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-04-16T10:00:00.000Z',
  tenant_id:    'tenant-1',
  workspace_id: 'workspace-1',
  cell_id:      'cell-1',
  actor:    { type: 'user', id: 'user-1' },
  entity:   { type: 'invoice', id: 'inv-001' },
  data:     {},
  previous: {},
  metadata: {},
};

function fakeMessage(opts?: {
  envelope?: unknown;
  bodyText?: string;       // when set, overrides envelope → raw JSON body
  retries?: number;
  routingKey?: string;
}): amqplib.ConsumeMessage {
  const env = opts?.envelope ?? validEnvelope;
  const body = opts?.bodyText ?? JSON.stringify(env);
  const headers: Record<string, unknown> = {};
  if (opts?.retries !== undefined) headers[RETRY_COUNT_HEADER] = opts.retries;
  return {
    content: Buffer.from(body),
    fields: {
      routingKey: opts?.routingKey ?? 'cell.tenant-1.workspace-1.cell-1.invoice.created',
    } as amqplib.ConsumeMessageFields,
    properties: {
      headers,
      contentType: 'application/json',
    } as amqplib.MessageProperties,
  };
}

function makeMockChannel(): RunnerChannel & {
  ack: ReturnType<typeof vi.fn>;
  nack: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
} {
  return {
    ack:     vi.fn(),
    nack:    vi.fn(),
    publish: vi.fn().mockReturnValue(true),
  };
}

type MockReceipts = ConsumerReceiptsRepository & {
  exists: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function makeMockReceipts(existsValue = false): MockReceipts {
  return {
    exists: vi.fn().mockResolvedValue(existsValue),
    insert: vi.fn().mockResolvedValue(undefined),
  } as unknown as MockReceipts;
}

type MockOffsets = ConsumerOffsetsRepository & {
  getLastVersion: ReturnType<typeof vi.fn>;
  upsert:         ReturnType<typeof vi.fn>;
};

function makeMockOffsets(lastVersion: number | null = null): MockOffsets {
  return {
    getLastVersion: vi.fn().mockResolvedValue(lastVersion),
    upsert:         vi.fn().mockResolvedValue(undefined),
  } as unknown as MockOffsets;
}

function makeMockTxRunner(): TransactionRunner {
  return {
    withTransaction: vi.fn().mockImplementation(async (fn) => fn({} as never)),
  };
}

// ── pure helpers ─────────────────────────────────────────────────────────────

describe('aggregateKeyOf', () => {
  it('formats "{entity.type}:{entity.id}"', () => {
    expect(aggregateKeyOf(validEnvelope)).toBe('invoice:inv-001');
  });
});

describe('isUniqueViolation', () => {
  it('returns true for PostgreSQL code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('returns false for other codes', () => {
    expect(isUniqueViolation({ code: '23502' })).toBe(false);
  });
  it('returns false when the value is not an error object', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('oops')).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
  it('returns false when the code is missing', () => {
    expect(isUniqueViolation(new Error('no code'))).toBe(false);
  });
});

describe('transactionRunnerFor', () => {
  it('wraps a DatabaseService.db.transaction().execute() call', async () => {
    const executeFn = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn('tx'));
    const dbService = {
      db: { transaction: vi.fn().mockReturnValue({ execute: executeFn }) },
    } as never;

    const runner = transactionRunnerFor(dbService);
    const handler = vi.fn().mockResolvedValue('ok');
    const result = await runner.withTransaction(handler);

    expect(result).toBe('ok');
    expect(handler).toHaveBeenCalledWith('tx');
  });
});

// ── runner behaviour ────────────────────────────────────────────────────────

describe('ConsumerRunner.process', () => {
  const consumer: IConsumer = {
    name: 'audit',
    eventTypes: ['invoice.*'],
    handle: vi.fn(),
  };

  let channel:  ReturnType<typeof makeMockChannel>;
  let receipts: MockReceipts;
  let offsets:  MockOffsets;
  let tx:       TransactionRunner;
  let runner:   ConsumerRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    channel  = makeMockChannel();
    receipts = makeMockReceipts();
    offsets  = makeMockOffsets();
    tx       = makeMockTxRunner();
    runner   = new ConsumerRunner(consumer, TEST_OPTIONS, receipts, offsets, tx);
  });

  // ── poison-message guard ────────────────────────────────────────────────

  it('nacks unparseable JSON to the DLX without retry', async () => {
    await runner.process(channel, fakeMessage({ bodyText: '{not-json' }));
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('nacks invalid DomainEventEnvelopes to the DLX without retry', async () => {
    await runner.process(channel, fakeMessage({ envelope: { event_id: 'x' } }));
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(consumer.handle).not.toHaveBeenCalled();
  });

  // ── retry cap ──────────────────────────────────────────────────────────

  it('nacks to DLX when the retry count meets maxRetries', async () => {
    await runner.process(channel, fakeMessage({ retries: 5 }));
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(consumer.handle).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('nacks to DLX when the retry count exceeds maxRetries', async () => {
    await runner.process(channel, fakeMessage({ retries: 99 }));
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  // ── idempotency ─────────────────────────────────────────────────────────

  it('acks and skips when a receipt already exists for this consumer', async () => {
    receipts.exists.mockResolvedValue(true);
    await runner.process(channel, fakeMessage());
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(consumer.handle).not.toHaveBeenCalled();
    expect(offsets.getLastVersion).not.toHaveBeenCalled();
  });

  // ── gap detection ──────────────────────────────────────────────────────

  it('acks when the event version is at or before the recorded offset', async () => {
    offsets.getLastVersion.mockResolvedValue(3);
    await runner.process(channel, fakeMessage({ envelope: { ...validEnvelope, version: 3 } }));
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(consumer.handle).not.toHaveBeenCalled();
  });

  it('republishes with incremented retry when there is a version gap', async () => {
    offsets.getLastVersion.mockResolvedValue(3);
    // Incoming version 5 while offset is at 3 → v4 is missing.
    await runner.process(channel, fakeMessage({ envelope: { ...validEnvelope, version: 5 } }));

    expect(channel.publish).toHaveBeenCalledWith(
      TEST_OPTIONS.exchange,
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ [RETRY_COUNT_HEADER]: 1 }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledOnce(); // original is acked
    expect(consumer.handle).not.toHaveBeenCalled();
  });

  it('processes the first event for an aggregate without a gap check', async () => {
    offsets.getLastVersion.mockResolvedValue(null);
    await runner.process(channel, fakeMessage());
    expect(consumer.handle).toHaveBeenCalledOnce();
    expect(channel.ack).toHaveBeenCalledOnce();
  });

  it('processes v=N+1 when the recorded offset is N', async () => {
    offsets.getLastVersion.mockResolvedValue(1);
    await runner.process(channel, fakeMessage({ envelope: { ...validEnvelope, version: 2 } }));
    expect(consumer.handle).toHaveBeenCalledOnce();
  });

  // ── happy path ──────────────────────────────────────────────────────────

  it('runs handler, insert receipt, upsert offset — all in one transaction', async () => {
    const seen: string[] = [];
    (consumer.handle as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      seen.push('handle');
    });
    receipts.insert.mockImplementation(async () => {
      seen.push('insert');
    });
    offsets.upsert.mockImplementation(async () => {
      seen.push('upsert');
    });

    await runner.process(channel, fakeMessage());

    expect(seen).toEqual(['handle', 'insert', 'upsert']);
    expect(tx.withTransaction).toHaveBeenCalledOnce();
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(receipts.insert).toHaveBeenCalledWith('audit', 'evt-001', expect.anything());
    expect(offsets.upsert).toHaveBeenCalledWith('audit', 'tenant-1', 'invoice:inv-001', 1, expect.anything());
  });

  // ── handler errors ──────────────────────────────────────────────────────

  it('republishes with retry++ when the handler throws', async () => {
    (consumer.handle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    await runner.process(channel, fakeMessage({ retries: 2 }));

    expect(channel.publish).toHaveBeenCalledWith(
      TEST_OPTIONS.exchange,
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ [RETRY_COUNT_HEADER]: 3 }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('acks as duplicate when a receipt unique violation races another pod', async () => {
    (consumer.handle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // Make the transaction reject with a PG unique violation — simulates a
    // parallel pod inserting the receipt first.
    (tx.withTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: '23505' });

    await runner.process(channel, fakeMessage());

    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
  });
});
