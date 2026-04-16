import { z } from 'zod';

/**
 * Family classification for observability. The classifier maps every event
 * into one of these five buckets.
 */
export const observabilityFamilySchema = z.enum(['page', 'api', 'workflow', 'entity', 'other']);
export type ObservabilityFamily = z.infer<typeof observabilityFamilySchema>;

/**
 * Wildcard pattern for the family, used as a grouping key in queries and
 * dashboards ("all api.* events in the last hour").
 */
export const analyticsPatternSchema = z.enum([
  'page.*',
  'api.*',
  'workflow.*',
  'entity.*',
  'other.*',
]);
export type AnalyticsPattern = z.infer<typeof analyticsPatternSchema>;

/**
 * HTTP-status-class string. Matches 1xx..5xx for any valid HTTP status
 * the envelope payload carries; null when the event isn't API-related or
 * the status couldn't be parsed.
 */
export const statusClassSchema = z.string().regex(/^[1-5]xx$/).nullable();
export type StatusClass = z.infer<typeof statusClassSchema>;

export const analyticsClassifierResultSchema = z.object({
  observabilityFamily: observabilityFamilySchema,
  observabilityAction: z.string().min(1),
  analyticsPattern:    analyticsPatternSchema,
  businessDomain:      z.string().min(1),
  httpMethod:          z.string().nullable(),
  statusClass:         statusClassSchema,
});
export type AnalyticsClassifierResult = z.infer<typeof analyticsClassifierResultSchema>;
