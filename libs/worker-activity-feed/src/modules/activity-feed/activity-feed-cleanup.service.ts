import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { WorkerActivityFeedConfig } from '../../config/worker-activity-feed.config.js';
import { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';
import { WORKER_ACTIVITY_FEED_CONFIG } from '../../server/worker-activity-feed.tokens.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup job that deletes activity rows older than
 * `config.retentionDays`. Fires at 03:30 server time — staggered from the
 * audit (03:10) and analytics (03:20) jobs so they don't all compete for
 * DB I/O at the same instant.
 *
 * When `retentionDays` is `null` the scheduled run still fires but
 * immediately returns `0`. The fixed registration keeps the scheduled-job
 * set auditable from Nest's SchedulerRegistry regardless of whether
 * cleanup is active in a given environment.
 */
@Injectable()
export class ActivityFeedCleanupService {
  private readonly logger = new Logger(ActivityFeedCleanupService.name);

  constructor(
    @Inject(WORKER_ACTIVITY_FEED_CONFIG) private readonly config: WorkerActivityFeedConfig,
    private readonly repository: ActivityFeedRepository,
  ) {}

  @Cron('30 3 * * *', { name: 'ikary-worker-activity-feed-cleanup' })
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
          `Activity-feed cleanup: deleted ${deleted} row(s) older than ${cutoff.toISOString()}`,
        );
      }
      return deleted;
    } catch (err) {
      this.logger.error(
        `Activity-feed cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }
}
