import { Logger } from '@nestjs/common';
import type amqplib from 'amqplib';
import { DomainEventEnvelopeSchema, type DomainEventEnvelope } from '@ikary/cell-contract';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { IConsumer } from '../shared/consumer.contract.js';
import type { ConsumerOptions } from '../shared/consumer-options.schema.js';
import { getRetryCount, incrementRetry } from '../shared/retry-metadata.js';
import type { ConsumerDatabaseSchema } from './consumer.database.js';
import type { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';
import type { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';

type DbService = DatabaseService<ConsumerDatabaseSchema>;

/** Kysely-style transaction supplier. Kept minimal so it's easy to stub. */
export interface TransactionRunner {
  withTransaction<T>(fn: (tx: Queryable<ConsumerDatabaseSchema>) => Promise<T>): Promise<T>;
}

/** Subset of amqplib.Channel the runner interacts with — simplifies mocking. */
export interface RunnerChannel {
  ack(message: amqplib.Message, allUpTo?: boolean): void;
  nack(message: amqplib.Message, allUpTo?: boolean, requeue?: boolean): boolean | void;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: amqplib.Options.Publish,
  ): boolean;
}

/** Adapts a DatabaseService into a TransactionRunner. */
export function transactionRunnerFor(db: DbService): TransactionRunner {
  return {
    withTransaction: (fn) =>
      db.db.transaction().execute(async (trx) => fn(trx as Queryable<ConsumerDatabaseSchema>)),
  };
}

/**
 * PostgreSQL error code for unique_violation. If a receipt insert trips this
 * inside a handler transaction, we treat it as a duplicate delivery and ack
 * — NOT a real failure. Captured as a string because different driver layers
 * expose the code slightly differently.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
}

/**
 * Processes a single message for one consumer. One ConsumerRunner instance
 * is created per (IConsumer) on startup. The registry wires it up to the
 * AMQP channel and calls process() for every incoming message.
 *
 * The control flow is intentionally linear — top-to-bottom, no early exits
 * that skip the ack/nack — to keep the state machine easy to audit.
 */
export class ConsumerRunner {
  private readonly logger: Logger;

  constructor(
    public readonly consumer: IConsumer,
    private readonly options: ConsumerOptions,
    private readonly receipts: ConsumerReceiptsRepository,
    private readonly offsets: ConsumerOffsetsRepository,
    private readonly txRunner: TransactionRunner,
  ) {
    this.logger = new Logger(`ConsumerRunner(${consumer.name})`);
  }

  /**
   * Process one AMQP delivery. Always responds with exactly one ack OR nack
   * OR ack-after-republish — never leaves a message un-settled.
   */
  async process(channel: RunnerChannel, msg: amqplib.ConsumeMessage): Promise<void> {
    // Step 1 — parse envelope
    const event = this.parseEnvelope(msg.content);
    if (!event) {
      // Poison message — to DLX immediately, no retry, no redeliver.
      channel.nack(msg, false, false);
      return;
    }

    // Step 2 — retry cap
    const retries = getRetryCount(msg.properties.headers);
    if (retries >= this.options.maxRetries) {
      this.logger.warn(
        `Max retries (${this.options.maxRetries}) exceeded for event ${event.event_id} — routing to DLX`,
      );
      channel.nack(msg, false, false);
      return;
    }

    // Step 3 — idempotency fast path
    if (await this.receipts.exists(this.consumer.name, event.event_id)) {
      this.logger.debug(`Duplicate delivery of ${event.event_id} — ack and skip`);
      channel.ack(msg);
      return;
    }

    // Step 4 — gap detection
    const aggregateKey = aggregateKeyOf(event);
    const lastVersion = await this.offsets.getLastVersion(
      this.consumer.name,
      event.tenant_id,
      aggregateKey,
    );

    if (lastVersion !== null) {
      if (event.version <= lastVersion) {
        // Already past this version — consistent with receipts having been
        // cleaned up; ack and move on.
        this.logger.debug(
          `Event v${event.version} <= last v${lastVersion} for ${aggregateKey} — ack and skip`,
        );
        channel.ack(msg);
        return;
      }
      if (event.version > lastVersion + 1) {
        // A prior version is missing — wait for it by republishing with
        // an incremented retry count. RabbitMQ will redeliver; by the time
        // we hit maxRetries on the gap, it routes to the DLX for inspection.
        this.logger.warn(
          `Gap on ${aggregateKey}: expected v${lastVersion + 1}, got v${event.version} — requeuing`,
        );
        this.republishForRetry(channel, msg);
        channel.ack(msg);
        return;
      }
    }

    // Step 5 — happy path: handler + receipt + offset, all in one transaction
    try {
      await this.txRunner.withTransaction(async (tx) => {
        await this.consumer.handle(event, tx);
        await this.receipts.insert(this.consumer.name, event.event_id, tx);
        await this.offsets.upsert(
          this.consumer.name,
          event.tenant_id,
          aggregateKey,
          event.version,
          tx,
        );
      });
      channel.ack(msg);
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Race with another delivery — another pod inserted the receipt
        // first. Ack as duplicate.
        this.logger.debug(
          `Unique violation on receipt for ${event.event_id} — ack as duplicate`,
        );
        channel.ack(msg);
        return;
      }
      this.logger.error(
        `Handler failed for event ${event.event_id}: ${(err as Error).message}`,
      );
      this.republishForRetry(channel, msg);
      channel.ack(msg);
    }
  }

  private parseEnvelope(content: Buffer): DomainEventEnvelope | null {
    try {
      const raw = JSON.parse(content.toString('utf-8')) as unknown;
      const result = DomainEventEnvelopeSchema.safeParse(raw);
      if (!result.success) {
        this.logger.warn(
          `Invalid DomainEventEnvelope — routing to DLX: ${result.error.issues.map((i) => i.message).join('; ')}`,
        );
        return null;
      }
      return result.data;
    } catch (err) {
      this.logger.warn(`Unparseable message body — routing to DLX: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Publish a fresh copy of the message back into the same routing key,
   * with the retry count incremented. The original is then acked by the
   * caller — this is the "republish-to-self" pattern that gives us a
   * bounded retry counter (vanilla nack+requeue has no counter).
   */
  private republishForRetry(channel: RunnerChannel, msg: amqplib.ConsumeMessage): void {
    channel.publish(this.options.exchange, msg.fields.routingKey, msg.content, {
      persistent:  true,
      contentType: msg.properties.contentType,
      headers:     incrementRetry(msg.properties.headers),
    });
  }
}

/**
 * Derive the offset aggregate key from an event envelope.
 * Format: `{entity.type}:{entity.id}` — scoped per-aggregate so that events
 * for different aggregates don't cross-block each other on gap detection.
 */
export function aggregateKeyOf(event: DomainEventEnvelope): string {
  return `${event.entity.type}:${event.entity.id}`;
}
