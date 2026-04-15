import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseService } from '@ikary/system-db-core';
import { OutboxRepository } from '@ikary/cell-runtime-core';
import type { CellRuntimeDatabase } from '@ikary/cell-runtime-core';
import { SystemAmqpModule } from '@ikary/system-amqp/server';
import { systemAmqpOptionsSchema } from '@ikary/system-amqp';
import { SystemLogModule } from '@ikary/system-log-core/server';
import { env } from './config/env.js';
import { DatabaseModule } from './database.module.js';
import { HealthModule } from './health/health.module.js';
import { RabbitMQAdapter } from './adapters/rabbitmq.adapter.js';
import { BROKER_ADAPTER } from './adapters/broker-adapter.interface.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { OutboxPollerService } from './outbox/outbox-poller.service.js';

/**
 * Alias token used to pass the shared DatabaseService to SystemLogModule
 * without creating a second DB connection.
 */
const WORKER_LOG_DB = Symbol('WORKER_LOG_DB');

export interface WorkerModuleOptions {
  /**
   * Additional event-handler providers using NestJS multi-provider injection.
   *
   * @example
   * handlers: [
   *   { provide: EVENT_HANDLER, useClass: InvoiceCreatedHandler, multi: true },
   * ]
   */
  handlers?: Provider[];
  /**
   * Custom broker adapter provider. Omit to use the default RabbitMQAdapter
   * (backed by @ikary/system-amqp).
   *
   * @example
   * brokerAdapter: { provide: BROKER_ADAPTER, useClass: SqsAdapter }
   */
  brokerAdapter?: Provider;
}

/**
 * Core worker module. Call WorkerModule.register() in your application's root
 * module — this is the entire public API surface for downstream consumers.
 *
 * Logging: SystemLogModule (@ikary/system-log-core) is registered globally.
 * Call `app.useLogger(app.get(LogService))` in main.ts to route all NestJS
 * Logger calls through the platform logger (structured Pino, DB-backed sinks).
 *
 * Broker: When no brokerAdapter is provided, RabbitMQAdapter is used and
 * SystemAmqpModule is automatically imported. Providing a custom brokerAdapter
 * skips the AMQP connection entirely.
 *
 * @example — private app module
 * ```ts
 * import { Module } from '@nestjs/common';
 * import { WorkerModule, EVENT_HANDLER } from '@ikary/worker';
 * import { InvoiceCreatedHandler } from './handlers/invoice-created.handler';
 *
 * @Module({
 *   imports: [
 *     WorkerModule.register({
 *       handlers: [
 *         { provide: EVENT_HANDLER, useClass: InvoiceCreatedHandler, multi: true },
 *       ],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class WorkerModule {
  static register(options: WorkerModuleOptions = {}): DynamicModule {
    const useDefaultBroker = !options.brokerAdapter;

    const brokerAdapterProvider: Provider = options.brokerAdapter ?? {
      provide: BROKER_ADAPTER,
      useClass: RabbitMQAdapter,
    };

    const outboxRepositoryProvider: Provider = {
      provide: OutboxRepository,
      useFactory: (db: DatabaseService<CellRuntimeDatabase>) =>
        new OutboxRepository(db),
      inject: [DatabaseService],
    };

    const amqpImports = useDefaultBroker
      ? [
          SystemAmqpModule.register(
            systemAmqpOptionsSchema.parse({
              url:      env.RABBITMQ_URL,
              exchange: env.RABBITMQ_EXCHANGE,
              dlx:      env.RABBITMQ_DLX,
            }),
          ),
        ]
      : [];

    return {
      module: WorkerModule,
      imports: [
        // Structured platform logging — globally available, routes NestJS Logger
        // through Pino with DB-backed sinks and the system-log-core UI viewer.
        // Note: log DB tables must exist (see migrations in @ikary/system-log-core).
        SystemLogModule.register({
          databaseProviderToken: WORKER_LOG_DB,
          service:          'ikary-worker',
          pretty:           env.LOG_PRETTY,
          seedDefaultSink:  true,
        }),
        ScheduleModule.forRoot(),
        DatabaseModule,
        HealthModule,
        ...amqpImports,
      ],
      providers: [
        // Alias so SystemLogModule can reuse the shared DB connection without
        // opening a second pool. useExisting means zero overhead.
        { provide: WORKER_LOG_DB, useExisting: DatabaseService },
        outboxRepositoryProvider,
        brokerAdapterProvider,
        ...(options.handlers ?? []),
        OutboxProcessorService,
        OutboxPollerService,
      ],
    };
  }
}
