import { Injectable, Inject } from '@nestjs/common';
import type amqplib from 'amqplib';
import { AmqpConnectionService } from './amqp-connection.service.js';
import type { SystemAmqpOptions } from '../shared/options.js';
import { SYSTEM_AMQP_OPTIONS } from './tokens.js';

/**
 * Publishes messages to the configured AMQP exchanges.
 *
 * Delegates connection management to AmqpConnectionService.
 * Exchange names are taken from the registered SystemAmqpOptions.
 */
@Injectable()
export class AmqpPublisherService {
  constructor(
    private readonly connection: AmqpConnectionService,
    @Inject(SYSTEM_AMQP_OPTIONS) private readonly options: SystemAmqpOptions,
  ) {}

  /**
   * Publish a message to the main topic exchange.
   * @param routingKey RabbitMQ routing key (e.g. built via buildRoutingKey()).
   * @param body       Pre-serialised message body.
   * @param msgOptions Optional amqplib publish options (headers, persistence, …).
   */
  publishToExchange(
    routingKey: string,
    body: Buffer,
    msgOptions?: amqplib.Options.Publish,
  ): void {
    this.connection.getChannel().publish(
      this.options.exchange,
      routingKey,
      body,
      msgOptions,
    );
  }

  /**
   * Publish a message to the dead-letter fanout exchange.
   * @param body       Pre-serialised message body.
   * @param msgOptions Optional amqplib publish options.
   */
  publishToDlx(body: Buffer, msgOptions?: amqplib.Options.Publish): void {
    this.connection.getChannel().publish(
      this.options.dlx,
      '',
      body,
      msgOptions,
    );
  }
}
