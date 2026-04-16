import { z } from 'zod';
import { analyticsPatternSchema } from './analytics-classifier.schema.js';

/**
 * Boundary shape for a row in `ikary_analytics_buckets_hourly`.
 *
 * Scope-null dimensions (`workspaceId`, `cellId`, `httpMethod`, `statusClass`)
 * use empty-string '' as the "not applicable" sentinel, NOT null. This is
 * required because PostgreSQL treats NULL <> NULL in unique constraints —
 * without the sentinel, upsert idempotency would break.
 */
export const analyticsBucketSchema = z.object({
  bucketStart:      z.string().datetime(),
  tenantId:         z.string().min(1),
  workspaceId:      z.string(),
  cellId:           z.string(),
  eventName:        z.string().min(1),
  analyticsPattern: analyticsPatternSchema,
  businessDomain:   z.string().min(1),
  httpMethod:       z.string(),
  statusClass:      z.string(),
  eventCount:       z.number().int().nonnegative(),
  failureCount:     z.number().int().nonnegative(),
});
export type AnalyticsBucket = z.infer<typeof analyticsBucketSchema>;
