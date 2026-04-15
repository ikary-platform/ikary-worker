import type { DomainEventEnvelope } from '@ikary/cell-contract';

/**
 * Pluggable broker adapter interface.
 *
 * The default implementation is RabbitMQAdapter. To swap it, pass a custom
 * provider to WorkerModule.register():
 * ```ts
 * WorkerModule.register({
 *   brokerAdapter: { provide: BROKER_ADAPTER, useClass: SqsAdapter },
 * })
 * ```
 */
export interface IBrokerAdapter {
  /** Publish a successfully processed domain event to the broker. */
  publish(event: DomainEventEnvelope): Promise<void>;
  /** Route a permanently failed event to the dead-letter destination. */
  publishToDlx(event: DomainEventEnvelope, reason: string): Promise<void>;
  /** Optional lifecycle hook — called after the NestJS module initialises. */
  onModuleInit?(): Promise<void>;
  /** Optional lifecycle hook — called before the NestJS module shuts down. */
  onModuleDestroy?(): Promise<void>;
}

/** Injection token for IBrokerAdapter. */
export const BROKER_ADAPTER = Symbol('BROKER_ADAPTER');
