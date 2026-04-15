import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxRepository } from '@ikary/cell-runtime-core';
import { OutboxProcessorService } from './outbox-processor.service.js';
import { env } from '../config/env.js';

/**
 * Polls the domain_event_outbox table on a fixed interval and dispatches each
 * unprocessed row. A mutex flag prevents overlapping runs — if a poll cycle
 * is still in progress when the next tick fires, the tick is skipped.
 */
@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);
  private isRunning = false;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly processor: OutboxProcessorService,
  ) {}

  @Interval(env.OUTBOX_POLL_INTERVAL_MS)
  async poll(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const rows = await this.outbox.listUnprocessed(env.OUTBOX_BATCH_SIZE);
      if (rows.length === 0) return;

      this.logger.debug(`Processing ${rows.length} outbox event(s)`);

      for (const row of rows) {
        try {
          await this.processor.dispatch(row);
          await this.outbox.markProcessed(row.id);
        } catch (err) {
          this.logger.error(
            `Failed to dispatch event ${row.id}: ${(err as Error).message}`,
          );
          await this.outbox.markFailed(row.id);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
