import type { ColumnType, Generated } from '@ikary/system-db-core';

/**
 * Kysely schema types for the two tables owned by this package.
 * Use ConsumerDatabaseSchema as a Kysely generic parameter when injecting
 * a DatabaseService into repositories.
 */

export interface ConsumerReceiptsTable {
  consumer_name: string;
  event_id: string;
  received_at: Generated<Date>;
}

export interface ConsumerOffsetsTable {
  consumer_name: string;
  tenant_id: string;
  aggregate_key: string;
  last_version: number;
  updated_at: ColumnType<Date, Date | undefined, Date>;
}

export interface ConsumerDatabaseSchema {
  ikary_event_consumer_receipts: ConsumerReceiptsTable;
  ikary_event_consumer_offsets: ConsumerOffsetsTable;
}
