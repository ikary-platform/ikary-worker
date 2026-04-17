import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AmqpConnectionService } from '@ikary/system-amqp/server';
import type { IConsumer } from '../shared/consumer.contract.js';
import type { ConsumerOptions } from '../config/consumer-options.schema.js';
import { ConsumerRegistry } from './consumer.registry.js';
import type { ConsumerReceiptsRepository } from './repositories/consumer-receipts.repository.js';
import type { ConsumerOffsetsRepository } from './repositories/consumer-offsets.repository.js';

const TEST_OPTIONS: ConsumerOptions = {
  queuePrefix:          'ikary.',
  exchange:             'cell.events',
  prefetch:             32,
  maxRetries:           5,
  dlx:                  'cell.events.dlx',
  receiptRetentionDays: 7,
};

// Minimal mock amqplib.Channel + EventEmitter for close events.
type MockChannel = EventEmitter & {
  prefetch:    ReturnType<typeof vi.fn>;
  assertQueue: ReturnType<typeof vi.fn>;
  bindQueue:   ReturnType<typeof vi.fn>;
  consume:     ReturnType<typeof vi.fn>;
  cancel:      ReturnType<typeof vi.fn>;
  ack:         ReturnType<typeof vi.fn>;
  nack:        ReturnType<typeof vi.fn>;
  publish:     ReturnType<typeof vi.fn>;
};

function makeMockChannel(): MockChannel {
  const ch = new EventEmitter() as MockChannel;
  ch.prefetch    = vi.fn().mockResolvedValue(undefined);
  ch.assertQueue = vi.fn().mockResolvedValue({});
  ch.bindQueue   = vi.fn().mockResolvedValue({});
  ch.consume     = vi.fn().mockImplementation(async (_q, _cb) => ({ consumerTag: 'tag-' + Math.random() }));
  ch.cancel      = vi.fn().mockResolvedValue(undefined);
  // Runner-facing methods — needed because the registry passes this channel
  // straight to runner.process() when a message arrives.
  ch.ack         = vi.fn();
  ch.nack        = vi.fn();
  ch.publish     = vi.fn().mockReturnValue(true);
  return ch;
}

function makeMockAmqp(channel: MockChannel | null): AmqpConnectionService {
  return {
    getChannel: vi.fn().mockImplementation(() => {
      if (channel === null) throw new Error('AMQP channel is not available');
      return channel;
    }),
  } as unknown as AmqpConnectionService;
}

