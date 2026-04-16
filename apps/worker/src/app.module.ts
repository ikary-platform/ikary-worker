import { Module } from '@nestjs/common';
import { DatabaseService } from '@ikary/system-db-core';
import { ConsumerModule, CONSUMER } from '@ikary/worker-consumer/server';
import { WorkerAuditModule, AuditConsumer } from '@ikary/worker-audit/server';
import { WorkerAnalyticsModule, AnalyticsConsumer } from '@ikary/worker-analytics/server';
import {
  WorkerActivityFeedModule,
  ActivityFeedConsumer,
} from '@ikary/worker-activity-feed/server';
import { WorkerModule } from './worker.module.js';

/**
 * The OOTB consumers wired into this reference app. Extracted to named
 * constants so TypeScript's excess-property check on inline object literals
 * against NestJS's `Provider` union doesn't choke on the `multi` key (valid
 * at runtime, not in the union type).
 */
const CONSUMER_PROVIDERS = [
  { provide: CONSUMER, useClass: AuditConsumer,        multi: true as const },
  { provide: CONSUMER, useClass: AnalyticsConsumer,    multi: true as const },
  { provide: CONSUMER, useClass: ActivityFeedConsumer, multi: true as const },
];

/**
 * Default OSS application wiring — ships with three OOTB consumers:
 *
 *   - AuditConsumer          → ikary_audit_entries              (compliance trail)
 *   - AnalyticsConsumer      → ikary_analytics_buckets_hourly   (dashboards)
 *   - ActivityFeedConsumer   → ikary_activity_entries           (user-facing feed)
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

    // Register the broker consumers. Each one is a provider exported by its
    // module. Multi: true is required for the framework's @Inject(CONSUMER)
    // array-injection pattern.
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: CONSUMER_PROVIDERS,
    }),
  ],
})
export class AppModule {}
