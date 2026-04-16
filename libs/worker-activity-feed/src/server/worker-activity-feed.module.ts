import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  workerActivityFeedConfigSchema,
  type WorkerActivityFeedConfig,
} from '../config/worker-activity-feed.config.js';
import { ActivityFeedRepository } from './repositories/activity-feed.repository.js';
import { ActivityFeedService } from '../modules/activity-feed/activity-feed.service.js';
import { ActivityFeedConsumer } from '../modules/activity-feed/activity-feed.consumer.js';
import {
  WORKER_ACTIVITY_FEED_CONFIG,
  WORKER_ACTIVITY_FEED_DATABASE,
} from './worker-activity-feed.tokens.js';

@Module({})
export class WorkerActivityFeedModule {
  static register(input: WorkerActivityFeedConfig): DynamicModule {
    const config = workerActivityFeedConfigSchema.parse(input);

    const providers: Provider[] = [
      { provide: WORKER_ACTIVITY_FEED_CONFIG, useValue: config },
      {
        provide: WORKER_ACTIVITY_FEED_DATABASE,
        useFactory: (db: unknown) => db,
        inject: [config.databaseProviderToken],
      },
      ActivityFeedRepository,
      ActivityFeedService,
      ActivityFeedConsumer,
    ];

    return {
      module: WorkerActivityFeedModule,
      providers,
      exports: [
        ActivityFeedRepository,
        ActivityFeedService,
        ActivityFeedConsumer,
        WORKER_ACTIVITY_FEED_CONFIG,
        WORKER_ACTIVITY_FEED_DATABASE,
      ],
    };
  }
}
