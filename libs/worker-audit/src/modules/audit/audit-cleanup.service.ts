import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { WorkerAuditConfig } from '../../config/worker-audit.config.js';
import { AuditRepository } from '../../server/repositories/audit.repository.js';
import { WORKER_AUDIT_CONFIG } from '../../server/worker-audit.tokens.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup job that deletes audit rows older than
 * `config.retentionDays`. The cadence is fixed at 03:10 server time — far
 * enough from midnight that end-of-day reconciliation jobs have already
 * run, and offset from the other projection cleanup jobs so they don't
 * all hammer the DB at once.
 *
 * When `retentionDays` is `null` the scheduled run still fires but
 * immediately returns `0`. The fixed registration keeps the scheduled-job
 * set auditable from Nest's SchedulerRegistry regardless of whether
 * cleanup is active in a given environment.
 *
 * Filtering uses `occurred_at` (event time) rather than `recorded_at`
 * (projection write time) so that backfilled rows — events an
 * out-of-queue worker catches up on after downtime — are not deleted
 * before a human would reasonably expect them to be.
 */
@Injectable()
export class AuditCleanupService {
  private readonly logger = new Logger(AuditCleanupService.name);

  constructor(
    @Inject(WORKER_AUDIT_CONFIG) private readonly config: WorkerAuditConfig,
    private readonly repository: AuditRepository,
  ) {}

  @Cron('10 3 * * *', { name: 'ikary-worker-audit-cleanup' })
  handleScheduledCleanup(): void {
    void this.runCleanup();
  }

  /**
   * Public so tests (and ops tooling) can trigger an out-of-band sweep
   * without waiting for the next cron fire. Safe to call concurrently
   * with the scheduled run — both hit the same `DELETE ... WHERE` and
   * Postgres serialises row-level locks.
   */
  async runCleanup(): Promise<number> {
    if (this.config.retentionDays === null) return 0;

    const cutoff = new Date(Date.now() - this.config.retentionDays * MS_PER_DAY);

    try {
      const deleted = await this.repository.deleteOlderThan(cutoff);
      if (deleted > 0) {
        this.logger.log(
          `Audit cleanup: deleted ${deleted} row(s) older than ${cutoff.toISOString()}`,
        );
      }
      return deleted;
    } catch (err) {
      // Cleanup failure is operational noise, not a reason to crash the
      // pod. Log and return 0 so the next cron fire tries again.
      this.logger.error(
        `Audit cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }
}
