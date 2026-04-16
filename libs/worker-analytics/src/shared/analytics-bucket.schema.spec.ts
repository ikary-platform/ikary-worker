import { describe, it, expect } from 'vitest';
import { analyticsBucketSchema } from './analytics-bucket.schema.js';

const base = {
  bucketStart:      '2026-04-16T10:00:00.000Z',
  tenantId:         't1',
  workspaceId:      'w1',
  cellId:           'c1',
  eventName:        'invoice.created',
  analyticsPattern: 'entity.*' as const,
  businessDomain:   'invoice',
  httpMethod:       '',
  statusClass:      '',
  eventCount:       1,
  failureCount:     0,
};

describe('analyticsBucketSchema', () => {
  it('parses a valid bucket', () => {
    expect(analyticsBucketSchema.parse(base)).toEqual(base);
  });

  it("accepts empty-string sentinels for nullable dimensions", () => {
    const result = analyticsBucketSchema.parse({
      ...base,
      workspaceId: '',
      cellId:      '',
      httpMethod:  '',
      statusClass: '',
    });
    expect(result.workspaceId).toBe('');
    expect(result.cellId).toBe('');
  });

  it('rejects a negative event_count', () => {
    expect(() => analyticsBucketSchema.parse({ ...base, eventCount: -1 })).toThrow();
  });

  it('rejects an invalid analytics_pattern', () => {
    expect(() =>
      analyticsBucketSchema.parse({ ...base, analyticsPattern: 'weird.*' }),
    ).toThrow();
  });
});
