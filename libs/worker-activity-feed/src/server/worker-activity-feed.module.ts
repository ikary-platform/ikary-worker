import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  workerActivityFeedConfigSchema,
  type WorkerActivityFeedConfig,
} from '../config/worker-activity-feed.config.js';
import { ActivityFeedRepository } from './repositories/activity-feed.repository.js';
import { ActivityFeedService } from '../modules/activity-feed/activity-feed.service.js';
import { ActivityFeedConsumer } from '../modules/activity-feed/activity-feed.consumer.js';
import { ActivityFeedRetentionConsumer } from '../modules/activity-feed/activity-feed-retention.consumer.js';
import {
  WORKER_ACTIVITY_FEED_CONFIG,
  WORKER_ACTIVITY_FEED_DATABASE,
} from './worker-activity-feed.tokens.js';

/**
 * Registered as a global module so the sibling `ConsumerModule` (which
 * instantiates `ActivityFeedConsumer` via its `CONSUMER` multi-provider
 * token) can inject `ActivityFeedService` without the app having to
 * re-import this module everywhere. Matches the `@Global()` pattern used by
 * the other OOTB projection modules.
 */
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
      ActivityFeedRetentionConsumer,
    ];

    return {
      module: WorkerActivityFeedModule,
      global: true,
      providers,
      exports: [
        ActivityFeedRepository,
        ActivityFeedService,
        ActivityFeedConsumer,
        ActivityFeedRetentionConsumer,
        WORKER_ACTIVITY_FEED_CONFIG,
        WORKER_ACTIVITY_FEED_DATABASE,
      ],
    };
  }
}
