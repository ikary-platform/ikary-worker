import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { AuditEntry } from '../../shared/audit-entry.schema.js';
import type { WorkerAuditDatabaseSchema } from '../db/schema.js';
import { WORKER_AUDIT_DATABASE } from '../worker-audit.tokens.js';

type DbService = DatabaseService<WorkerAuditDatabaseSchema>;

/**
 * Owns all DB access for the audit table. Thin wrapper over Kysely that
 * exposes a single idempotent insert primitive — the service does the
 * envelope-to-row mapping; the repository just writes.
 */
@Injectable()
export class AuditRepository {
  constructor(@Inject(WORKER_AUDIT_DATABASE) private readonly dbService: DbService) {}

  /**
   * Insert one audit entry, silently skipping duplicates by `event_id` (the
   * primary key). Idempotent under at-least-once broker delivery and under
   * republish-to-self retry loops.
   *
   * Pass `client` when running inside a transaction so the insert rides on
   * the same tx as the framework's receipt/offset writes.
   */
  async insertIfNotExists(
    entry: AuditEntry,
    client?: Queryable<WorkerAuditDatabaseSchema>,
  ): Promise<void> {
    const qb = client ?? this.dbService.db;
    await qb
      .insertInto('ikary_audit_entries')
      .values({
        event_id:          entry.eventId,
        event_name:        entry.eventName,
        event_version:     entry.eventVersion,
        occurred_at:       entry.occurredAt,
        tenant_id:         entry.tenantId,
        workspace_id:      entry.workspaceId,
        cell_id:           entry.cellId,
        actor_id:          entry.actorId,
        actor_type:        entry.actorType,
        resource_type:     entry.resourceType,
        resource_id:       entry.resourceId,
        resource_version:  entry.resourceVersion,
        change_kind:       entry.changeKind,
        diff:              entry.diff ?? null,
        snapshot:          entry.snapshot ?? null,
        metadata:          entry.metadata,
        redaction_applied: entry.redactionApplied,
      })
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }

  /**
   * Delete every audit row whose `occurred_at` is strictly older than
   * `olderThan`. Returns the number of rows deleted (driven from
   * `numDeletedRows` in Kysely's ExecuteResult).
   *
   * Callers pass a precomputed cutoff rather than a retention window so the
   * service owns clock semantics and can be tested without mocking `Date`.
   */
  async deleteOlderThan(olderThan: Date): Promise<number> {
    const result = await this.dbService.db
      .deleteFrom('ikary_audit_entries')
      .where('occurred_at', '<', olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
