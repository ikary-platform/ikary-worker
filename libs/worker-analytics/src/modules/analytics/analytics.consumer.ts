import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IConsumer, HandlerTransaction } from '@ikary/worker-consumer';
import { AnalyticsService } from './analytics.service.js';

/**
 * Thin consumer — classification + bucket upsert is in AnalyticsService.
 *
 *   name       = 'worker-analytics'  → queue is ikary.worker-analytics
 *   eventTypes = '#'                  → catch-all (we classify internally)
 *   ordered    = false                → cross-aggregate aggregator
 */
@Injectable()
export class AnalyticsConsumer implements IConsumer {
  readonly name = 'worker-analytics';
  readonly eventTypes = '#';
  readonly ordered = false;

  constructor(@Inject(AnalyticsService) private readonly service: AnalyticsService) {}

  async handle(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    await this.service.record(event, tx);
  }
}
