import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  workerAnalyticsConfigSchema,
  type WorkerAnalyticsConfig,
} from '../config/worker-analytics.config.js';
import { AnalyticsRepository } from './repositories/analytics.repository.js';
import { AnalyticsService } from '../modules/analytics/analytics.service.js';
import { AnalyticsConsumer } from '../modules/analytics/analytics.consumer.js';
import { WORKER_ANALYTICS_CONFIG, WORKER_ANALYTICS_DATABASE } from './worker-analytics.tokens.js';

@Module({})
export class WorkerAnalyticsModule {
  static register(input: WorkerAnalyticsConfig): DynamicModule {
    const config = workerAnalyticsConfigSchema.parse(input);

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
    ];

    return {
      module: WorkerAnalyticsModule,
      providers,
      exports: [
        AnalyticsRepository,
        AnalyticsService,
        AnalyticsConsumer,
        WORKER_ANALYTICS_CONFIG,
        WORKER_ANALYTICS_DATABASE,
      ],
    };
  }
}
