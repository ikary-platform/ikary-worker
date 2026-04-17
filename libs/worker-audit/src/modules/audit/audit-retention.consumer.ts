import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { AuditRepository } from '../../server/repositories/audit.repository.js';

/**
 * Thin retention consumer — receives scheduler retention events and deletes
 * audit entries older than the specified cutoff date.
 *
 *   name       = 'worker-audit-retention'
 *   eventTypes = '#.scheduler.retention.audit'
 *   ordered    = false  — cross-aggregate sink; skip gap checks
 */
@Injectable()
export class AuditRetentionConsumer implements IConsumer {
  readonly name = 'worker-audit-retention';
  readonly eventTypes = '#.scheduler.retention.audit';
  readonly ordered = false;

  constructor(private readonly repository: AuditRepository) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const cutoffDate = new Date(event.data.cutoffDate as string);
    await this.repository.deleteOlderThan(cutoffDate, tx);
  }
}
