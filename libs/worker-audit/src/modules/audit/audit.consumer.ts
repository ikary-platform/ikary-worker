import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { AuditService } from './audit.service.js';

/**
 * Thin consumer — parses no data, holds no logic. Every incoming event is
 * handed to AuditService.record which builds the row and delegates to the
 * repository.
 *
 *   name       = 'worker-audit'      → queue is ikary.worker-audit
 *   eventTypes = '#'                 → catch-all (audit records everything)
 *   ordered    = false               → cross-aggregate sink; skip gap checks
 */
@Injectable()
export class AuditConsumer implements IConsumer {
  readonly name = 'worker-audit';
  readonly eventTypes = '#';
  readonly ordered = false;

  constructor(@Inject(AuditService) private readonly service: AuditService) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    await this.service.record(event, tx);
  }
}
