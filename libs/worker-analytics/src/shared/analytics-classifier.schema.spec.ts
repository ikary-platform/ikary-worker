import { describe, it, expect } from 'vitest';
import {
  analyticsClassifierResultSchema,
  analyticsPatternSchema,
  observabilityFamilySchema,
  statusClassSchema,
} from './analytics-classifier.schema.js';

describe('observabilityFamilySchema', () => {
  it('accepts every known family', () => {
    for (const f of ['page', 'api', 'workflow', 'entity', 'other']) {
      expect(observabilityFamilySchema.parse(f)).toBe(f);
    }
  });
  it('rejects unknown family', () => {
    expect(() => observabilityFamilySchema.parse('metrics')).toThrow();
  });
});

describe('analyticsPatternSchema', () => {
  it('accepts every known pattern', () => {
    for (const p of ['page.*', 'api.*', 'workflow.*', 'entity.*', 'other.*']) {
      expect(analyticsPatternSchema.parse(p)).toBe(p);
    }
  });
});

describe('statusClassSchema', () => {
  it('accepts 1xx–5xx', () => {
    for (const c of ['1xx', '2xx', '3xx', '4xx', '5xx']) {
      expect(statusClassSchema.parse(c)).toBe(c);
    }
  });
  it('accepts null', () => {
    expect(statusClassSchema.parse(null)).toBeNull();
  });
  it('rejects other strings', () => {
    expect(() => statusClassSchema.parse('6xx')).toThrow();
    expect(() => statusClassSchema.parse('200')).toThrow();
  });
});

describe('analyticsClassifierResultSchema', () => {
  it('parses a complete result', () => {
    const result = analyticsClassifierResultSchema.parse({
      observabilityFamily: 'api',
      observabilityAction: 'completed',
      analyticsPattern:    'api.*',
      businessDomain:      'invoice',
      httpMethod:          'POST',
      statusClass:         '2xx',
    });
    expect(result.observabilityFamily).toBe('api');
  });
});
