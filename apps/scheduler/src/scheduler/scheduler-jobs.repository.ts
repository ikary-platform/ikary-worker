import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@ikary/system-db-core';
import type { SchedulerDatabase } from '../db/schema.js';

type DbService = DatabaseService<SchedulerDatabase>;

export interface UpsertPendingInput {
  id:          string;
  jobName:     string;
  tenantId:    string;
  workspaceId: string;
  cellId:      string;
  entityKey:   string | null;
  entityId:    string | null;
  eventId:     string;
  eventData:   Record<string, unknown>;
  scheduledAt: Date;
}

@Injectable()
export class SchedulerJobsRepository {
  constructor(private readonly dbService: DbService) {}

  async upsertPending(input: UpsertPendingInput): Promise<void> {
    await this.dbService.db
      .insertInto('ikary_scheduler_jobs')
      .values({
        id:           input.id,
        job_name:     input.jobName,
        tenant_id:    input.tenantId,
        workspace_id: input.workspaceId,
        cell_id:      input.cellId,
        entity_key:   input.entityKey,
        entity_id:    input.entityId,
        status:       'pending',
        event_id:     input.eventId,
        event_data:   input.eventData,
        scheduled_at: input.scheduledAt,
        emitted_at:   null,
        failed_at:    null,
        error_message: null,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          status:        'pending',
          event_data:    input.eventData,
          scheduled_at:  input.scheduledAt,
          emitted_at:    null,
          failed_at:     null,
          error_message: null,
        }),
      )
      .execute();
  }

  async markEmitted(id: string): Promise<void> {
    await this.dbService.db
      .updateTable('ikary_scheduler_jobs')
      .set({ status: 'emitted', emitted_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.dbService.db
      .updateTable('ikary_scheduler_jobs')
      .set({ status: 'failed', failed_at: new Date(), error_message: errorMessage })
      .where('id', '=', id)
      .execute();
  }
}
