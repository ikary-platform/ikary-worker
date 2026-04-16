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
});

export type ConsumerOptions = z.infer<typeof consumerOptionsSchema>;
