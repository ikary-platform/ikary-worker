// Shared surface — framework-agnostic, no NestJS or Node runtime imports.
// Imported both by the server entrypoint and by the top-level package
// entrypoint (src/index.ts) so downstream UIs can reuse these types.
export type { IConsumer, HandlerTransaction } from './consumer.contract.js';
export {
  RETRY_COUNT_HEADER,
  getRetryCount,
  incrementRetry,
  type AmqpHeaders,
} from './retry-metadata.js';
