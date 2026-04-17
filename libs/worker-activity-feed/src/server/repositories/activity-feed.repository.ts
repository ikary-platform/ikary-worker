import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { ActivityEntry } from '../../shared/activity-entry.schema.js';
import type { WorkerActivityFeedDatabaseSchema } from '../db/schema.js';
import { WORKER_ACTIVITY_FEED_DATABASE } from '../worker-activity-feed.tokens.js';

type DbService = DatabaseService<WorkerActivityFeedDatabaseSchema>;

/**
 * All DB access for the user-facing activity feed. Idempotent on event_id.
 */
@Injectable()
export class ActivityFeedRepository {
  constructor(
    @Inject(WORKER_ACTIVITY_FEED_DATABASE) private readonly dbService: DbService,
  ) {}

  /**
   * Delete activity entries older than the given date. Returns the count of
   * deleted rows. Pass `client` to run inside a consumer transaction.
   */
  async deleteOlderThan(
    olderThan: Date,
    client?: Queryable<WorkerActivityFeedDatabaseSchema>,
  ): Promise<number> {
    const qb = client ?? this.dbService.db;
    const result = await qb
      .deleteFrom('ikary_activity_entries')
      .where('occurred_at', '<', olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }

  async insertIfNotExists(
    entry: ActivityEntry,
    client?: Queryable<WorkerActivityFeedDatabaseSchema>,
  ): Promise<void> {
    const qb = client ?? this.dbService.db;
    await qb
      .insertInto('ikary_activity_entries')
      .values({
        event_id:      entry.eventId,
        event_name:    entry.eventName,
        tenant_id:     entry.tenantId,
        workspace_id:  entry.workspaceId,
        cell_id:       entry.cellId,
        actor_id:      entry.actorId,
        actor_type:    entry.actorType,
        resource_type: entry.resourceType,
        resource_id:   entry.resourceId,
        title:         entry.title,
        summary:       entry.summary,
        payload:       entry.payload,
        occurred_at:   entry.occurredAt,
      })
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }
}
