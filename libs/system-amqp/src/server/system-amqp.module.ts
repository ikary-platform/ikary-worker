import { Module, type DynamicModule } from '@nestjs/common';
import type { SystemAmqpOptions } from '../shared/options.js';
import { SYSTEM_AMQP_OPTIONS } from './tokens.js';
import { AmqpConnectionService } from './amqp-connection.service.js';
import { AmqpPublisherService } from './amqp-publisher.service.js';

/**
 * NestJS module that wires AMQP connection and publisher services.
 *
 * Registered as a global module so sibling modules (e.g. a worker's
 * `ConsumerModule`) can inject `AmqpConnectionService` without having to
 * re-import `SystemAmqpModule` themselves. This matches the convention
 * already used by other infra modules (`DatabaseModule`, `SystemLogModule`):
 * one registration per app at bootstrap, shared everywhere.
 *
 * @example
 * SystemAmqpModule.register({
 *   url:      env.RABBITMQ_URL,
 *   exchange: env.RABBITMQ_EXCHANGE,
 *   dlx:      env.RABBITMQ_DLX,
 * })
 */
@Module({})
export class SystemAmqpModule {
  static register(options: SystemAmqpOptions): DynamicModule {
    return {
      module: SystemAmqpModule,
      global: true,
      providers: [
        { provide: SYSTEM_AMQP_OPTIONS, useValue: options },
        AmqpConnectionService,
        AmqpPublisherService,
      ],
      exports: [AmqpConnectionService, AmqpPublisherService],
    };
  }
}
