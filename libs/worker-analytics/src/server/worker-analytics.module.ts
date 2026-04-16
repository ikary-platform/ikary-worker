import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  workerAnalyticsConfigSchema,
  type WorkerAnalyticsConfig,
  type WorkerAnalyticsConfigInput,
} from '../config/worker-analytics.config.js';
import { AnalyticsRepository } from './repositories/analytics.repository.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { AnalyticsConsumer } from '../modules/analytics/analytics.consumer.js';
import { AnalyticsCleanupService } from '../modules/analytics/analytics-cleanup.service.js';
import { WORKER_ANALYTICS_CONFIG, WORKER_ANALYTICS_DATABASE } from './worker-analytics.tokens.js';

/**
 * Registered as a global module so the sibling `ConsumerModule` (which
 * instantiates `AnalyticsConsumer` via its `CONSUMER` multi-provider token)
 * can inject `AnalyticsService` without the app having to re-import this
 * module everywhere. Matches the `@Global()` pattern used by the other
 * OOTB projection modules.
 */
@Module({})
export class WorkerAnalyticsModule {
  static register(input: WorkerAnalyticsConfigInput): DynamicModule {
    const config: WorkerAnalyticsConfig = workerAnalyticsConfigSchema.parse(input);

    const providers: Provider[] = [
      { provide: WORKER_ANALYTICS_CONFIG, useValue: config },
      {
        provide: WORKER_ANALYTICS_DATABASE,
        useFactory: (db: unknown) => db,
        inject: [config.databaseProviderToken],
      },
      AnalyticsRepository,
      AnalyticsService,
      AnalyticsConsumer,
      AnalyticsCleanupService,
    ];

    return {
      module: WorkerAnalyticsModule,
      global: true,
      providers,
      exports: [
        AnalyticsRepository,
        AnalyticsService,
        AnalyticsConsumer,
        AnalyticsCleanupService,
        WORKER_ANALYTICS_CONFIG,
        WORKER_ANALYTICS_DATABASE,
      ],
    };
  }
}
