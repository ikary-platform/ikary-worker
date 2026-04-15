import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseService } from '@ikary/system-db-core';
import { OutboxRepository } from '@ikary/cell-runtime-core';
import type { CellRuntimeDatabase } from '@ikary/cell-runtime-core';
import { DatabaseModule } from './database.module.js';
import { HealthModule } from './health/health.module.js';
import { RabbitMQAdapter } from './adapters/rabbitmq.adapter.js';
import { BROKER_ADAPTER } from './adapters/broker-adapter.interface.js';
import { OutboxProcessorService } from './outbox/outbox-processor.service.js';
import { OutboxPollerService } from './outbox/outbox-poller.service.js';

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
   * Custom broker adapter provider. Omit to use the default RabbitMQAdapter.
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

    return {
      module: WorkerModule,
      imports: [ScheduleModule.forRoot(), DatabaseModule, HealthModule],
      providers: [
        outboxRepositoryProvider,
        brokerAdapterProvider,
        ...(options.handlers ?? []),
        OutboxProcessorService,
        OutboxPollerService,
      ],
    };
  }
}
