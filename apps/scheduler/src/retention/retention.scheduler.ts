import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SchedulerPublisher } from '../scheduler/scheduler.publisher.js';
import { env } from '../config/env.js';

const MS_PER_DAY = 86_400_000;

@Injectable()
export class RetentionScheduler {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(private readonly publisher: SchedulerPublisher) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async auditRetention(): Promise<void> {
    if (env.RETENTION_AUDIT_DAYS === null) {
      this.logger.debug('Audit retention disabled (RETENTION_AUDIT_DAYS=null)');
      return;
    }
    const cutoff = new Date(Date.now() - env.RETENTION_AUDIT_DAYS * MS_PER_DAY);
    await this.publisher.emit({
      name: 'retention.audit',
      data: { cutoffDate: cutoff.toISOString() },
    });
  }

  @Cron('10 3 * * *')
  async analyticsRetention(): Promise<void> {
    if (env.RETENTION_ANALYTICS_DAYS === null) {
      this.logger.debug('Analytics retention disabled (RETENTION_ANALYTICS_DAYS=null)');
      return;
    }
    const cutoff = new Date(Date.now() - env.RETENTION_ANALYTICS_DAYS * MS_PER_DAY);
    await this.publisher.emit({
      name: 'retention.analytics',
      data: { cutoffDate: cutoff.toISOString() },
    });
  }

  @Cron('20 3 * * *')
  async activityFeedRetention(): Promise<void> {
    if (env.RETENTION_ACTIVITY_FEED_DAYS === null) {
      this.logger.debug('Activity feed retention disabled (RETENTION_ACTIVITY_FEED_DAYS=null)');
      return;
    }
    const cutoff = new Date(Date.now() - env.RETENTION_ACTIVITY_FEED_DAYS * MS_PER_DAY);
    await this.publisher.emit({
      name: 'retention.activity-feed',
      data: { cutoffDate: cutoff.toISOString() },
    });
  }

  @Cron('30 3 * * *')
  async consumerReceiptsRetention(): Promise<void> {
    if (env.RETENTION_CONSUMER_RECEIPTS_DAYS === null) {
      this.logger.debug('Consumer receipts retention disabled (RETENTION_CONSUMER_RECEIPTS_DAYS=null)');
      return;
    }
    const cutoff = new Date(Date.now() - env.RETENTION_CONSUMER_RECEIPTS_DAYS * MS_PER_DAY);
    await this.publisher.emit({
      name: 'retention.consumer-receipts',
      data: { cutoffDate: cutoff.toISOString() },
    });
  }
}
