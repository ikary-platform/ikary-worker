import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxPollerService } from './outbox-poller.service.js';
import type { OutboxRepository } from '@ikary/cell-runtime-core';
import type { OutboxRow } from '@ikary/cell-runtime-core';
import type { OutboxProcessorService } from './outbox-processor.service.js';

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    OUTBOX_POLL_INTERVAL_MS: 2000,
    OUTBOX_BATCH_SIZE: 10,
    OUTBOX_MAX_RETRIES: 3,
    RABBITMQ_URL: 'amqp://localhost',
    RABBITMQ_EXCHANGE: 'cell.events',
    RABBITMQ_DLX: 'cell.events.dlx',
    PORT: 3002,
  },
}));

function fakeRow(id: string, retryCount = 0): OutboxRow {
  return {
    id,
    created_at: '2026-01-01T00:00:00.000Z',
    processed_at: null,
    failed_at: null,
    retry_count: retryCount,
    event_name: 'invoice.created',
    tenant_id: 'tenant-1',
    workspace_id: 'workspace-1',
    cell_id: 'cell-1',
    payload: JSON.stringify({
      event_id: `evt-${id}`,
      event_name: 'invoice.created',
      version: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      tenant_id: 'tenant-1',
      workspace_id: 'workspace-1',
      cell_id: 'cell-1',
      actor: { type: 'user', id: 'user-1' },
      entity: { type: 'invoice', id: `inv-${id}` },
      data: {},
      previous: {},
      metadata: {},
    }),
  } as OutboxRow;
}

describe('OutboxPollerService', () => {
  let poller: OutboxPollerService;
  let mockOutbox: {
    listUnprocessed: ReturnType<typeof vi.fn>;
    markProcessed:   ReturnType<typeof vi.fn>;
    markFailed:      ReturnType<typeof vi.fn>;
  };
  let mockProcessor: { dispatch: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOutbox = {
      listUnprocessed: vi.fn().mockResolvedValue([]),
      markProcessed:   vi.fn().mockResolvedValue(undefined),
      markFailed:      vi.fn().mockResolvedValue(undefined),
    };
    mockProcessor = {
      dispatch: vi.fn().mockResolvedValue(undefined),
    };

    poller = new OutboxPollerService(
      mockOutbox as unknown as OutboxRepository,
      mockProcessor as unknown as OutboxProcessorService,
    );
  });

  it('does nothing when there are no unprocessed rows', async () => {
    mockOutbox.listUnprocessed.mockResolvedValue([]);

    await poller.poll();

    expect(mockProcessor.dispatch).not.toHaveBeenCalled();
    expect(mockOutbox.markProcessed).not.toHaveBeenCalled();
  });

  it('dispatches each row and marks it processed on success', async () => {
    const rows = [fakeRow('row-1'), fakeRow('row-2')];
    mockOutbox.listUnprocessed.mockResolvedValue(rows);

    await poller.poll();

    expect(mockProcessor.dispatch).toHaveBeenCalledTimes(2);
    expect(mockProcessor.dispatch).toHaveBeenCalledWith(rows[0]);
    expect(mockProcessor.dispatch).toHaveBeenCalledWith(rows[1]);
    expect(mockOutbox.markProcessed).toHaveBeenCalledWith('row-1');
    expect(mockOutbox.markProcessed).toHaveBeenCalledWith('row-2');
    expect(mockOutbox.markFailed).not.toHaveBeenCalled();
  });

  it('marks a row failed when dispatch throws', async () => {
    const rows = [fakeRow('row-1')];
    mockOutbox.listUnprocessed.mockResolvedValue(rows);
    mockProcessor.dispatch.mockRejectedValue(new Error('broker down'));

    await poller.poll();

    expect(mockOutbox.markFailed).toHaveBeenCalledWith('row-1');
    expect(mockOutbox.markProcessed).not.toHaveBeenCalled();
  });

  it('continues processing remaining rows after a single row failure', async () => {
    const rows = [fakeRow('row-1'), fakeRow('row-2')];
    mockOutbox.listUnprocessed.mockResolvedValue(rows);
    mockProcessor.dispatch
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce(undefined);

    await poller.poll();

    expect(mockOutbox.markFailed).toHaveBeenCalledWith('row-1');
    expect(mockOutbox.markProcessed).toHaveBeenCalledWith('row-2');
  });

  it('mutex prevents overlapping runs', async () => {
    let releaseFirst!: (rows: OutboxRow[]) => void;
    mockOutbox.listUnprocessed.mockReturnValueOnce(
      new Promise<OutboxRow[]>((resolve) => {
        releaseFirst = resolve;
      }),
    );

    // Start the first poll — it will hang inside listUnprocessed
    const firstPoll = poller.poll();

    // Second poll should return immediately because isRunning is true
    await poller.poll();

    // listUnprocessed called exactly once; the second poll was skipped
    expect(mockOutbox.listUnprocessed).toHaveBeenCalledTimes(1);

    // Finish the first poll
    releaseFirst([]);
    await firstPoll;
  });
});
