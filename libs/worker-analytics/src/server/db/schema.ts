import type { ColumnType, Generated } from '@ikary/system-db-core';

/**
 * Kysely table type for `ikary_analytics_buckets_hourly` — owned by this lib.
 *
 * Downstream apps spread `WorkerAnalyticsDatabaseSchema` into their own
 * database type:
 *
 *   type AppDatabase = ConsumerDatabaseSchema & WorkerAnalyticsDatabaseSchema & …
 */
export interface WorkerAnalyticsBucketsTable {
  bucket_start:      ColumnType<Date, Date | string, Date | string>;
  tenant_id:         string;
  workspace_id:      ColumnType<string, string | undefined, string>;  // '' sentinel via default
  cell_id:           ColumnType<string, string | undefined, string>;
  event_name:        string;
  analytics_pattern: string;
  business_domain:   string;
  http_method:       ColumnType<string, string | undefined, string>;
  status_class:      ColumnType<string, string | undefined, string>;
  event_count:       ColumnType<number, number | undefined, number>;
  failure_count:     ColumnType<number, number | undefined, number>;
  updated_at:        Generated<Date>;
}

export interface WorkerAnalyticsDatabaseSchema {
  ikary_analytics_buckets_hourly: WorkerAnalyticsBucketsTable;
}
