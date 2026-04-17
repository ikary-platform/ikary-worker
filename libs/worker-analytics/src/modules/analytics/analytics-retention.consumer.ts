import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';

/**
 * Thin retention consumer — receives scheduler retention events and deletes
 * analytics buckets older than the specified cutoff date.
 *
 *   name       = 'worker-analytics-retention'
 *   eventTypes = '#.scheduler.retention.analytics'
 *   ordered    = false  — cross-aggregate sink; skip gap checks
 */
@Injectable()
export class AnalyticsRetentionConsumer implements IConsumer {
  readonly name = 'worker-analytics-retention';
  readonly eventTypes = '#.scheduler.retention.analytics';
  readonly ordered = false;

  constructor(private readonly repository: AnalyticsRepository) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const cutoffDate = new Date(event.data.cutoffDate as string);
    await this.repository.deleteOlderThan(cutoffDate, tx);
  }
}
