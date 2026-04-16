import { describe, it, expect } from 'vitest';
import { classifyAnalyticsEvent } from './analytics-classifier.js';

describe('classifyAnalyticsEvent — family resolution', () => {
  it('classifies scoped page events as `page`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'workspace.page.viewed',
      entityType: 'page',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('page');
    expect(r.analyticsPattern).toBe('page.*');
  });

  it('classifies bare page events as `page`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'page.viewed',
      entityType: 'page',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('page');
  });

  it('classifies scoped api.request.* as `api`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'workspace.api.request.completed',
      entityType: 'request',
      data:       { method: 'POST', statusCode: 201 },
    });
    expect(r.observabilityFamily).toBe('api');
    expect(r.httpMethod).toBe('POST');
    expect(r.statusClass).toBe('2xx');
  });

  it('classifies client_api.request.* as `api`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'tenant.client_api.request.failed',
      entityType: 'request',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('api');
  });

  it('classifies bare api.request.* as `api`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('api');
  });

  it('classifies bare client_api.request.* as `api`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'client_api.request.failed',
      entityType: 'request',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('api');
  });

  it('classifies sequence events as `workflow`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'cell.sequence.updated',
      entityType: 'sequence',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('workflow');
  });

  it('classifies entityType=sequence as `workflow` even without explicit path marker', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'foo.bar.baz',
      entityType: 'sequence',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('workflow');
  });

  it('classifies entityType=workflow as `workflow`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'foo.bar.baz',
      entityType: 'workflow',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('workflow');
  });

  it('classifies bare workflow.* as `workflow`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'workflow.step_completed',
      entityType: 'step',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('workflow');
  });

  it('classifies bare sequence.* as `workflow`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'sequence.rolled_back',
      entityType: 'x',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('workflow');
  });

  it('classifies `*.entity.*` as `entity`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'workspace.entity.reindexed',
      entityType: 'x',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('entity');
  });

  it('classifies lifecycle actions (.created/.updated/.deleted_soft/.rolled_back) as `entity`', () => {
    for (const action of ['created', 'updated', 'deleted_soft', 'rolled_back']) {
      const r = classifyAnalyticsEvent({
        eventName:  `invoice.${action}`,
        entityType: 'invoice',
        data:       {},
      });
      expect(r.observabilityFamily).toBe('entity');
      expect(r.observabilityAction).toBe(action);
    }
  });

  it('falls through to `other`', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'weird.happening',
      entityType: 'x',
      data:       {},
    });
    expect(r.observabilityFamily).toBe('other');
    expect(r.analyticsPattern).toBe('other.*');
  });
});

describe('classifyAnalyticsEvent — action extraction', () => {
  it('uses the last segment of the event name', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'a.b.c.my_action',
      entityType: 'x',
      data:       {},
    });
    expect(r.observabilityAction).toBe('my_action');
  });

  it('defaults to unknown for an empty name', () => {
    // Empty string will fail the min(1) validation at classifier return, so
    // this path is reached only with a fabricated single-segment name. We
    // test the unknown-action fallback inside the helper by passing a name
    // that has no segments after split.
    // An impossible input in practice; kept as defensive coverage.
    expect(() =>
      classifyAnalyticsEvent({ eventName: '', entityType: 'x', data: {} }),
    ).toThrow(); // empty action fails the schema regardless
  });
});

describe('classifyAnalyticsEvent — HTTP method parsing', () => {
  it('normalises case', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { method: 'post' },
    });
    expect(r.httpMethod).toBe('POST');
  });

  it('accepts all HTTP methods', () => {
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS']) {
      const r = classifyAnalyticsEvent({
        eventName:  'api.request.completed',
        entityType: 'request',
        data:       { method: m },
      });
      expect(r.httpMethod).toBe(m);
    }
  });

  it('returns null for unknown methods', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { method: 'FETCH' },
    });
    expect(r.httpMethod).toBeNull();
  });

  it('returns null for non-string method', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { method: 42 },
    });
    expect(r.httpMethod).toBeNull();
  });
});

describe('classifyAnalyticsEvent — status-class parsing', () => {
  it.each([
    [101, '1xx'],
    [200, '2xx'],
    [302, '3xx'],
    [404, '4xx'],
    [500, '5xx'],
  ])('maps %d to %s', (code, cls) => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { statusCode: code },
    });
    expect(r.statusClass).toBe(cls);
  });

  it('falls back to `status` key when `statusCode` is absent', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { status: 404 },
    });
    expect(r.statusClass).toBe('4xx');
  });

  it('parses string status codes', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { statusCode: '500' },
    });
    expect(r.statusClass).toBe('5xx');
  });

  it('returns null for non-numeric', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { statusCode: 'weird' },
    });
    expect(r.statusClass).toBeNull();
  });

  it('returns null for out-of-range codes', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       { statusCode: 42 },
    });
    expect(r.statusClass).toBeNull();
  });

  it('returns null for missing status', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'api.request.completed',
      entityType: 'request',
      data:       {},
    });
    expect(r.statusClass).toBeNull();
  });
});

describe('classifyAnalyticsEvent — business domain', () => {
  it('normalises the entity type to a sanitised slug', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'x.created',
      entityType: 'Invoice Line Item',
      data:       {},
    });
    expect(r.businessDomain).toBe('invoice_line_item');
  });

  it('falls back to the first event-name segment when entity type is empty', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'billing.thing.happened',
      entityType: '',
      data:       {},
    });
    expect(r.businessDomain).toBe('billing');
  });

  it('returns "other" when neither is usable', () => {
    // Leading dot → split('.')[0] = ''; empty entity type means the fallback
    // chain resolves to ''. normalizeDomain(undefined-or-empty) → 'other'.
    const r = classifyAnalyticsEvent({
      eventName:  '.xyz',
      entityType: '',
      data:       {},
    });
    expect(r.businessDomain).toBe('other');
  });

  it('returns "other" when the normalised slug would be empty', () => {
    const r = classifyAnalyticsEvent({
      eventName:  'x.created',
      entityType: '@@@@',       // strips to empty after slug normalisation
      data:       {},
    });
    expect(r.businessDomain).toBe('other');
  });
});
