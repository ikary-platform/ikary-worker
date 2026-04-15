// Shared surface — framework-agnostic, no NestJS or Node runtime imports.
export { systemAmqpOptionsSchema, type SystemAmqpOptions } from './shared/options.js';
export { buildRoutingKey, type RoutingKeyInput } from './shared/routing-key.js';
