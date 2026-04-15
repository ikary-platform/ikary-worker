import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxProcessorService } from './outbox-processor.service.js';
import type { IBrokerAdapter } from '../adapters/broker-adapter.interface.js';
import type { IEventHandler } from '../handlers/event-handler.interface.js';
import type { OutboxRow } from '@ikary/cell-runtime-core';

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

const validEnvelope = {
  event_id:     'evt-001',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-01-01T00:00:00.000Z',
  tenant_id:    'tenant-1',
  workspace_id: 'workspace-1',
  cell_id:      'cell-1',
  actor:    { type: 'user', id: 'user-1' },
  entity:   { type: 'invoice', id: 'inv-001' },
  data:     {},
  previous: {},
  metadata: {},
} as const;

function fakeRow(payload: unknown = validEnvelope): OutboxRow {
  return {
    id:           'row-1',
    created_at:   '2026-01-01T00:00:00.000Z',
    processed_at: null,
    failed_at:    null,
    retry_count:  0,
    event_name:   'invoice.created',
    tenant_id:    'tenant-1',
    workspace_id: 'workspace-1',
    cell_id:      'cell-1',
    payload:      JSON.stringify(payload),
  } as OutboxRow;
}

describe('OutboxProcessorService', () => {
  let mockAdapter: IBrokerAdapter;

  beforeEach(() => {
    mockAdapter = {
      publish:      vi.fn().mockResolvedValue(undefined),
      publishToDlx: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('handler routing', () => {
    it('dispatches to an exactly matching handler', async () => {
      const handler: IEventHandler = {
        eventNames: 'invoice.created',
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(handler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ event_name: 'invoice.created' }),
      );
    });

    it('does NOT dispatch to a handler with a different exact name', async () => {
      const handler: IEventHandler = {
        eventNames: 'entity.updated',
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('wildcard "invoice.*" matches "invoice.created"', async () => {
      const handler: IEventHandler = {
        eventNames: 'invoice.*',
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it('wildcard "invoice.*" does NOT match "entity.updated"', async () => {
      const handler: IEventHandler = {
        eventNames: 'invoice.*',
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(
        fakeRow({ ...validEnvelope, event_name: 'entity.updated' }),
      );

      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('array eventNames matches any name in the array', async () => {
      const handler: IEventHandler = {
        eventNames: ['invoice.created', 'invoice.updated'],
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it('multiple handlers can match the same event', async () => {
      const h1: IEventHandler = { eventNames: 'invoice.*', handle: vi.fn().mockResolvedValue(undefined) };
      const h2: IEventHandler = { eventNames: 'invoice.created', handle: vi.fn().mockResolvedValue(undefined) };
      const processor = new OutboxProcessorService([h1, h2], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(h1.handle).toHaveBeenCalledTimes(1);
      expect(h2.handle).toHaveBeenCalledTimes(1);
    });
  });

  describe('broker adapter delivery', () => {
    it('always calls the broker adapter even when no handler matches', async () => {
      const processor = new OutboxProcessorService([], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(mockAdapter.publish).toHaveBeenCalledTimes(1);
    });

    it('calls the broker adapter even when a handler matched and ran', async () => {
      const handler: IEventHandler = {
        eventNames: 'invoice.created',
        handle:     vi.fn().mockResolvedValue(undefined),
      };
      const processor = new OutboxProcessorService([handler], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(handler.handle).toHaveBeenCalled();
      expect(mockAdapter.publish).toHaveBeenCalled();
    });

    it('calls the broker adapter with the parsed DomainEventEnvelope', async () => {
      const processor = new OutboxProcessorService([], mockAdapter);

      await processor.dispatch(fakeRow());

      expect(mockAdapter.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id:   'evt-001',
          event_name: 'invoice.created',
          version:    1,
        }),
      );
    });
  });

  describe('envelope validation', () => {
    it('throws when the payload is not a valid DomainEventEnvelope', async () => {
      const processor = new OutboxProcessorService([], mockAdapter);

      await expect(
        processor.dispatch(fakeRow({ not: 'a valid envelope' })),
      ).rejects.toThrow('Invalid DomainEventEnvelope');
    });

    it('accepts a payload already parsed as an object (not a JSON string)', async () => {
      const processor = new OutboxProcessorService([], mockAdapter);
      const row = { ...fakeRow(), payload: validEnvelope } as OutboxRow;

      await processor.dispatch(row);

      expect(mockAdapter.publish).toHaveBeenCalled();
    });
  });
});
