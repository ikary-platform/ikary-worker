import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { ConsumerDatabaseSchema } from '../db/schema.js';
import { CONSUMER_DATABASE } from '../consumer.tokens.js';

type DbService = DatabaseService<ConsumerDatabaseSchema>;

/**
 * Idempotency records — one row per (consumer, event_id) pair.
 * UNIQUE constraint on the primary key is what actually guarantees
 * exactly-once per consumer; the exists() check is an optimisation to
 * skip the handler work for duplicates without provoking a constraint
 * violation inside a transaction.
 */
@Injectable()
export class ConsumerReceiptsRepository {
  constructor(@Inject(CONSUMER_DATABASE) private readonly dbService: DbService) {}

  async exists(consumerName: string, eventId: string): Promise<boolean> {
    const row = await this.dbService.db
      .selectFrom('ikary_event_consumer_receipts')
      .select('event_id')
      .where('consumer_name', '=', consumerName)
      .where('event_id', '=', eventId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async insert(
    consumerName: string,
    eventId: string,
    client?: Queryable<ConsumerDatabaseSchema>,
  ): Promise<void> {
    const qb = client ?? this.dbService.db;
    await qb
      .insertInto('ikary_event_consumer_receipts')
      .values({
        consumer_name: consumerName,
        event_id:      eventId,
      })
      .execute();
  }

  /**
   * Delete receipts whose `received_at` is strictly older than
   * `olderThan`. Returns the number of rows deleted. Uses the dedicated
   * `ikary_event_consumer_receipts_received_at_idx` index on this column
   * so the sweep avoids a full table scan.
   *
   * `olderThan` MUST be earlier than the broker's longest possible
   * redelivery/replay window. Deleting a receipt that still references a
   * redeliverable message would let that message slip through idempotency
   * and re-run the handler's side effects.
   */
  async deleteOlderThan(olderThan: Date): Promise<number> {
    const result = await this.dbService.db
      .deleteFrom('ikary_event_consumer_receipts')
      .where('received_at', '<', olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
