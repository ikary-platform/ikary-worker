import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { ConsumerOptions } from '../shared/consumer-options.schema.js';
import { CONSUMER_OPTIONS } from './consumer.tokens.js';
import { ConsumerReceiptsRepository } from './consumer-receipts.repository.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup job that deletes idempotency receipts older than
 * `ConsumerOptions.receiptRetentionDays`. Fires at 04:00 server time —
 * after the projection cleanup jobs (03:10–03:30) so that every layer
 * has finished its sweep before consumer-level garbage collection runs.
 *
 * When `receiptRetentionDays` is `null` the scheduled run still fires
 * but immediately returns `0`. The fixed registration keeps the
 * scheduled-job set auditable from Nest's SchedulerRegistry regardless
 * of whether cleanup is active in a given environment.
 *
 * The offsets table (`ikary_event_consumer_offsets`) is deliberately
 * NOT cleaned up: the gap-detection semantics depend on the last_version
 * row persisting for the lifetime of the aggregate, and a dormant
 * aggregate may reactivate at any time. Deleting offsets would reset
 * gap detection for that aggregate.
 */
@Injectable()
export class ConsumerCleanupService {
  private readonly logger = new Logger(ConsumerCleanupService.name);

  constructor(
    @Inject(CONSUMER_OPTIONS) private readonly options: ConsumerOptions,
    private readonly receipts: ConsumerReceiptsRepository,
  ) {}

  @Cron('0 4 * * *', { name: 'ikary-worker-consumer-receipts-cleanup' })
  handleScheduledCleanup(): void {
    void this.runCleanup();
  }

  async runCleanup(): Promise<number> {
    if (this.options.receiptRetentionDays === null) return 0;

    const cutoff = new Date(Date.now() - this.options.receiptRetentionDays * MS_PER_DAY);

    try {
      const deleted = await this.receipts.deleteOlderThan(cutoff);
      if (deleted > 0) {
        this.logger.log(
          `Consumer receipts cleanup: deleted ${deleted} row(s) older than ${cutoff.toISOString()}`,
        );
      }
      return deleted;
    } catch (err) {
      this.logger.error(
        `Consumer receipts cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }
}
