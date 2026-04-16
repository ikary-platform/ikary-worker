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
   * Receipts (in `ikary_event_consumer_receipts`) older than this many
   * days are deleted by a daily cleanup job at 04:00 server time.
   * Defaults to 7 days.
   *
   * This window MUST exceed the longest interval over which the broker
   * could redeliver a message (typical RabbitMQ deployments: DLX
   * republish-to-self bounded by `maxRetries` above, plus queue
   * residency). 7 days is conservative for a `maxRetries: 5` default —
   * override if you deploy a DLX with its own long retention window.
   *
   * Pass `null` to disable cleanup entirely. Useful for tests,
   * short-lived environments, or when an external job (e.g. a table
   * partition pruner) owns receipt retention.
   *
   * The offsets table (`ikary_event_consumer_offsets`) is intentionally
   * NOT cleaned up: deleting a per-aggregate offset would break gap
   * detection if the aggregate ever becomes active again.
   */
  receiptRetentionDays: z.number().int().positive().nullable().default(7),
});

export type ConsumerOptions = z.infer<typeof consumerOptionsSchema>;
export type ConsumerOptionsInput = z.input<typeof consumerOptionsSchema>;
