import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { ConsumerReceiptsRepository } from '../../server/consumer-receipts.repository.js';

/**
 * Thin retention consumer — receives scheduler retention events and deletes
 * consumer receipts older than the specified cutoff date.
 *
 *   name       = 'worker-consumer-receipt-retention'
 *   eventTypes = '#.scheduler.retention.consumer-receipts'
 *   ordered    = false  — cross-aggregate sink; skip gap checks
 */
@Injectable()
export class ReceiptRetentionConsumer implements IConsumer {
  readonly name = 'worker-consumer-receipt-retention';
  readonly eventTypes = '#.scheduler.retention.consumer-receipts';
  readonly ordered = false;

  constructor(private readonly repository: ConsumerReceiptsRepository) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const cutoffDate = new Date(event.data.cutoffDate as string);
    await this.repository.deleteOlderThan(cutoffDate, tx);
  }
}
