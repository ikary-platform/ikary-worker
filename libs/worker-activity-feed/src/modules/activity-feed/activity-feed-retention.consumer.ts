import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';

/**
 * Thin retention consumer — receives scheduler retention events and deletes
 * activity entries older than the specified cutoff date.
 *
 *   name       = 'worker-activity-feed-retention'
 *   eventTypes = '#.scheduler.retention.activity-feed'
 *   ordered    = false  — cross-aggregate sink; skip gap checks
 */
@Injectable()
export class ActivityFeedRetentionConsumer implements IConsumer {
  readonly name = 'worker-activity-feed-retention';
  readonly eventTypes = '#.scheduler.retention.activity-feed';
  readonly ordered = false;

  constructor(private readonly repository: ActivityFeedRepository) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const cutoffDate = new Date(event.data.cutoffDate as string);
    await this.repository.deleteOlderThan(cutoffDate, tx);
  }
}
