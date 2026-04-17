// Server surface — NestJS providers, module, tokens, repositories.
export { ConsumerModule, type RegisterConsumerModuleOptions } from './consumer.module.js';
export { ConsumerRegistry } from './consumer.registry.js';
export { ConsumerReceiptsRepository } from './repositories/consumer-receipts.repository.js';
export { ConsumerOffsetsRepository } from './repositories/consumer-offsets.repository.js';
export {
  ConsumerRunner,
  aggregateKeyOf,
  isReceiptUniqueViolation,
  transactionRunnerFor,
  type RunnerChannel,
  type TransactionRunner,
} from './consumer.runner.js';
export { ConsumerHealthIndicator, type ConsumerHealthResult } from './health/consumer.health-indicator.js';
export { CONSUMER, CONSUMER_DATABASE, CONSUMER_OPTIONS } from './consumer.tokens.js';
export type { ConsumerDatabaseSchema, ConsumerReceiptsTable, ConsumerOffsetsTable } from './db/schema.js';
