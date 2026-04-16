import { describe, it, expect } from 'vitest';
import {
  activityActorTypeSchema,
  activityEntrySchema,
} from './activity-entry.schema.js';

describe('activityActorTypeSchema', () => {
  it.each(['user', 'system', 'workflow', 'api'] as const)('accepts %s', (v) => {
    expect(activityActorTypeSchema.parse(v)).toBe(v);
  });
  it('rejects unknown', () => {
    expect(() => activityActorTypeSchema.parse('robot')).toThrow();
  });
});

describe('activityEntrySchema', () => {
  const base = {
    eventId:      'e1',
    eventName:    'invoice.created',
    tenantId:     't1',
    workspaceId:  'w1',
    cellId:       'c1',
    actorId:      'u1',
    actorType:    'user' as const,
    resourceType: 'invoice',
    resourceId:   'inv-1',
    title:        'invoice.created',
    summary:      '{"amount":100}',
    payload:      { amount: 100 },
    occurredAt:   '2026-04-16T10:00:00.000Z',
  };

  it('parses a valid entry', () => {
    expect(activityEntrySchema.parse(base)).toEqual(base);
  });

  it('allows null summary', () => {
    expect(activityEntrySchema.parse({ ...base, summary: null }).summary).toBeNull();
  });

  it('allows null workspace/cell ids', () => {
    const r = activityEntrySchema.parse({ ...base, workspaceId: null, cellId: null });
    expect(r.workspaceId).toBeNull();
    expect(r.cellId).toBeNull();
  });

  it('rejects empty title', () => {
    expect(() => activityEntrySchema.parse({ ...base, title: '' })).toThrow();
  });
});
