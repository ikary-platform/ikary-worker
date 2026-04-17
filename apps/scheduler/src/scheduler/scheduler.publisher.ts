import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AmqpPublisherService } from '@ikary/system-amqp/server';
import { buildRoutingKey } from '@ikary/system-amqp';
import { SchedulerJobsRepository } from './scheduler-jobs.repository.js';

export interface EmitInput {
  name: string;
  data: Record<string, unknown>;
  scope?: {
    tenantId?: string;
    workspaceId?: string;
    cellId?: string;
    entityKey?: string;
    entityId?: string;
  };
}

@Injectable()
export class SchedulerPublisher {
  private readonly logger = new Logger(SchedulerPublisher.name);

  constructor(
    private readonly publisher: AmqpPublisherService,
    private readonly jobs: SchedulerJobsRepository,
  ) {}

  async emit(input: EmitInput): Promise<void> {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    const tenantId    = input.scope?.tenantId    ?? '_scheduler';
    const workspaceId = input.scope?.workspaceId ?? '_scheduler';
    const cellId      = input.scope?.cellId      ?? '_scheduler';
    const entityKey   = input.scope?.entityKey   ?? null;
    const entityId    = input.scope?.entityId    ?? null;

    // Build scope suffix from all non-sentinel scope segments so that
    // two jobs with the same name on the same day but different scopes
    // produce distinct event_ids (prevents receipt dedup collisions).
    const scopeParts = [tenantId, workspaceId, cellId, entityKey, entityId]
      .filter((v) => v !== null && v !== '_scheduler');
    const scopeSuffix = scopeParts.length > 0 ? `-${scopeParts.join('-')}` : '';
    const eventId = `scheduler-${input.name}${scopeSuffix}-${dateKey}`;

    await this.jobs.upsertPending({
      id:          eventId,
      jobName:     input.name,
      tenantId,
      workspaceId,
      cellId,
      entityKey,
      entityId,
      eventId,
      eventData:   input.data,
      scheduledAt: now,
    });

    const envelope: DomainEventEnvelope = {
      event_id:     eventId,
      event_name:   `scheduler.${input.name}`,
      version:      1,
      timestamp:    now.toISOString(),
      tenant_id:    tenantId,
      workspace_id: workspaceId,
      cell_id:      cellId,
      actor:        { type: 'system', id: 'scheduler' },
      entity:       { type: entityKey ?? 'scheduler', id: entityId ?? input.name },
      data:         input.data,
      previous:     {},
      metadata:     {},
    };

    try {
      const routingKey = buildRoutingKey({
        eventName:   envelope.event_name,
        tenantId:    envelope.tenant_id,
        workspaceId: envelope.workspace_id,
        cellId:      envelope.cell_id,
      });

      const body = Buffer.from(JSON.stringify(envelope));
      this.publisher.publishToExchange(routingKey, body, {
        persistent:  true,
        contentType: 'application/json',
        headers: {
          'x-event-id':         envelope.event_id,
          'x-event-version':    envelope.version,
          'x-tenant-id':        tenantId,
          'x-workspace-id':     workspaceId,
          'x-cell-id':          cellId,
          'x-scheduler-origin': 'true',
        },
      });

      await this.jobs.markEmitted(eventId);
      this.logger.log(`Emitted scheduler.${input.name} → ${routingKey}`);
    } catch (err) {
      await this.jobs.markFailed(eventId, (err as Error).message);
      this.logger.error(`Failed to emit scheduler.${input.name}: ${(err as Error).message}`);
      throw err;
    }
  }
}
