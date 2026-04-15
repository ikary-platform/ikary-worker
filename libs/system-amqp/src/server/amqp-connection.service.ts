import { Injectable, Logger, Inject, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import amqplib from 'amqplib';
import type { SystemAmqpOptions } from '../shared/options.js';
import { SYSTEM_AMQP_OPTIONS } from './tokens.js';

/**
 * Manages the lifecycle of an AMQP connection and channel.
 *
 * - Connects eagerly on NestJS module init.
 * - Declares the main topic exchange and the dead-letter fanout exchange.
 * - Reconnects automatically after a connection drop.
 * - Closes cleanly on module destroy.
 */
@Injectable()
export class AmqpConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpConnectionService.name);

  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject(SYSTEM_AMQP_OPTIONS) private readonly options: SystemAmqpOptions) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.channel?.close();
    await this.connection?.close();
  }

  /**
   * Return the active channel.
   * @throws if the channel is not yet available (not connected or reconnecting).
   */
  getChannel(): amqplib.Channel {
    if (!this.channel) {
      throw new Error('AMQP channel is not available — not connected or reconnecting');
    }
    return this.channel;
  }

  private async connect(): Promise<void> {
    this.connection = await amqplib.connect(this.options.url);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(this.options.exchange, 'topic',  { durable: true });
    await this.channel.assertExchange(this.options.dlx,      'fanout', { durable: true });

    // Use 'once' so the listener is removed automatically after the first close.
    this.connection.once('close', () => {
      this.logger.warn('AMQP connection closed — scheduling reconnect');
      this.channel    = null;
      this.connection = null;
      this.scheduleReconnect();
    });

    this.connection.on('error', (err: Error) => {
      this.logger.error(`AMQP connection error: ${err.message}`);
    });

    this.logger.log(`Connected to AMQP broker, exchange: ${this.options.exchange}`);
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.logger.log('Attempting AMQP reconnect…');
      try {
        await this.connect();
        this.logger.log('AMQP reconnect successful');
      } catch (err) {
        this.logger.error(`AMQP reconnect failed: ${(err as Error).message}`);
        this.scheduleReconnect();
      }
    }, this.options.reconnectDelayMs);
  }
}
