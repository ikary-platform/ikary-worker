import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { RabbitMQAdapter } from './rabbitmq.adapter.js';
import type { AmqpPublisherService } from '@ikary/system-amqp/server';

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL:            'postgres://test',
    OUTBOX_POLL_INTERVAL_MS: 2000,
    OUTBOX_BATCH_SIZE:       10,
    OUTBOX_MAX_RETRIES:      3,
    RABBITMQ_URL:            'amqp://localhost',
    RABBITMQ_EXCHANGE:       'cell.events',
    RABBITMQ_DLX:            'cell.events.dlx',
    PORT:                    3002,
  },
}));

const testEvent: DomainEventEnvelope = {
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
};

describe('RabbitMQAdapter', () => {
  let mockPublisher: Pick<AmqpPublisherService, 'publishToExchange' | 'publishToDlx'>;
  let adapter: RabbitMQAdapter;

  beforeEach(() => {
    mockPublisher = {
      publishToExchange: vi.fn(),
      publishToDlx:      vi.fn(),
    };
    adapter = new RabbitMQAdapter(mockPublisher as AmqpPublisherService);
  });

  describe('publish', () => {
    it('builds a hierarchical routing key from event scope fields', async () => {
      await adapter.publish(testEvent);

      const [routingKey] = (mockPublisher.publishToExchange as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Buffer, object];
      // cell scope: cell.{tenantId}.{workspaceId}.{cellId}.{event_name}
      expect(routingKey).toBe('cell.tenant-1.workspace-1.cell-1.invoice.created');
    });

    it('passes the serialised event as the message body', async () => {
      await adapter.publish(testEvent);

      const [, body] = (mockPublisher.publishToExchange as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Buffer, object];
      expect(JSON.parse(body.toString())).toMatchObject({ event_id: 'evt-001' });
    });

    it('sets persistent delivery and content type', async () => {
      await adapter.publish(testEvent);

      const [, , opts] = (mockPublisher.publishToExchange as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Buffer, Record<string, unknown>];
      expect(opts['persistent']).toBe(true);
      expect(opts['contentType']).toBe('application/json');
    });

    it('includes all required AMQP headers', async () => {
      await adapter.publish(testEvent);

      const [, , opts] = (mockPublisher.publishToExchange as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Buffer, Record<string, unknown>];
      const headers = opts['headers'] as Record<string, unknown>;
      expect(headers['x-event-id']).toBe('evt-001');
      expect(headers['x-event-version']).toBe(1);
      expect(headers['x-tenant-id']).toBe('tenant-1');
      expect(headers['x-workspace-id']).toBe('workspace-1');
      expect(headers['x-cell-id']).toBe('cell-1');
    });
  });

  describe('publishToDlx', () => {
    it('delegates to publisher.publishToDlx', async () => {
      await adapter.publishToDlx(testEvent, 'max retries exceeded');
      expect(mockPublisher.publishToDlx).toHaveBeenCalledOnce();
    });

    it('embeds the failure reason in the message body', async () => {
      await adapter.publishToDlx(testEvent, 'max retries exceeded');

      const [body] = (mockPublisher.publishToDlx as ReturnType<typeof vi.fn>).mock.calls[0] as [Buffer];
      const msg = JSON.parse(body.toString()) as { failure_reason: string };
      expect(msg.failure_reason).toBe('max retries exceeded');
    });

    it('uses persistent delivery for DLX messages', async () => {
      await adapter.publishToDlx(testEvent, 'reason');

      const [, opts] = (mockPublisher.publishToDlx as ReturnType<typeof vi.fn>).mock.calls[0] as [Buffer, Record<string, unknown>];
      expect(opts['persistent']).toBe(true);
    });
  });
});
