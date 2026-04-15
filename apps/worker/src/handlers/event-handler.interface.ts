import type { DomainEventEnvelope } from '@ikary/cell-contract';

/**
 * Plugin interface for domain-event handlers.
 *
 * Register handlers via WorkerModule.register():
 * ```ts
 * WorkerModule.register({
 *   handlers: [
 *     { provide: EVENT_HANDLER, useClass: MyHandler, multi: true },
 *   ],
 * })
 * ```
 *
 * eventNames supports a "*" suffix wildcard:
 *   "invoice.*"  — matches "invoice.created", "invoice.updated", …
 *   "invoice.created" — exact match only
 *   ["invoice.created", "invoice.updated"] — any listed name
 */
export interface IEventHandler {
  /** Event name(s) this handler processes. Supports "*" suffix wildcard. */
  readonly eventNames: string | string[];
  handle(event: DomainEventEnvelope): Promise<void>;
}

/** Multi-provider injection token for IEventHandler. */
export const EVENT_HANDLER = Symbol('EVENT_HANDLER');
