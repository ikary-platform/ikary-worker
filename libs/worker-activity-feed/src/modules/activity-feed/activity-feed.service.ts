import { Inject, Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { HandlerTransaction } from '@ikary/worker-consumer';
import type { Queryable } from '@ikary/system-db-core';
import { type ActivityEntry, activityEntrySchema } from '../../shared/activity-entry.schema.js';
import { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';
import type { WorkerActivityFeedDatabaseSchema } from '../../server/db/schema.js';

/** Max length of the `summary` column — balances feed readability with row cost. */
export const ACTIVITY_FEED_SUMMARY_MAX_LENGTH = 240;

/**
 * Builds a feed row from a DomainEventEnvelope and delegates the write to
 * ActivityFeedRepository.
 *
 * Title: the raw `event_name` (e.g. `invoice.created`, `workspace.cell.created`).
 * Summary: `JSON.stringify(event.data)` truncated to 240 chars; `null` when
 *          `data` is an empty object.
 */
@Injectable()
export class ActivityFeedService {
  constructor(
    @Inject(ActivityFeedRepository) private readonly repository: ActivityFeedRepository,
  ) {}

  async record(event: DomainEventEnvelope, tx: HandlerTransaction): Promise<void> {
    const entry = this.buildEntry(event);
    await this.repository.insertIfNotExists(
      entry,
      tx as Queryable<WorkerActivityFeedDatabaseSchema>,
    );
  }

  /**
   * Pure transform from envelope to feed entry. Exposed for unit tests.
   */
  buildEntry(event: DomainEventEnvelope): ActivityEntry {
    const entry: ActivityEntry = {
      eventId:      event.event_id,
      eventName:    event.event_name,
      tenantId:     event.tenant_id,
      workspaceId:  event.workspace_id,
      cellId:       event.cell_id,
      actorId:      event.actor.id,
      actorType:    event.actor.type,
      resourceType: event.entity.type,
      resourceId:   event.entity.id,
      title:        event.event_name,
      summary:      buildSummary(event.data as Record<string, unknown>),
      payload:      event.data as Record<string, unknown>,
      occurredAt:   event.timestamp,
    };
    return activityEntrySchema.parse(entry);
  }
}

function buildSummary(data: Record<string, unknown>): string | null {
  if (Object.keys(data).length === 0) return null;
  const json = JSON.stringify(data);
  return json.length <= ACTIVITY_FEED_SUMMARY_MAX_LENGTH
    ? json
    : json.slice(0, ACTIVITY_FEED_SUMMARY_MAX_LENGTH);
}
