import {
  analyticsClassifierResultSchema,
  type AnalyticsClassifierResult,
  type AnalyticsPattern,
  type ObservabilityFamily,
} from './analytics-classifier.schema.js';

/**
 * Pure classifier — ported from ikary-harbor's
 * libs/system-event-bus/src/server/analytics-classifier.ts, adapted for the
 * new DomainEventEnvelope shape (event_name instead of type; entity.type
 * instead of aggregateType; data instead of payload).
 *
 * Framework-agnostic — no NestJS, no DB, no side effects. Exported from the
 * shared surface so browser code and any consumer can reuse it.
 */

const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS']);
const ENTITY_LIFECYCLE_ACTIONS = new Set(['created', 'updated', 'deleted_soft', 'rolled_back']);

export interface ClassifierInput {
  eventName:  string;
  entityType: string;
  data:       Record<string, unknown>;
}

function normalizeDomain(value: string | undefined): string {
  if (!value) return 'other';
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'other';
}

function resolveAction(eventName: string): string {
  // String.split always returns at least one element — the last segment is
  // never undefined even for the empty string (which splits to ['']).
  const segments = eventName.split('.');
  return segments[segments.length - 1] as string;
}

function resolveFamily(
  eventName: string,
  entityType: string,
  action: string,
): ObservabilityFamily {
  if (eventName.includes('.page.') || eventName.startsWith('page.')) {
    return 'page';
  }
  if (
    eventName.includes('.api.request.') ||
    eventName.includes('.client_api.request.') ||
    eventName.startsWith('api.request.') ||
    eventName.startsWith('client_api.request.')
  ) {
    return 'api';
  }
  if (
    eventName.includes('.sequence.') ||
    eventName.includes('.workflow.') ||
    eventName.startsWith('sequence.') ||
    eventName.startsWith('workflow.') ||
    entityType === 'sequence' ||
    entityType === 'workflow'
  ) {
    return 'workflow';
  }
  if (eventName.includes('.entity.') || ENTITY_LIFECYCLE_ACTIONS.has(action)) {
    return 'entity';
  }
  return 'other';
}

function toPattern(family: ObservabilityFamily): AnalyticsPattern {
  switch (family) {
    case 'page':     return 'page.*';
    case 'api':      return 'api.*';
    case 'workflow': return 'workflow.*';
    case 'entity':   return 'entity.*';
    case 'other':    return 'other.*';
  }
}

function resolveHttpMethod(data: Record<string, unknown>): string | null {
  const value = data['method'];
  if (typeof value !== 'string') return null;
  const method = value.trim().toUpperCase();
  return HTTP_METHODS.has(method) ? method : null;
}

function resolveStatusClass(data: Record<string, unknown>): string | null {
  const raw = data['statusCode'] ?? data['status'];
  const status = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(status) || status < 100 || status > 599) return null;
  return `${Math.floor(status / 100)}xx`;
}

/**
 * Classify an event into the analytics taxonomy. Result is validated against
 * `analyticsClassifierResultSchema` to catch any regression in the mapping
 * logic before downstream code trusts the output.
 */
export function classifyAnalyticsEvent(input: ClassifierInput): AnalyticsClassifierResult {
  const action = resolveAction(input.eventName);
  const family = resolveFamily(input.eventName, input.entityType, action);

  return analyticsClassifierResultSchema.parse({
    observabilityFamily: family,
    observabilityAction: action,
    analyticsPattern:    toPattern(family),
    businessDomain:      normalizeDomain(input.entityType || input.eventName.split('.')[0]),
    httpMethod:          resolveHttpMethod(input.data),
    statusClass:         resolveStatusClass(input.data),
  });
}
