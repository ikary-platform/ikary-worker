import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AmqpConnectionService } from './amqp-connection.service.js';
import type { SystemAmqpOptions } from '../shared/options.js';

// ── amqplib mock ──────────────────────────────────────────────────────────────

const mockConnect = vi.hoisted(() => vi.fn());

vi.mock('amqplib', () => ({
  default: { connect: mockConnect },
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const TEST_OPTIONS: SystemAmqpOptions = {
  url:              'amqp://localhost',
  exchange:         'test.events',
  dlx:              'test.events.dlx',
  reconnectDelayMs: 100,
};

type MockChannel = {
  assertExchange: ReturnType<typeof vi.fn>;
  publish:        ReturnType<typeof vi.fn>;
  close:          ReturnType<typeof vi.fn>;
};

type MockConnection = EventEmitter & {
  createChannel: ReturnType<typeof vi.fn>;
  close:         ReturnType<typeof vi.fn>;
};

function makeMocks(): { channel: MockChannel; connection: MockConnection } {
  const channel: MockChannel = {
    assertExchange: vi.fn().mockResolvedValue({}),
    publish:        vi.fn().mockReturnValue(true),
    close:          vi.fn().mockResolvedValue(undefined),
  };
  const connection = new EventEmitter() as MockConnection;
  connection.createChannel = vi.fn().mockResolvedValue(channel);
  connection.close         = vi.fn().mockResolvedValue(undefined);
  return { channel, connection };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('AmqpConnectionService', () => {
  let service: AmqpConnectionService;
  let channel: MockChannel;
  let connection: MockConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ channel, connection } = makeMocks());
    mockConnect.mockResolvedValue(connection);
    service = new AmqpConnectionService(TEST_OPTIONS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── init ────────────────────────────────────────────────────────────────────

  it('connects to the broker on module init', async () => {
    await service.onModuleInit();
    expect(mockConnect).toHaveBeenCalledWith(TEST_OPTIONS.url);
  });

  it('creates a channel after connecting', async () => {
    await service.onModuleInit();
    expect(connection.createChannel).toHaveBeenCalledTimes(1);
  });

  it('declares the main topic exchange', async () => {
    await service.onModuleInit();
    expect(channel.assertExchange).toHaveBeenCalledWith(
      TEST_OPTIONS.exchange, 'topic', { durable: true },
    );
  });

  it('declares the dead-letter fanout exchange', async () => {
    await service.onModuleInit();
    expect(channel.assertExchange).toHaveBeenCalledWith(
      TEST_OPTIONS.dlx, 'fanout', { durable: true },
    );
  });

  // ── getChannel ──────────────────────────────────────────────────────────────

  it('getChannel returns the active channel when connected', async () => {
    await service.onModuleInit();
    expect(service.getChannel()).toBe(channel);
  });

  it('getChannel throws when not yet connected', () => {
    expect(() => service.getChannel()).toThrow('AMQP channel is not available');
  });

  // ── destroy ─────────────────────────────────────────────────────────────────

  it('closes channel and connection on module destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(channel.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
  });

  it('onModuleDestroy is safe when already disconnected (no channel/connection)', async () => {
    // No onModuleInit — nothing to close
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });

  it('cancels a pending reconnect timer on module destroy', async () => {
    vi.useFakeTimers();
    await service.onModuleInit();

    // Drop the connection — schedules reconnect timer
    connection.emit('close');
    expect(() => service.getChannel()).toThrow(); // channel nulled

    // Destroy before the reconnect timer fires
    await service.onModuleDestroy();

    // Advance past the delay — reconnect should NOT happen
    await vi.advanceTimersByTimeAsync(TEST_OPTIONS.reconnectDelayMs * 10);
    expect(mockConnect).toHaveBeenCalledTimes(1); // only initial connect
  });

  // ── connection events ────────────────────────────────────────────────────────

  it('nulls channel and connection when the connection closes', async () => {
    await service.onModuleInit();
    connection.emit('close');
    expect(() => service.getChannel()).toThrow('AMQP channel is not available');
  });

  it('logs connection errors without throwing', async () => {
    await service.onModuleInit();
    // Should not throw — just logs
    expect(() => connection.emit('error', new Error('network error'))).not.toThrow();
  });

  // ── reconnect ────────────────────────────────────────────────────────────────

  it('reconnects automatically after the configured delay', async () => {
    vi.useFakeTimers();
    await service.onModuleInit();

    // Provide a fresh mock connection for the reconnect
    const { channel: ch2, connection: conn2 } = makeMocks();
    mockConnect.mockResolvedValueOnce(conn2);

    connection.emit('close');
    expect(() => service.getChannel()).toThrow();

    await vi.advanceTimersByTimeAsync(TEST_OPTIONS.reconnectDelayMs);

    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(service.getChannel()).toBe(ch2);
  });

  it('schedules another reconnect if the reconnect attempt fails', async () => {
    vi.useFakeTimers();
    await service.onModuleInit();

    // First reconnect fails, second succeeds
    const { connection: conn2 } = makeMocks();
    mockConnect
      .mockRejectedValueOnce(new Error('broker unreachable'))
      .mockResolvedValueOnce(conn2);

    connection.emit('close');

    // First attempt — fails
    await vi.advanceTimersByTimeAsync(TEST_OPTIONS.reconnectDelayMs);
    expect(mockConnect).toHaveBeenCalledTimes(2);

    // Second attempt — succeeds
    await vi.advanceTimersByTimeAsync(TEST_OPTIONS.reconnectDelayMs);
    expect(mockConnect).toHaveBeenCalledTimes(3);
  });
});
