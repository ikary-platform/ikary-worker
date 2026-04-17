import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type BeforeApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type amqplib from 'amqplib';
import { AmqpConnectionService } from '@ikary/system-amqp/server';
import type { DatabaseService } from '@ikary/system-db-core';
import type { IConsumer } from '../shared/consumer.contract.js';
import type { ConsumerOptions } from '../shared/consumer-options.schema.js';
import { CONSUMER, CONSUMER_DATABASE, CONSUMER_OPTIONS } from './consumer.tokens.js';
import { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';
import { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';
import { ConsumerRunner, transactionRunnerFor } from './consumer.runner.js';
import type { ConsumerDatabaseSchema } from './consumer.database.js';

type DbService = DatabaseService<ConsumerDatabaseSchema>;

/**
 * Owns the lifecycle of every consumer's queue, bindings, and subscription.
 *
 * On startup:
 *   - Asserts one durable queue per consumer (`{prefix}{name}`) with x-dead-
 *     letter-exchange set to the DLX from options.
 *   - Binds the queue to the cell.events exchange once per pattern.
 *   - Sets the channel prefetch.
 *   - Starts consuming; each message is dispatched to the matching runner.
 *
 * On channel close (broker restart, network hiccup, poison message that
 * killed the channel):
 *   - A one-shot 'close' listener schedules a re-subscribe loop that waits
 *     for the AmqpConnectionService to bring a fresh channel back online.
 *
 * On application shutdown:
 *   - Cancels every consumer tag so no new messages arrive.
 *   - In-flight messages finish naturally (amqplib resolves their acks).
 *   - The AmqpConnectionService closes the connection afterwards.
 */
@Injectable()
export class ConsumerRegistry implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(ConsumerRegistry.name);

  private readonly runners: ConsumerRunner[];
  private readonly consumerTags = new Map<string, string>();
  private shuttingDown = false;

  constructor(
    @Optional() @Inject(CONSUMER) consumers: IConsumer[] | IConsumer | undefined,
    @Inject(CONSUMER_OPTIONS) private readonly options: ConsumerOptions,
    @Inject(CONSUMER_DATABASE) dbService: DbService,
    private readonly amqp: AmqpConnectionService,
    private readonly receipts: ConsumerReceiptsRepository,
    private readonly offsets: ConsumerOffsetsRepository,
  ) {
    // Normalise the injected value. The host app may pass either:
    //   - A single useFactory provider returning IConsumer[] (recommended;
    //     see apps/worker/src/app.module.ts).
    //   - A `multi: true` provider resolving to one IConsumer (older/partial
    //     setup; we accept a single instance so the app still boots).
    //   - Nothing at all (no consumers wired).
    const list =
      consumers === undefined ? [] : Array.isArray(consumers) ? consumers : [consumers];

    const tx = transactionRunnerFor(dbService);
    this.runners = list.map(
      (consumer) => new ConsumerRunner(consumer, options, receipts, offsets, tx),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.subscribeAll();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    // Cancel every subscription; do not fail the shutdown if the channel
    // is already gone (AmqpConnectionService may have torn it down first).
    let channel: amqplib.Channel;
    try {
      channel = this.amqp.getChannel();
    } catch {
      return;
    }
    for (const [queue, tag] of this.consumerTags) {
      try {
        await channel.cancel(tag);
        this.logger.log(`Cancelled subscription for ${queue}`);
      } catch (err) {
        this.logger.warn(`Failed to cancel ${queue}: ${(err as Error).message}`);
      }
    }
    this.consumerTags.clear();
  }

  /**
   * Assert queues + bindings, then start consuming. Installs a one-shot
   * close listener on the channel that triggers a re-subscribe after the
   * next successful reconnect.
   */
  private async subscribeAll(): Promise<void> {
    if (this.shuttingDown) return;
    if (this.runners.length === 0) {
      this.logger.log('No consumers registered — nothing to subscribe');
      return;
    }

    let channel: amqplib.Channel;
    try {
      channel = this.amqp.getChannel();
    } catch (err) {
      // AMQP connection not up yet; try again shortly.
      this.logger.warn(
        `AMQP channel not ready (${(err as Error).message}) — retrying subscribe in 500ms`,
      );
      setTimeout(() => void this.subscribeAll(), 500);
      return;
    }

    await channel.prefetch(this.options.prefetch);
    this.consumerTags.clear();

    for (const runner of this.runners) {
      const queue = `${this.options.queuePrefix}${runner.consumer.name}`;
      await channel.assertQueue(queue, {
        durable: true,
        deadLetterExchange: this.options.dlx,
      });

      const patterns = Array.isArray(runner.consumer.eventTypes)
        ? runner.consumer.eventTypes
        : [runner.consumer.eventTypes];
      for (const pattern of patterns) {
        await channel.bindQueue(queue, this.options.exchange, pattern);
      }

      const reply = await channel.consume(
        queue,
        (msg) => {
          if (msg === null) return; // consumer cancelled by broker
          // Defence-in-depth: runner.process already wraps its body in a
          // top-level try/catch, but we still attach .catch here so that any
          // unforeseen rejection cannot escape as an unhandled promise and
          // crash the pod.
          runner.process(channel, msg).catch((err: unknown) => {
            this.logger.error(
              `Unhandled error in runner ${runner.consumer.name}: ${(err as Error).message}`,
            );
          });
        },
        { noAck: false },
      );
      this.consumerTags.set(queue, reply.consumerTag);
      this.logger.log(
        `Subscribed ${runner.consumer.name} on ${queue} (patterns: ${patterns.join(', ')})`,
      );
    }

    // Arm re-subscribe for the next channel close. Channel close happens on:
    //   - broker restart
    //   - network drop
    //   - broker-side channel error (e.g. server kills the channel)
    channel.once('close', () => {
      if (this.shuttingDown) return;
      this.logger.warn('AMQP channel closed — will re-subscribe on reconnect');
      this.consumerTags.clear();
      this.waitForReconnectAndResubscribe();
    });
  }

  /**
   * Polls AmqpConnectionService.getChannel() until it returns without
   * throwing (i.e. the reconnect loop in system-amqp succeeded), then
   * calls subscribeAll() to rebuild queues/bindings/consumers on the
   * fresh channel.
   */
  private waitForReconnectAndResubscribe(): void {
    const poll = (): void => {
      if (this.shuttingDown) return;
      try {
        this.amqp.getChannel();
        void this.subscribeAll();
      } catch {
        setTimeout(poll, 500);
      }
    };
    setTimeout(poll, 500);
  }
}
