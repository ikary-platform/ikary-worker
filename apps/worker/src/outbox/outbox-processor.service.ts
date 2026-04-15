import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { DomainEventEnvelopeSchema } from '@ikary/cell-contract';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { OutboxRow } from '@ikary/cell-runtime-core';
import type { IEventHandler } from '../handlers/event-handler.interface.js';
import { EVENT_HANDLER } from '../handlers/event-handler.interface.js';
import type { IBrokerAdapter } from '../adapters/broker-adapter.interface.js';
import { BROKER_ADAPTER } from '../adapters/broker-adapter.interface.js';

/**
 * Validates outbox rows and dispatches them to registered handlers and the
 * broker adapter.
 *
 * Dispatch order:
 *   1. All matching IEventHandler implementations (in registration order)
 *   2. The IBrokerAdapter (ALWAYS — even when no handlers matched)
 *
 * The broker adapter is not a fallback — it is called unconditionally so that
 * events are always delivered to the message bus. Handlers are side-channel
 * processors that run in addition to broker delivery.
 *
 * Throws on Zod validation failure so the poller can mark the row as failed.
 */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly handlers: IEventHandler[];

  constructor(
    @Optional() @Inject(EVENT_HANDLER) handlers: IEventHandler[] | undefined,
    @Inject(BROKER_ADAPTER) private readonly brokerAdapter: IBrokerAdapter,
  ) {
    this.handlers = handlers ?? [];
  }

  async dispatch(row: OutboxRow): Promise<void> {
    const rawPayload =
      typeof row.payload === 'string'
        ? (JSON.parse(row.payload) as unknown)
        : row.payload;

    const parsed = DomainEventEnvelopeSchema.safeParse(rawPayload);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i: { message: string }) => i.message).join('; ');
      throw new Error(`Invalid DomainEventEnvelope in outbox row ${row.id}: ${issues}`);
    }

    const event: DomainEventEnvelope = parsed.data;

    const matched: IEventHandler[] = [];
    for (const handler of this.handlers) {
      if (this.matchesEvent(handler.eventNames, event.event_name)) {
        matched.push(handler);
        await handler.handle(event);
      }
    }

    await this.brokerAdapter.publish(event);

    this.logger.debug(
      `Dispatched ${event.event_name} [${event.event_id}] to ${matched.length} handler(s) + broker`,
    );
  }

  private matchesEvent(eventNames: string | string[], eventName: string): boolean {
    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    return names.some((pattern) => {
      if (pattern.endsWith('*')) {
        return eventName.startsWith(pattern.slice(0, -1));
      }
      return pattern === eventName;
    });
  }
}
