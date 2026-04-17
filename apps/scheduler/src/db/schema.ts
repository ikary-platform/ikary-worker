import type { ColumnType, Generated } from '@ikary/system-db-core';

export interface SchedulerJobsTable {
  id:            string;
  job_name:      string;
  tenant_id:     string;
  workspace_id:  string;
  cell_id:       string;
  entity_key:    string | null;
  entity_id:     string | null;
  status:        'pending' | 'emitted' | 'failed';
  event_id:      string;
  event_data:    ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  scheduled_at:  ColumnType<Date, Date | string, Date | string>;
  emitted_at:    ColumnType<Date, Date | string | null, Date | string | null>;
  failed_at:     ColumnType<Date, Date | string | null, Date | string | null>;
  error_message: string | null;
  created_at:    Generated<Date>;
}

export interface SchedulerDatabase {
  ikary_scheduler_jobs: SchedulerJobsTable;
}
