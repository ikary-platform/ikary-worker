import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { RabbitMQAdapter } from './rabbitmq.adapter.js';

vi.mock('../config/env.js', () => ({
  env: {
    DATABASE_URL:           'postgres://test:test@localhost:5432/test',
    OUTBOX_POLL_INTERVAL_MS: 2000,
    OUTBOX_BATCH_SIZE:       10,
    OUTBOX_MAX_RETRIES:      3,
    RABBITMQ_URL:            'amqp://localhost',
    RABBITMQ_EXCHANGE:       'cell.events',
    RABBITMQ_DLX:            'cell.events.dlx',
    PORT:                    3002,
  },
}));

const { mockChannel, mockConnection } = vi.hoisted(() => {
  const mockChannel = {
    assertExchange: vi.fn().mockResolvedValue({}),
    publish:        vi.fn().mockReturnValue(true),
    close:          vi.fn().mockResolvedValue(undefined),
  };
  const mockConnection = {
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close:         vi.fn().mockResolvedValue(undefined),
  };
  return { mockChannel, mockConnection };
});

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn().mockResolvedValue(mockConnection),
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
  let adapter: RabbitMQAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-apply default return values after clearAllMocks
    mockChannel.assertExchange.mockResolvedValue({});
    mockChannel.publish.mockReturnValue(true);
    mockChannel.close.mockResolvedValue(undefined);
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    mockConnection.close.mockResolvedValue(undefined);

    adapter = new RabbitMQAdapter();
    await adapter.onModuleInit();
  });

  it('declares the topic exchange on init', () => {
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'cell.events', 'topic', { durable: true },
    );
  });

  it('declares the dead-letter (fanout) exchange on init', () => {
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'cell.events.dlx', 'fanout', { durable: true },
    );
  });

  it('publishes to the topic exchange with event_name as routing key', async () => {
    await adapter.publish(testEvent);

    expect(mockChannel.publish).toHaveBeenCalledWith(
      'cell.events',
      'invoice.created',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, contentType: 'application/json' }),
    );
  });

  it('includes all required headers when publishing', async () => {
    await adapter.publish(testEvent);

    const [, , , opts] = mockChannel.publish.mock.calls[0] as [string, string, Buffer, Record<string, unknown>];
    expect((opts['headers'] as Record<string, unknown>)['x-event-id']).toBe('evt-001');
    expect((opts['headers'] as Record<string, unknown>)['x-event-version']).toBe(1);
    expect((opts['headers'] as Record<string, unknown>)['x-tenant-id']).toBe('tenant-1');
    expect((opts['headers'] as Record<string, unknown>)['x-workspace-id']).toBe('workspace-1');
    expect((opts['headers'] as Record<string, unknown>)['x-cell-id']).toBe('cell-1');
  });

  it('publishes the full event JSON as the message body', async () => {
    await adapter.publish(testEvent);

    const [, , body] = mockChannel.publish.mock.calls[0] as [string, string, Buffer];
    expect(JSON.parse(body.toString())).toMatchObject({ event_id: 'evt-001' });
  });

  it('sends to the DLX exchange with an empty routing key', async () => {
    await adapter.publishToDlx(testEvent, 'max retries exceeded');

    expect(mockChannel.publish).toHaveBeenCalledWith(
      'cell.events.dlx',
      '',
      expect.any(Buffer),
      { persistent: true },
    );
  });

  it('embeds the failure reason in the DLX message body', async () => {
    await adapter.publishToDlx(testEvent, 'max retries exceeded');

    const [, , body] = mockChannel.publish.mock.calls[0] as [string, string, Buffer];
    const message = JSON.parse(body.toString()) as { failure_reason: string };
    expect(message.failure_reason).toBe('max retries exceeded');
  });

  it('closes channel and connection on module destroy', async () => {
    await adapter.onModuleDestroy();

    expect(mockChannel.close).toHaveBeenCalled();
    expect(mockConnection.close).toHaveBeenCalled();
  });

  it('throws when publish is called before init', async () => {
    const uninitialised = new RabbitMQAdapter();

    await expect(uninitialised.publish(testEvent)).rejects.toThrow(
      'RabbitMQ channel not initialised',
    );
  });
});
