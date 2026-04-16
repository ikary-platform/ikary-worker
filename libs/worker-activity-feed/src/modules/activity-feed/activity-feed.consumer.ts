import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { ActivityFeedService } from './activity-feed.service.js';

/**
 * Thin consumer — all envelope-to-row logic is in ActivityFeedService.
 *
 *   name       = 'worker-activity-feed'  → queue is ikary.worker-activity-feed
 *   eventTypes = '#'                      → catch-all; UIs filter at query time
 *   ordered    = false                    → cross-aggregate sink
 */
@Injectable()
export class ActivityFeedConsumer implements IConsumer {
  readonly name = 'worker-activity-feed';
  readonly eventTypes = '#';
  readonly ordered = false;

  constructor(
    @Inject(ActivityFeedService) private readonly service: ActivityFeedService,
  ) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    await this.service.record(event, tx);
  }
}
