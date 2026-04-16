// Shared surface — framework-agnostic, no NestJS or Node runtime imports.
export {
  consumerOptionsSchema,
  type ConsumerOptions,
  type ConsumerOptionsInput,
} from './config/consumer-options.schema.js';
export * from './shared/index.js';
