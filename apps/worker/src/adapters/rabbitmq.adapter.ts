import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { buildRoutingKey } from '@ikary/system-amqp';
import type { AmqpPublisherService } from '@ikary/system-amqp/server';
import type { IBrokerAdapter } from './broker-adapter.interface.js';

/**
 * Default broker adapter — thin domain layer over AmqpPublisherService.
 *
 * Responsibilities:
 *   - Build a hierarchical routing key from the event envelope fields.
 *   - Attach IKARY-standard AMQP headers (event-id, version, tenant, …).
 *   - Delegate the actual publish/DLX calls to AmqpPublisherService.
 *
 * Connection lifecycle (connect / reconnect / disconnect) is fully managed
 * by AmqpConnectionService inside @ikary/system-amqp. This class has no
 * lifecycle hooks of its own.
 */
@Injectable()
export class RabbitMQAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(RabbitMQAdapter.name);

  constructor(private readonly publisher: AmqpPublisherService) {}

  async publish(event: DomainEventEnvelope): Promise<void> {
    const routingKey = buildRoutingKey({
      eventName:   event.event_name,
      tenantId:    event.tenant_id,
      workspaceId: event.workspace_id,
      cellId:      event.cell_id,
    });

    const body = Buffer.from(JSON.stringify(event));
    this.publisher.publishToExchange(routingKey, body, {
      persistent:   true,
      contentType:  'application/json',
      headers: {
        'x-event-id':      event.event_id,
        'x-event-version': event.version,
        'x-tenant-id':     event.tenant_id,
        'x-workspace-id':  event.workspace_id,
        'x-cell-id':       event.cell_id,
      },
    });

    this.logger.debug(`Published ${event.event_name} → ${routingKey}`);
  }

  async publishToDlx(event: DomainEventEnvelope, reason: string): Promise<void> {
    const body = Buffer.from(JSON.stringify({ event, failure_reason: reason }));
    this.publisher.publishToDlx(body, { persistent: true });
    this.logger.warn(`DLX: ${event.event_name} [${event.event_id}]: ${reason}`);
  }
}
