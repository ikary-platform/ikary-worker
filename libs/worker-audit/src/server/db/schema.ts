import type { ColumnType, Generated } from '@ikary/system-db-core';

/**
 * Kysely table type for `ikary_audit_entries` — owned by this lib.
 *
 * Downstream apps must spread `WorkerAuditDatabaseSchema` into their own
 * database type so the framework's repository can type-check its queries:
 *
 *   type AppDatabase = ConsumerDatabaseSchema & WorkerAuditDatabaseSchema & …
 */
export interface WorkerAuditEntriesTable {
  event_id:           string;
  event_name:         string;
  event_version:      number;
  occurred_at:        ColumnType<Date, Date | string, never>;
  tenant_id:          string;
  workspace_id:       string | null;
  cell_id:            string | null;
  actor_id:           string | null;
  actor_type:         string;
  resource_type:      string;
  resource_id:        string;
  resource_version:   number;
  change_kind:        'diff' | 'snapshot';
  diff:               unknown;
  snapshot:           unknown;
  metadata:           ColumnType<unknown, unknown, unknown>;
  redaction_applied:  ColumnType<boolean, boolean | undefined, boolean>;
  recorded_at:        Generated<Date>;
}

export interface WorkerAuditDatabaseSchema {
  ikary_audit_entries: WorkerAuditEntriesTable;
}
