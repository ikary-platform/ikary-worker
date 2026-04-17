import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  consumerOptionsSchema,
  type ConsumerOptions,
} from '../shared/consumer-options.schema.js';
import {
  CONSUMER_DATABASE,
  CONSUMER_OPTIONS,
} from './consumer.tokens.js';
import { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';
import { ConsumerOffsetsRepository } from './consumer-offsets.repository.js';
import { ConsumerRegistry } from './consumer.registry.js';
import { ReceiptRetentionConsumer } from '../modules/retention/receipt-retention.consumer.js';

export interface RegisterConsumerModuleOptions {
  /**
   * NestJS injection token resolving to a DatabaseService<ConsumerDatabaseSchema>.
   *   The schema must include `ikary_event_consumer_receipts` and
   *   `ikary_event_consumer_offsets` (run the migrations in this package).
   *
   * Same pattern as @ikary/system-log-core's databaseProviderToken: the host
   * app passes whichever token it uses for its DB service, and this module
   * re-exposes it internally under CONSUMER_DATABASE.
   */
  databaseProviderToken: string | symbol | (abstract new (...args: never[]) => unknown);

  /**
   * IConsumer providers. Each entry must use `{ provide: CONSUMER, ..., multi: true }`.
   */
  consumers?: Provider[];

  /** Optional overrides merged with the defaults in consumerOptionsSchema. */
  options?: Partial<ConsumerOptions>;
}

/**
 * Registers the consumer framework:
 *   - Asserts queues + bindings per registered IConsumer
 *   - Starts message consumption with the configured prefetch
 *   - Re-subscribes automatically after RabbitMQ reconnects
 *   - Cancels subscriptions cleanly on application shutdown
 *
 * Depends on SystemAmqpModule being imported by the host app for the AMQP
 * connection; the consumer framework does not own the connection itself.
 */
@Module({})
export class ConsumerModule {
  static register(input: RegisterConsumerModuleOptions): DynamicModule {
    const resolvedOptions = consumerOptionsSchema.parse(input.options ?? {});

    const providers: Provider[] = [
      { provide: CONSUMER_OPTIONS, useValue: resolvedOptions },
      {
        provide: CONSUMER_DATABASE,
        useFactory: (db: unknown) => db,
        inject: [input.databaseProviderToken],
      },
      ConsumerReceiptsRepository,
      ConsumerOffsetsRepository,
      ConsumerRegistry,
      ReceiptRetentionConsumer,
      ...(input.consumers ?? []),
    ];

    return {
      module: ConsumerModule,
      providers,
      exports: [
        CONSUMER_OPTIONS,
        CONSUMER_DATABASE,
        ConsumerReceiptsRepository,
        ConsumerOffsetsRepository,
        ConsumerRegistry,
        ReceiptRetentionConsumer,
      ],
    };
  }
}
