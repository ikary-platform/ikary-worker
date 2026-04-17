import { z } from 'zod';

export const consumerOptionsSchema = z.object({
  /**
   * Prefix prepended to each consumer's queue name.
   * A consumer with `name: 'audit'` gets queue `ikary.audit` by default.
   */
  queuePrefix: z.string().default('ikary.'),

  /**
   * Name of the topic exchange consumers bind to.
   * Must match the exchange the publisher writes to (@ikary/worker defaults
   * to `cell.events`).
   */
  exchange: z.string().default('cell.events'),

  /**
   * Channel-level prefetch: maximum number of unacked messages per pod.
   * Creates back-pressure automatically — slow consumers don't drown.
   */
  prefetch: z.number().int().positive().default(32),

  /**
   * Hard cap on retry attempts (tracked via `x-retry-count` header).
   * Beyond this, messages are nacked to the DLX without requeue.
   */
  maxRetries: z.number().int().positive().default(5),

  /**
   * Name of the DLX to route permanently-failed messages to.
   * Matches the DLX the publisher declares (@ikary/worker defaults to
   * `cell.events.dlx`).
   */
  dlx: z.string().default('cell.events.dlx'),

  /**
   * Declared retention intent for `ikary_event_consumer_receipts`, in
   * days — the spec an external scheduler reads. **This module does
   * not schedule or perform cleanup**; it only exposes
   * `ConsumerReceiptsRepository.deleteOlderThan` as the DB primitive
   * and this value as the policy.
   *
   * Scheduling lives in a separate `ikary-scheduler` app so that
   * multi-pod worker deployments don't fire N simultaneous sweeps.
   *
   * Defaults to 7 days — conservative for the default `maxRetries: 5`.
   *
   * Scheduler-level note: this window MUST exceed the longest interval
   * over which the broker could redeliver a message (typical RabbitMQ
   * setups: DLX republish-to-self bounded by `maxRetries`, plus queue
   * residency). Deleting a receipt that still references a redeliverable
   * message would let it slip past idempotency and re-run the handler's
   * side effects. Override upward if your DLX has long retention or you
   * replay from archive.
   *
   * Pass `null` to mark retention as "disabled / externally managed".
   *
   * The offsets table (`ikary_event_consumer_offsets`) is intentionally
   * NOT included in the retention spec: deleting a per-aggregate offset
   * would break gap detection if the aggregate ever becomes active
   * again.
   */
  receiptRetentionDays: z.number().int().positive().nullable().default(7),
});

export type ConsumerOptions = z.infer<typeof consumerOptionsSchema>;
export type ConsumerOptionsInput = z.input<typeof consumerOptionsSchema>;
