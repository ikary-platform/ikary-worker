import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { WorkerAnalyticsConfig } from '../../config/worker-analytics.config.js';
import { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';
import { WORKER_ANALYTICS_CONFIG } from '../../server/worker-analytics.tokens.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup job that deletes analytics buckets older than
 * `config.retentionDays`. Fires at 03:20 server time — staggered from the
 * audit (03:10) and activity-feed (03:30) jobs so they don't all compete
 * for DB I/O at the same instant.
 *
 * When `retentionDays` is `null` the scheduled run still fires but
 * immediately returns `0`. The fixed registration keeps the scheduled-job
 * set auditable from Nest's SchedulerRegistry regardless of whether
 * cleanup is active in a given environment.
 */
@Injectable()
export class AnalyticsCleanupService {
  private readonly logger = new Logger(AnalyticsCleanupService.name);

  constructor(
    @Inject(WORKER_ANALYTICS_CONFIG) private readonly config: WorkerAnalyticsConfig,
    private readonly repository: AnalyticsRepository,
  ) {}

  @Cron('20 3 * * *', { name: 'ikary-worker-analytics-cleanup' })
  handleScheduledCleanup(): void {
    void this.runCleanup();
  }

  async runCleanup(): Promise<number> {
    if (this.config.retentionDays === null) return 0;

    const cutoff = new Date(Date.now() - this.config.retentionDays * MS_PER_DAY);

    try {
      const deleted = await this.repository.deleteOlderThan(cutoff);
      if (deleted > 0) {
        this.logger.log(
          `Analytics cleanup: deleted ${deleted} bucket(s) older than ${cutoff.toISOString()}`,
        );
      }
      return deleted;
    } catch (err) {
      this.logger.error(
        `Analytics cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }
}
