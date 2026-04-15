import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import amqplib from 'amqplib';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IBrokerAdapter } from './broker-adapter.interface.js';
import { env } from '../config/env.js';

/**
 * Default broker adapter — publishes events to a RabbitMQ topic exchange.
 *
 * Topology:
 *   Exchange  cell.events     (topic)  — live events, routing key = event_name
 *   Exchange  cell.events.dlx (fanout) — permanently failed events
 */
@Injectable()
export class RabbitMQAdapter implements IBrokerAdapter, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQAdapter.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;

  async onModuleInit(): Promise<void> {
    this.connection = await amqplib.connect(env.RABBITMQ_URL);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    await this.channel.assertExchange(env.RABBITMQ_DLX, 'fanout', { durable: true });

    this.logger.log(`Connected to RabbitMQ, exchange: ${env.RABBITMQ_EXCHANGE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  /**
   * Publish a DomainEventEnvelope to the topic exchange.
   * Routing key = event_name (e.g. "invoice.created", "entity.updated").
   */
  async publish(event: DomainEventEnvelope): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialised');

    const payload = Buffer.from(JSON.stringify(event));
    this.channel.publish(env.RABBITMQ_EXCHANGE, event.event_name, payload, {
      persistent: true,
      contentType: 'application/json',
      headers: {
        'x-event-id':       event.event_id,
        'x-event-version':  event.version,
        'x-tenant-id':      event.tenant_id,
        'x-workspace-id':   event.workspace_id,
        'x-cell-id':        event.cell_id,
      },
    });

    this.logger.debug(`Published ${event.event_name} [${event.event_id}]`);
  }

  /**
   * Route a permanently failed event to the dead-letter exchange.
   */
  async publishToDlx(event: DomainEventEnvelope, reason: string): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not initialised');

    const payload = Buffer.from(JSON.stringify({ event, failure_reason: reason }));
    this.channel.publish(env.RABBITMQ_DLX, '', payload, { persistent: true });

    this.logger.warn(`Sent ${event.event_name} [${event.event_id}] to DLX: ${reason}`);
  }
}
