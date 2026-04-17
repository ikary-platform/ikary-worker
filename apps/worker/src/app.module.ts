import { Module } from '@nestjs/common';
import { DatabaseService } from '@ikary/system-db-core';
import {
  ConsumerModule,
  CONSUMER,
  ReceiptRetentionConsumer,
} from '@ikary/worker-consumer/server';
import { WorkerAuditModule, AuditConsumer, AuditRetentionConsumer } from '@ikary/worker-audit/server';
import {
  WorkerAnalyticsModule,
  AnalyticsConsumer,
  AnalyticsRetentionConsumer,
} from '@ikary/worker-analytics/server';
import {
  WorkerActivityFeedModule,
  ActivityFeedConsumer,
  ActivityFeedRetentionConsumer,
} from '@ikary/worker-activity-feed/server';
import { WorkerModule } from './worker.module.js';

/**
 * The OOTB consumers wired into this reference app. A single `useFactory`
 * provider collects all consumer classes (already instantiated and globally
 * available via their own Worker*Module) into the array that
 * `ConsumerRegistry` expects at `@Inject(CONSUMER)`.
 *
 * This shape (one non-multi factory) is used instead of three `multi: true`
 * providers because NestJS collapses same-token `multi: true` providers
 * across dynamic modules in surprising ways — three of them end up resolving
 * to a single instance, leaving two consumers silently un-subscribed. The
 * factory pattern sidesteps that entirely: one provider, one resolution,
 * explicit array.
 */
const CONSUMER_PROVIDERS = [
  {
    provide: CONSUMER,
    useFactory: (
      audit: AuditConsumer,
      analytics: AnalyticsConsumer,
      activity: ActivityFeedConsumer,
      auditRetention: AuditRetentionConsumer,
      analyticsRetention: AnalyticsRetentionConsumer,
      activityRetention: ActivityFeedRetentionConsumer,
      receiptRetention: ReceiptRetentionConsumer,
    ) => [
      audit, analytics, activity,
      auditRetention, analyticsRetention, activityRetention, receiptRetention,
    ],
    inject: [
      AuditConsumer, AnalyticsConsumer, ActivityFeedConsumer,
      AuditRetentionConsumer, AnalyticsRetentionConsumer,
      ActivityFeedRetentionConsumer, ReceiptRetentionConsumer,
    ],
  },
];

/**
 * Default OSS application wiring — ships with seven OOTB consumers:
 *
 *   - AuditConsumer                  → ikary_audit_entries              (compliance trail)
 *   - AnalyticsConsumer              → ikary_analytics_buckets_hourly   (dashboards)
 *   - ActivityFeedConsumer           → ikary_activity_entries           (user-facing feed)
 *   - AuditRetentionConsumer         → scheduler.retention.audit        (cleanup)
 *   - AnalyticsRetentionConsumer     → scheduler.retention.analytics    (cleanup)
 *   - ActivityFeedRetentionConsumer  → scheduler.retention.activity-feed (cleanup)
 *   - ReceiptRetentionConsumer       → scheduler.retention.consumer-receipts (cleanup)
 *
 * Each is a thin IConsumer backed by a service + repository. A downstream
 * `ikary-enterprise-worker` repo composes on top by building its own
 * AppModule: import WorkerModule + the OSS modules it wants to keep + its
 * own domain modules, and register all active consumers explicitly under
 * ConsumerModule.register({ consumers }).
 *
 * The two-place wiring (module import AND consumer provider) is deliberate:
 * it makes the active consumer set auditable by reading this file alone.
 */
@Module({
  imports: [
    WorkerModule.register(),

    // OOTB projection libs — each ships its own migration, service, repo.
    WorkerAuditModule.register({         databaseProviderToken: DatabaseService }),
    WorkerAnalyticsModule.register({     databaseProviderToken: DatabaseService }),
    WorkerActivityFeedModule.register({  databaseProviderToken: DatabaseService }),

    // Register the broker consumers. The factory provider in
    // CONSUMER_PROVIDERS bundles the three OOTB consumer classes into the
    // IConsumer[] that ConsumerRegistry injects at @Inject(CONSUMER).
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: CONSUMER_PROVIDERS,
    }),
  ],
})
export class AppModule {}
