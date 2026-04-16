import { z } from 'zod';

/** Mirrors DomainEventActorType from @ikary/cell-contract. */
export const activityActorTypeSchema = z.enum(['user', 'system', 'workflow', 'api']);
export type ActivityActorType = z.infer<typeof activityActorTypeSchema>;

export const activityEntrySchema = z.object({
  eventId:      z.string().min(1),
  eventName:    z.string().min(1),
  tenantId:     z.string().min(1),
  workspaceId:  z.string().min(1).nullable(),
  cellId:       z.string().min(1).nullable(),
  actorId:      z.string().nullable(),
  actorType:    activityActorTypeSchema,
  resourceType: z.string().min(1),
  resourceId:   z.string().min(1),
  title:        z.string().min(1),
  summary:      z.string().nullable(),
  payload:      z.record(z.unknown()),
  occurredAt:   z.string().datetime(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
