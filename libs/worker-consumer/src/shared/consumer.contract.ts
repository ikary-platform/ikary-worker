import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { Queryable } from '@ikary/system-db-core';

/**
 * Loose Kysely transaction handle passed to consumer handlers.
 *
 * Typed with `any` at the contract level because each downstream app has its
 * own Kysely schema that extends the framework's `ConsumerDatabaseSchema`.
 * At runtime this is a real Kysely transaction on the host's DB; consumers
 * should cast to their own schema when writing:
 *
 * ```ts
 * class MyConsumer implements IConsumer {
 *   async handle(event, tx) {
 *     const db = tx as Kysely<MyAppDatabase>;
 *     await db.insertInto('my_table').values({ ... }).execute();
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerTransaction = Queryable<any>;

/**
 * Contract every registered consumer must implement.
 *
 * Two orthogonal knobs:
 *
 *   - `name` controls SCALING. Pods of the same service declare the same name
 *     and compete for messages from a single shared queue (`{prefix}{name}`).
 *     Run four pods of the metrics service with name "metrics" and RabbitMQ
 *     round-robins messages across them — each message processed exactly
 *     once across the group.
 *
 *   - `eventTypes` controls FAN-OUT. Each consumer gets its own queue bound
 *     to the `cell.events` topic exchange once per pattern. Different
 *     consumer names = different queues = each receives its own copy of
 *     matching events. A consumer subscribing to
 *     `['invoice.*', 'system.shutdown']` receives all invoice events AND the
 *     system shutdown broadcast; a consumer subscribing to `['metrics.*']`
 *     receives only metrics events — they don't compete.
 *
 * Topic-exchange routing rules: `*` matches exactly one path segment,
 * `#` matches zero or more.
 */
export interface IConsumer {
  /** Logical consumer name. Must be a valid AMQP queue suffix. */
  readonly name: string;
  /** One or more topic-exchange binding patterns. */
  readonly eventTypes: string | string[];

  /**
   * Called inside a Kysely transaction. The framework inserts the idempotency
   * receipt and advances the offset in the SAME transaction, so handler DB
   * side-effects are either fully persisted alongside the receipt or rolled
   * back together on failure.
   *
   * Side effects outside the DB (HTTP calls, external APIs, file writes) are
   * not transaction-protected. Consumers doing such work must be idempotent
   * at the handler level — the same event may be redelivered after a crash.
   */
  handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void>;
}
