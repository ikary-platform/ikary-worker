import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { HandlerTransaction } from '@ikary/worker-consumer';
import type { Queryable } from '@ikary/system-db-core';
import {
  type AnalyticsBucket,
  analyticsBucketSchema,
} from '../../shared/analytics-bucket.schema.js';
import { classifyAnalyticsEvent } from '../../shared/analytics-classifier.js';
import { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';
import type { WorkerAnalyticsDatabaseSchema } from '../../server/db/schema.js';

const FAILURE_STATUS_CLASSES = new Set(['4xx', '5xx']);

/**
 * Classifies each incoming event, computes its hourly bucket key, and
 * delegates the upsert to AnalyticsRepository.
 *
 * Failure semantics: a bucket's failure_count is incremented when the event
 * is a structural failure — either the event name ends in `.failed` OR the
 * derived statusClass is 4xx/5xx.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(AnalyticsRepository) private readonly repository: AnalyticsRepository) {}

  async record(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const bucket = this.buildBucket(event);
    await this.repository.upsertBucket(
      bucket,
      tx as Queryable<WorkerAnalyticsDatabaseSchema>,
    );
  }

  /**
   * Exposed for unit testing — the classification + bucketing + failure
   * detection is the lib's core logic and deserves direct coverage.
   */
  buildBucket(event: DomainEventEnvelope): AnalyticsBucket {
    const classified = classifyAnalyticsEvent({
      eventName:  event.event_name,
      entityType: event.entity.type,
      data:       event.data as Record<string, unknown>,
    });

    const isFailure =
      event.event_name.endsWith('.failed') ||
      (classified.statusClass !== null && FAILURE_STATUS_CLASSES.has(classified.statusClass));

    const bucket: AnalyticsBucket = {
      bucketStart:      startOfHourIso(event.timestamp),
      tenantId:         event.tenant_id,
      workspaceId:      event.workspace_id ?? '',
      cellId:           event.cell_id ?? '',
      eventName:        event.event_name,
      analyticsPattern: classified.analyticsPattern,
      businessDomain:   classified.businessDomain,
      httpMethod:       classified.httpMethod ?? '',
      statusClass:      classified.statusClass ?? '',
      eventCount:       1,
      failureCount:     isFailure ? 1 : 0,
    };

    // Validate before sending to the repo — catches drift in classifier
    // output shape before it corrupts aggregates.
    return analyticsBucketSchema.parse(bucket);
  }
}

/**
 * Truncate an ISO timestamp to the start of its UTC hour and return the
 * re-serialised ISO string. Exported (as internal) so tests can pin the
 * boundary without relying on Date behaviour.
 */
function startOfHourIso(iso: string): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}
