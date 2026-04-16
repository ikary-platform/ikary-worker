import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseService, Queryable } from '@ikary/system-db-core';
import type { ConsumerDatabaseSchema } from './consumer.database.js';
import { CONSUMER_DATABASE } from './consumer.tokens.js';

type DbService = DatabaseService<ConsumerDatabaseSchema>;

/**
 * Per-(consumer, tenant, aggregate) version cursor.
 *
 * getLastVersion() returns null when no offset has been recorded yet —
 * the first event for an aggregate always proceeds without a gap check.
 *
 * upsert() is atomic-with-transaction: pass the tx from the runner so the
 * advance happens in the same transaction as the receipt insert and the
 * handler's own DB writes.
 */
@Injectable()
export class ConsumerOffsetsRepository {
  constructor(@Inject(CONSUMER_DATABASE) private readonly dbService: DbService) {}

  async getLastVersion(
    consumerName: string,
    tenantId: string,
    aggregateKey: string,
  ): Promise<number | null> {
    const row = await this.dbService.db
      .selectFrom('ikary_event_consumer_offsets')
      .select('last_version')
      .where('consumer_name', '=', consumerName)
      .where('tenant_id', '=', tenantId)
      .where('aggregate_key', '=', aggregateKey)
      .executeTakeFirst();
    return row?.last_version ?? null;
  }

  async upsert(
    consumerName: string,
    tenantId: string,
    aggregateKey: string,
    version: number,
    client?: Queryable<ConsumerDatabaseSchema>,
  ): Promise<void> {
    const qb = client ?? this.dbService.db;
    await qb
      .insertInto('ikary_event_consumer_offsets')
      .values({
        consumer_name: consumerName,
        tenant_id:     tenantId,
        aggregate_key: aggregateKey,
        last_version:  version,
        updated_at:    new Date(),
      })
      .onConflict((oc) =>
        oc.columns(['consumer_name', 'tenant_id', 'aggregate_key']).doUpdateSet({
          last_version: version,
          updated_at:   new Date(),
        }),
      )
      .execute();
  }
}