function makeConsumer(name: string, eventTypes: string | string[]): IConsumer {
  return {
    name,
    eventTypes,
    handle: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRegistry(
  consumers: IConsumer[] | undefined,
  amqp: AmqpConnectionService,
): ConsumerRegistry {
  const receipts = {} as unknown as ConsumerReceiptsRepository;
  const offsets  = {} as unknown as ConsumerOffsetsRepository;
  const db       = { db: { transaction: vi.fn() } } as unknown as never;
  return new ConsumerRegistry(consumers, TEST_OPTIONS, db, amqp, receipts, offsets);
}

describe('ConsumerRegistry', () => {
  let channel: MockChannel;
  let amqp:    AmqpConnectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    channel = makeMockChannel();
    amqp    = makeMockAmqp(channel);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── happy path ─────────────────────────────────────────────────────────

  it('does nothing when no consumers are registered', async () => {
    const registry = makeRegistry(undefined, amqp);
    await registry.onModuleInit();
    expect(channel.prefetch).not.toHaveBeenCalled();
    expect(channel.assertQueue).not.toHaveBeenCalled();
  });

  it('accepts a single IConsumer (when multi: true is forgotten)', async () => {
    // NestJS injects a single instance when the user registers a provider
    // without `multi: true`. The registry must not crash with .map.
    const registry = makeRegistry(
      makeConsumer('audit', '#') as unknown as IConsumer[],  // single, not array
      amqp,
    );
    await registry.onModuleInit();
    expect(channel.assertQueue).toHaveBeenCalledWith('ikary.audit', expect.any(Object));
  });

  it('asserts one durable queue per consumer with the correct DLX', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    expect(channel.assertQueue).toHaveBeenCalledWith('ikary.audit', {
      durable: true,
      deadLetterExchange: TEST_OPTIONS.dlx,
    });
  });

  it('binds one pattern per eventTypes entry (array)', async () => {
    const registry = makeRegistry(
      [makeConsumer('metrics', ['metrics.*', 'system.shutdown'])],
      amqp,
    );
    await registry.onModuleInit();
    expect(channel.bindQueue).toHaveBeenCalledWith('ikary.metrics', TEST_OPTIONS.exchange, 'metrics.*');
    expect(channel.bindQueue).toHaveBeenCalledWith('ikary.metrics', TEST_OPTIONS.exchange, 'system.shutdown');
  });

  it('binds a single pattern when eventTypes is a string', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    expect(channel.bindQueue).toHaveBeenCalledWith('ikary.audit', TEST_OPTIONS.exchange, '#');
  });

  it('sets channel prefetch from options', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    expect(channel.prefetch).toHaveBeenCalledWith(TEST_OPTIONS.prefetch);
  });

  it('subscribes each consumer with noAck: false', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    expect(channel.consume).toHaveBeenCalledWith(
      'ikary.audit',
      expect.any(Function),
      { noAck: false },
    );
  });

  it('dispatches incoming messages to the runner (via runner.process)', async () => {
    const consumer = makeConsumer('audit', '#');
    const registry = makeRegistry([consumer], amqp);
    await registry.onModuleInit();

    // Call the consumer callback with a synthetic message
    const [[, cb]] = channel.consume.mock.calls;
    const result = cb({
      content: Buffer.from('{not-json'),
      fields: { routingKey: 'x' } as never,
      properties: { headers: {} } as never,
    });
    expect(result).toBeUndefined(); // callback returns void
  });

  it('ignores broker-initiated cancel (null message)', async () => {
    const consumer = makeConsumer('audit', '#');
    const registry = makeRegistry([consumer], amqp);
    await registry.onModuleInit();

    const [[, cb]] = channel.consume.mock.calls;
    // RabbitMQ passes null when the server cancels a consumer.
    expect(() => cb(null)).not.toThrow();
  });

  it('catches a rejected runner promise from the consume callback', async () => {
    // Without the .catch in the registry, a runner-process rejection would
    // be unhandled and crash the pod. Spy on ConsumerRunner.process to force
    // a rejection and verify the callback swallows it.
    const consumer = makeConsumer('audit', '#');
    const registry = makeRegistry([consumer], amqp);

    const { ConsumerRunner } = await import('./consumer.runner.js');
    const spy = vi
      .spyOn(ConsumerRunner.prototype, 'process')
      .mockRejectedValueOnce(new Error('simulated unhandled'));

    await registry.onModuleInit();
    const [[, cb]] = channel.consume.mock.calls;

    cb({ content: Buffer.from('{}'), fields: { routingKey: 'x' }, properties: {} } as never);
    // Let the .catch handler run.
    await Promise.resolve();
    await Promise.resolve();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  // ── deferred subscribe ────────────────────────────────────────────────

  it('retries subscribe when the AMQP channel is not yet available', async () => {
    // First call: no channel. Second call: channel present.
    let currentChannel: MockChannel | null = null;
    const deferredAmqp = {
      getChannel: vi.fn().mockImplementation(() => {
        if (currentChannel === null) throw new Error('AMQP channel is not available');
        return currentChannel;
      }),
    } as unknown as AmqpConnectionService;

    const registry = makeRegistry([makeConsumer('audit', '#')], deferredAmqp);
    await registry.onModuleInit();

    // Nothing subscribed yet.
    expect(channel.assertQueue).not.toHaveBeenCalled();

    // Bring the channel online and advance the retry timer.
    currentChannel = channel;
    await vi.advanceTimersByTimeAsync(500);

    expect(channel.assertQueue).toHaveBeenCalled();
  });

  // ── reconnect / resubscribe ─────────────────────────────────────────────

  it('re-subscribes after a channel close', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    expect(channel.assertQueue).toHaveBeenCalledTimes(1);

    // Simulate channel close (broker restart / network drop).
    channel.emit('close');

    // Poll will hit getChannel() — still returning the (now-dead) channel.
    // Advance timers; new subscribe is attempted.
    await vi.advanceTimersByTimeAsync(500);
    expect(channel.assertQueue).toHaveBeenCalledTimes(2);
  });

  it('keeps polling for reconnect when the channel remains unavailable', async () => {
    let currentChannel: MockChannel | null = channel;
    const flakyAmqp = {
      getChannel: vi.fn().mockImplementation(() => {
        if (currentChannel === null) throw new Error('AMQP channel is not available');
        return currentChannel;
      }),
    } as unknown as AmqpConnectionService;

    const registry = makeRegistry([makeConsumer('audit', '#')], flakyAmqp);
    await registry.onModuleInit();

    // Drop the channel.
    currentChannel = null;
    channel.emit('close');

    // First poll fails — channel still down.
    await vi.advanceTimersByTimeAsync(500);
    expect(channel.assertQueue).toHaveBeenCalledTimes(1); // no resubscribe yet

    // Second poll fails too.
    await vi.advanceTimersByTimeAsync(500);
    expect(channel.assertQueue).toHaveBeenCalledTimes(1);

    // Channel comes back — next poll succeeds.
    currentChannel = channel;
    await vi.advanceTimersByTimeAsync(500);
    expect(channel.assertQueue).toHaveBeenCalledTimes(2);
  });

  // ── shutdown ─────────────────────────────────────────────────────────

  it('cancels all consumer tags on beforeApplicationShutdown', async () => {
    const registry = makeRegistry(
      [makeConsumer('audit', '#'), makeConsumer('metrics', 'metrics.*')],
      amqp,
    );
    await registry.onModuleInit();
    expect(channel.consume).toHaveBeenCalledTimes(2);

    await registry.beforeApplicationShutdown();
    expect(channel.cancel).toHaveBeenCalledTimes(2);
  });

  it('shutdown is a no-op when the AMQP channel is already gone', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();

    // Make getChannel throw (simulates AmqpConnectionService teardown first).
    (amqp.getChannel as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('AMQP channel is not available');
    });

    await expect(registry.beforeApplicationShutdown()).resolves.not.toThrow();
    expect(channel.cancel).not.toHaveBeenCalled();
  });

  it('logs but swallows individual cancel failures during shutdown', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();

    channel.cancel.mockRejectedValueOnce(new Error('channel closing'));
    await expect(registry.beforeApplicationShutdown()).resolves.not.toThrow();
  });

  it('does not re-subscribe on close that fires after shutdown', async () => {
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.onModuleInit();
    await registry.beforeApplicationShutdown();

    channel.emit('close');
    await vi.advanceTimersByTimeAsync(5000);
    // assertQueue was called once in onModuleInit; nothing more after shutdown
    expect(channel.assertQueue).toHaveBeenCalledTimes(1);
  });

  it('aborts the reconnect poll loop when shutdown happens mid-poll', async () => {
    // Set up flaky AMQP: channel initially up, then goes down and stays down.
    let currentChannel: MockChannel | null = channel;
    const flakyAmqp = {
      getChannel: vi.fn().mockImplementation(() => {
        if (currentChannel === null) throw new Error('AMQP channel is not available');
        return currentChannel;
      }),
    } as unknown as AmqpConnectionService;

    const registry = makeRegistry([makeConsumer('audit', '#')], flakyAmqp);
    await registry.onModuleInit();

    // Drop the channel → enters the reconnect poll loop.
    currentChannel = null;
    channel.emit('close');

    // Halfway through polling, shut down. The next poll tick should early-return.
    await vi.advanceTimersByTimeAsync(500);      // one poll — still down
    await registry.beforeApplicationShutdown();  // shutdown flag set

    // Advance further — poll checks shuttingDown and bails, never retries.
    await vi.advanceTimersByTimeAsync(5000);
    // assertQueue was only called during the initial onModuleInit subscribe
    expect(channel.assertQueue).toHaveBeenCalledTimes(1);
  });

  it('subscribeAll during shutdown is a no-op (defensive)', async () => {
    // onModuleInit → subscribeAll fires. If shutdown races between the two,
    // subscribeAll must early-return.
    const registry = makeRegistry([makeConsumer('audit', '#')], amqp);
    await registry.beforeApplicationShutdown();     // mark shutdown BEFORE init
    await registry.onModuleInit();                   // should short-circuit
    expect(channel.assertQueue).not.toHaveBeenCalled();
  });
});
