import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerPublisher } from './scheduler.publisher.js';

function makePublisher() {
  return { publishToExchange: vi.fn() };
}

function makeJobs() {
  return {
    upsertPending: vi.fn().mockResolvedValue(undefined),
    markEmitted:   vi.fn().mockResolvedValue(undefined),
    markFailed:    vi.fn().mockResolvedValue(undefined),
  };
}

describe('SchedulerPublisher', () => {
  let amqp: ReturnType<typeof makePublisher>;
  let jobs: ReturnType<typeof makeJobs>;
  let publisher: SchedulerPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T03:00:00.000Z'));
    amqp = makePublisher();
    jobs = makeJobs();
    publisher = new SchedulerPublisher(amqp as never, jobs as never);
  });

  it('builds a deterministic event_id from name and date', async () => {
    await publisher.emit({ name: 'retention.audit', data: { cutoffDate: '2019-04-17' } });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'scheduler-retention.audit-2026-04-17' }),
    );
  });

  it('includes scope suffix in event_id for per-tenant jobs', async () => {
    await publisher.emit({
      name: 'digest.notifications',
      data: { since: '2026-04-16' },
      scope: { tenantId: 'tenant-123' },
    });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'scheduler-digest.notifications-tenant-123-2026-04-17' }),
    );
  });

  it('defaults scope to _scheduler sentinels when no scope is provided', async () => {
    await publisher.emit({ name: 'retention.audit', data: {} });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:    '_scheduler',
        workspaceId: '_scheduler',
        cellId:      '_scheduler',
        entityKey:   null,
        entityId:    null,
      }),
    );
  });

  it('uses real scope values when scope is provided', async () => {
    await publisher.emit({
      name: 'digest.notifications',
      data: {},
      scope: {
        tenantId:  'tenant-123',
        entityKey: 'digest',
        entityId:  'tenant-123',
      },
    });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:    'tenant-123',
        workspaceId: '_scheduler',
        cellId:      '_scheduler',
        entityKey:   'digest',
        entityId:    'tenant-123',
      }),
    );
  });

  it('records pending job BEFORE publishing', async () => {
    const callOrder: string[] = [];
    jobs.upsertPending.mockImplementation(async () => { callOrder.push('upsert'); });
    amqp.publishToExchange.mockImplementation(() => { callOrder.push('publish'); });
    jobs.markEmitted.mockImplementation(async () => { callOrder.push('emitted'); });

    await publisher.emit({ name: 'retention.audit', data: {} });
    expect(callOrder).toEqual(['upsert', 'publish', 'emitted']);
  });

  it('publishes to exchange with correct routing key', async () => {
    await publisher.emit({ name: 'retention.audit', data: { cutoffDate: '2019-04-17' } });
    expect(amqp.publishToExchange).toHaveBeenCalledWith(
      'cell._scheduler._scheduler._scheduler.scheduler.retention.audit',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
      }),
    );
  });

  it('includes x-scheduler-origin header', async () => {
    await publisher.emit({ name: 'retention.audit', data: {} });
    const msgOptions = amqp.publishToExchange.mock.calls[0][2];
    expect(msgOptions.headers['x-scheduler-origin']).toBe('true');
    expect(msgOptions.headers['x-tenant-id']).toBe('_scheduler');
  });

  it('builds a valid DomainEventEnvelope in the message body', async () => {
    await publisher.emit({ name: 'retention.audit', data: { cutoffDate: '2019-04-17' } });
    const body = JSON.parse(amqp.publishToExchange.mock.calls[0][1].toString());
    expect(body).toMatchObject({
      event_id:     'scheduler-retention.audit-2026-04-17',
      event_name:   'scheduler.retention.audit',
      version:      1,
      tenant_id:    '_scheduler',
      workspace_id: '_scheduler',
      cell_id:      '_scheduler',
      actor:        { type: 'system', id: 'scheduler' },
      entity:       { type: 'scheduler', id: 'retention.audit' },
      data:         { cutoffDate: '2019-04-17' },
    });
  });

  it('uses entity scope in envelope when provided', async () => {
    await publisher.emit({
      name: 'digest.notifications',
      data: {},
      scope: { tenantId: 'tenant-123', entityKey: 'digest', entityId: 'tenant-123' },
    });
    const body = JSON.parse(amqp.publishToExchange.mock.calls[0][1].toString());
    expect(body.entity).toEqual({ type: 'digest', id: 'tenant-123' });
    expect(body.tenant_id).toBe('tenant-123');
  });

  it('marks job as emitted on success', async () => {
    await publisher.emit({ name: 'retention.audit', data: {} });
    expect(jobs.markEmitted).toHaveBeenCalledWith('scheduler-retention.audit-2026-04-17');
  });

  it('marks job as failed and re-throws on publish error', async () => {
    amqp.publishToExchange.mockImplementation(() => {
      throw new Error('connection refused');
    });
    await expect(
      publisher.emit({ name: 'retention.audit', data: {} }),
    ).rejects.toThrow('connection refused');
    expect(jobs.markFailed).toHaveBeenCalledWith(
      'scheduler-retention.audit-2026-04-17',
      'connection refused',
    );
    expect(jobs.markEmitted).not.toHaveBeenCalled();
  });

  it('entity_key and entity_id are null when not in scope', async () => {
    await publisher.emit({ name: 'retention.audit', data: {} });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({ entityKey: null, entityId: null }),
    );
  });

  it('includes all non-sentinel scope segments in event_id', async () => {
    await publisher.emit({
      name: 'reminder.invoice',
      data: {},
      scope: {
        tenantId:    'tenant-1',
        workspaceId: 'ws-2',
        cellId:      'cell-3',
        entityKey:   'invoice',
        entityId:    'inv-456',
      },
    });
    expect(jobs.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'scheduler-reminder.invoice-tenant-1-ws-2-cell-3-invoice-inv-456-2026-04-17',
      }),
    );
  });

  it('produces distinct event_ids for same-name jobs with different workspace scope', async () => {
    await publisher.emit({
      name: 'digest.notifications',
      data: {},
      scope: { tenantId: 'tenant-1', workspaceId: 'ws-A' },
    });
    await publisher.emit({
      name: 'digest.notifications',
      data: {},
      scope: { tenantId: 'tenant-1', workspaceId: 'ws-B' },
    });
    const id1 = jobs.upsertPending.mock.calls[0][0].id;
    const id2 = jobs.upsertPending.mock.calls[1][0].id;
    expect(id1).not.toBe(id2);
    expect(id1).toBe('scheduler-digest.notifications-tenant-1-ws-A-2026-04-17');
    expect(id2).toBe('scheduler-digest.notifications-tenant-1-ws-B-2026-04-17');
  });
});
