/**
 * Header name used to track the retry count on republished messages.
 *
 * RabbitMQ does not track how many times a message has been requeued
 * (nack with requeue=true just returns the message to the queue with no
 * counter). To cap retries we republish-to-self with this header incremented;
 * the broker treats each republish as a brand-new message but the header
 * survives the round-trip.
 */
export const RETRY_COUNT_HEADER = 'x-retry-count';

export type AmqpHeaders = Record<string, unknown> | undefined;

/**
 * Read the retry count from a message's headers.
 * Missing / malformed header is treated as zero.
 */
export function getRetryCount(headers: AmqpHeaders): number {
  if (!headers) return 0;
  const raw = headers[RETRY_COUNT_HEADER];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  return 0;
}

/**
 * Produce a new headers object with the retry count incremented by 1,
 * preserving all other headers.
 */
export function incrementRetry(headers: AmqpHeaders): Record<string, unknown> {
  return {
    ...(headers ?? {}),
    [RETRY_COUNT_HEADER]: getRetryCount(headers) + 1,
  };
}
