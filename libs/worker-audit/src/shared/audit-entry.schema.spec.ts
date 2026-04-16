import { describe, it, expect } from 'vitest';
import {
  auditActorTypeSchema,
  auditChangeKindSchema,
  auditEntrySchema,
} from './audit-entry.schema.js';

describe('auditChangeKindSchema', () => {
  it.each(['diff', 'snapshot'] as const)('accepts %s', (value) => {
    expect(auditChangeKindSchema.parse(value)).toBe(value);
  });

  it('rejects other strings', () => {
    expect(() => auditChangeKindSchema.parse('full')).toThrow();
  });
});

describe('auditActorTypeSchema', () => {
  it.each(['user', 'system', 'workflow', 'api'] as const)('accepts %s', (value) => {
    expect(auditActorTypeSchema.parse(value)).toBe(value);
  });

  it('rejects unknown actor types', () => {
    expect(() => auditActorTypeSchema.parse('agent')).toThrow();
  });
});

describe('auditEntrySchema', () => {
  const base = {
    eventId:          'evt-001',
    eventName:        'invoice.created',
    eventVersion:     1,
    occurredAt:       '2026-04-16T10:00:00.000Z',
    tenantId:         't1',
    workspaceId:      'w1',
    cellId:           'c1',
    actorId:          'user-1',
    actorType:        'user' as const,
    resourceType:     'invoice',
    resourceId:       'inv-1',
    resourceVersion:  1,
    changeKind:       'snapshot' as const,
    diff:             null,
    snapshot:         { amount: 100 },
    metadata:         {},
    redactionApplied: false,
  };

  it('parses a valid entry', () => {
    expect(auditEntrySchema.parse(base)).toEqual(base);
  });

  it('allows nullable scope fields', () => {
    const result = auditEntrySchema.parse({ ...base, workspaceId: null, cellId: null });
    expect(result.workspaceId).toBeNull();
    expect(result.cellId).toBeNull();
  });

  it('rejects missing required fields', () => {
    const { eventId: _eventId, ...missing } = base;
    expect(() => auditEntrySchema.parse(missing)).toThrow();
  });

  it('rejects invalid change_kind', () => {
    expect(() => auditEntrySchema.parse({ ...base, changeKind: 'full' })).toThrow();
  });

  it('rejects non-positive resource_version', () => {
    expect(() => auditEntrySchema.parse({ ...base, resourceVersion: 0 })).toThrow();
  });
});
