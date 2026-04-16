import type { ColumnType, Generated } from '@ikary/system-db-core';

export interface WorkerActivityEntriesTable {
  event_id:      string;
  event_name:    string;
  tenant_id:     string;
  workspace_id:  string | null;
  cell_id:       string | null;
  actor_id:      string | null;
  actor_type:    string;
  resource_type: string;
  resource_id:   string;
  title:         string;
  summary:       string | null;
  payload:       ColumnType<unknown, unknown, unknown>;
  occurred_at:   ColumnType<Date, Date | string, never>;
  recorded_at:   Generated<Date>;
}

export interface WorkerActivityFeedDatabaseSchema {
  ikary_activity_entries: WorkerActivityEntriesTable;
}
