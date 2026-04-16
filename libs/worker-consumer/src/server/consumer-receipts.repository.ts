import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { ConsumerDatabaseSchema } from './consumer.database.js';
import { CONSUMER_DATABASE } from './consumer.tokens.js';

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
}
