import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import {
  ACTIVITY_FEED_SUMMARY_MAX_LENGTH,
  ActivityFeedService,
} from './activity-feed.service.js';
import { ActivityFeedRepository } from '../../server/repositories/activity-feed.repository.js';

const baseEvent: DomainEventEnvelope = {
  event_id:     'evt-001',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-04-16T10:00:00.000Z',
  tenant_id:    't1',
  workspace_id: 'w1',
  cell_id:      'c1',
  actor:        { type: 'user', id: 'user-1' },
  entity:       { type: 'invoice', id: 'inv-1' },
  data:         { amount: 100 },
  previous:     {},
  metadata:     {},
};

describe('ActivityFeedService', () => {
  let repo: ActivityFeedRepository;
  let service: ActivityFeedService;

  beforeEach(() => {
    repo = {
      insertIfNotExists: vi.fn().mockResolvedValue(undefined),
    } as unknown as ActivityFeedRepository;
    service = new ActivityFeedService(repo);
  });

  describe('buildEntry', () => {
    it('sets title to the raw event name', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.title).toBe('invoice.created');
    });

    it('summary is the JSON of data when short', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.summary).toBe('{"amount":100}');
    });

    it('summary is null when data is empty', () => {
      const entry = service.buildEntry({ ...baseEvent, data: {} });
      expect(entry.summary).toBeNull();
    });

    it('summary is truncated to max length', () => {
      const bigData = { text: 'x'.repeat(1000) };
      const entry = service.buildEntry({ ...baseEvent, data: bigData });
      expect(entry.summary).not.toBeNull();
      expect((entry.summary as string).length).toBe(ACTIVITY_FEED_SUMMARY_MAX_LENGTH);
    });

    it('payload is the raw event.data (not the truncated summary)', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.payload).toEqual({ amount: 100 });
    });

    it('actor and resource come from the envelope', () => {
      const entry = service.buildEntry(baseEvent);
      expect(entry.actorId).toBe('user-1');
      expect(entry.actorType).toBe('user');
      expect(entry.resourceType).toBe('invoice');
      expect(entry.resourceId).toBe('inv-1');
    });

    it('passes through null scope fields', () => {
      const entry = service.buildEntry({
        ...baseEvent,
        workspace_id: null as unknown as string,
        cell_id:      null as unknown as string,
      });
      expect(entry.workspaceId).toBeNull();
      expect(entry.cellId).toBeNull();
    });
  });

  describe('record', () => {
    it('delegates to the repository with the supplied tx', async () => {
      const fakeTx = { TX: true } as never;
      await service.record(baseEvent, fakeTx);
      expect(repo.insertIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'evt-001', title: 'invoice.created' }),
        fakeTx,
      );
    });
  });
});
