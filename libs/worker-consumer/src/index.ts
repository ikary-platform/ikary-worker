// Shared surface — framework-agnostic, no NestJS or Node runtime imports.
export { consumerOptionsSchema, type ConsumerOptions } from './shared/consumer-options.schema.js';
export type { IConsumer, HandlerTransaction } from './shared/consumer.contract.js';
export {
  RETRY_COUNT_HEADER,
  getRetryCount,
  incrementRetry,
  type AmqpHeaders,
} from './shared/retry-metadata.js';
