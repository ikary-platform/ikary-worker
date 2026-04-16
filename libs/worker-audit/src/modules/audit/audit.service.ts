import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { HandlerTransaction } from '@ikary/worker-consumer';
import { type AuditEntry, auditEntrySchema } from '../../shared/audit-entry.schema.js';
import { AuditRepository } from '../../server/repositories/audit.repository.js';
import type { WorkerAuditDatabaseSchema } from '../../server/db/schema.js';
import type { Queryable } from '@ikary/system-db-core';

/**
 * Business logic for turning a DomainEventEnvelope into an AuditEntry row.
 * The only non-mapping logic is change-kind inference:
 *   `previous` non-empty  → diff  ({from: previous, to: data})
 *   `previous` empty      → snapshot (data)
 *
 * All DB access is delegated to AuditRepository.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(AuditRepository) private readonly repository: AuditRepository) {}

  async record(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const entry = this.buildEntry(event);
    await this.repository.insertIfNotExists(
      entry,
      tx as Queryable<WorkerAuditDatabaseSchema>,
    );
  }

  /**
   * Exposed for unit testing — the mapping is non-trivial enough (change-kind
   * inference, diff/snapshot shape) to warrant direct coverage of the pure
   * transform independent of DB mocking.
   */
  buildEntry(event: DomainEventEnvelope): AuditEntry {
    // DomainEventEnvelopeSchema requires `previous` (empty object for creates,
    // populated object for updates). No nullable-coalesce needed.
    const previous = event.previous as Record<string, unknown>;
    const isDiff = Object.keys(previous).length > 0;

    const entry: AuditEntry = {
      eventId:          event.event_id,
      eventName:        event.event_name,
      eventVersion:     event.version,
      occurredAt:       event.timestamp,
      tenantId:         event.tenant_id,
      workspaceId:      event.workspace_id,
      cellId:           event.cell_id,
      actorId:          event.actor.id,
      actorType:        event.actor.type,
      resourceType:     event.entity.type,
      resourceId:       event.entity.id,
      resourceVersion:  event.version,
      changeKind:       isDiff ? 'diff' : 'snapshot',
      diff:             isDiff ? { from: previous, to: event.data } : null,
      snapshot:         isDiff ? null : event.data,
      metadata:         event.metadata,
      redactionApplied: false,
    };

    // Validate the boundary shape — catches envelope producers that drift
    // from the documented contract before we write bad data to the audit
    // trail (the canonical record we must not lose).
    return auditEntrySchema.parse(entry);
  }
}
