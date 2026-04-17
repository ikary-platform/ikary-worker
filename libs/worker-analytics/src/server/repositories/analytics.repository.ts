import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabaseService, type Queryable } from '@ikary/system-db-core';
import type { AnalyticsBucket } from '../../shared/analytics-bucket.schema.js';
import type { WorkerAnalyticsDatabaseSchema } from '../db/schema.js';
import { WORKER_ANALYTICS_DATABASE } from '../worker-analytics.tokens.js';

type DbService = DatabaseService<WorkerAnalyticsDatabaseSchema>;

/**
 * Owns all DB access for the hourly analytics-buckets table. The service
 * builds a bucket value object; the repository is a pure writer with a
 * single idempotent upsert primitive.
 */
@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(WORKER_ANALYTICS_DATABASE) private readonly dbService: DbService) {}

  /**
   * Upsert an hourly bucket:
   *   - first event in the hour → insert with event_count=1, failure_count=0|1
   *   - subsequent events in the same PK → increment counters
   *
   * The PK is (bucket_start, tenant_id, workspace_id, cell_id, event_name,
   * http_method, status_class). All nullable dimensions use '' sentinels
   * (see schema comment) so NULL-vs-NULL confusion never breaks idempotency.
   */
  async upsertBucket(
    bucket: AnalyticsBucket,
    client?: Queryable<WorkerAnalyticsDatabaseSchema>,
  ): Promise<void> {
    const qb = client ?? this.dbService.db;
    const failureIncrement = bucket.failureCount;

    await qb
      .insertInto('ikary_analytics_buckets_hourly')
      .values({
        bucket_start:      bucket.bucketStart,
        tenant_id:         bucket.tenantId,
        workspace_id:      bucket.workspaceId,
        cell_id:           bucket.cellId,
        event_name:        bucket.eventName,
        analytics_pattern: bucket.analyticsPattern,
        business_domain:   bucket.businessDomain,
        http_method:       bucket.httpMethod,
        status_class:      bucket.statusClass,
        event_count:       1,
        failure_count:     failureIncrement,
      })
      .onConflict((oc) =>
        oc
          .columns([
            'bucket_start',
            'tenant_id',
            'workspace_id',
            'cell_id',
            'event_name',
            'http_method',
            'status_class',
          ])
          .doUpdateSet({
            event_count:   sql`ikary_analytics_buckets_hourly.event_count + 1`,
            failure_count: sql`ikary_analytics_buckets_hourly.failure_count + ${failureIncrement}`,
            updated_at:    new Date(),
          }),
      )
      .execute();
  }

  /**
   * Delete every analytics bucket whose `bucket_start` is strictly older
   * than `olderThan`. Returns the number of rows deleted.
   *
   * Filtering uses `bucket_start` (the hour being tracked) rather than
   * `updated_at` (the last time the bucket was incremented) because a
   * long-running aggregate event should not reset the retention clock on
   * an old bucket.
   */
  async deleteOlderThan(olderThan: Date): Promise<number> {
    const result = await this.dbService.db
      .deleteFrom('ikary_analytics_buckets_hourly')
      .where('bucket_start', '<', olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
