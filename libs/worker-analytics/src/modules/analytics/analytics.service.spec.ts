import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsRepository } from '../../server/repositories/analytics.repository.js';

const baseEvent: DomainEventEnvelope = {
  event_id:     'evt-001',
  event_name:   'invoice.created',
  version:      1,
  timestamp:    '2026-04-16T10:34:56.000Z',  // minute/second/ms will truncate to top-of-hour
  tenant_id:    't1',
  workspace_id: 'w1',
  cell_id:      'c1',
  actor:        { type: 'user', id: 'user-1' },
  entity:       { type: 'invoice', id: 'inv-1' },
  data:         { amount: 100 },
  previous:     {},
  metadata:     {},
};

describe('AnalyticsService', () => {
  let repo: AnalyticsRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    repo = { upsertBucket: vi.fn().mockResolvedValue(undefined) } as unknown as AnalyticsRepository;
    service = new AnalyticsService(repo);
  });

  describe('buildBucket', () => {
    it('truncates the timestamp to the top of the hour', () => {
      const bucket = service.buildBucket(baseEvent);
      expect(bucket.bucketStart).toBe('2026-04-16T10:00:00.000Z');
    });

    it('carries classifier output into the bucket', () => {
      const bucket = service.buildBucket(baseEvent);
      expect(bucket.analyticsPattern).toBe('entity.*');
      expect(bucket.businessDomain).toBe('invoice');
    });

    it('uses empty-string sentinels for nullable scope dimensions', () => {
      const bucket = service.buildBucket({
        ...baseEvent,
        workspace_id: null as unknown as string,
        cell_id:      null as unknown as string,
      });
      expect(bucket.workspaceId).toBe('');
      expect(bucket.cellId).toBe('');
    });

    it('uses empty-string sentinels for null httpMethod and statusClass', () => {
      const bucket = service.buildBucket(baseEvent);
      expect(bucket.httpMethod).toBe('');
      expect(bucket.statusClass).toBe('');
    });

    it('event_count is always 1 (the repository does the aggregation)', () => {
      const bucket = service.buildBucket(baseEvent);
      expect(bucket.eventCount).toBe(1);
    });

    it('failure_count = 1 when event_name ends with .failed', () => {
      const bucket = service.buildBucket({
        ...baseEvent,
        event_name: 'invoice.dispatch.failed',
      });
      expect(bucket.failureCount).toBe(1);
    });

    it('failure_count = 1 when status class is 4xx', () => {
      const bucket = service.buildBucket({
        ...baseEvent,
        event_name: 'api.request.completed',
        entity:     { type: 'request', id: 'r1' },
        data:       { statusCode: 404 },
      });
      expect(bucket.failureCount).toBe(1);
    });

    it('failure_count = 1 when status class is 5xx', () => {
      const bucket = service.buildBucket({
        ...baseEvent,
        event_name: 'api.request.completed',
        entity:     { type: 'request', id: 'r1' },
        data:       { statusCode: 502 },
      });
      expect(bucket.failureCount).toBe(1);
    });

    it('failure_count = 0 on success events', () => {
      const bucket = service.buildBucket({
        ...baseEvent,
        event_name: 'api.request.completed',
        entity:     { type: 'request', id: 'r1' },
        data:       { statusCode: 200 },
      });
      expect(bucket.failureCount).toBe(0);
    });
  });

  describe('record', () => {
    it('delegates to repository.upsertBucket with the supplied transaction', async () => {
      const fakeTx = { TX: true } as never;
      await service.record(baseEvent, fakeTx);
      expect(repo.upsertBucket).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'invoice.created' }),
        fakeTx,
      );
    });
  });
});
