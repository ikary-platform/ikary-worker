import { z } from 'zod';

/**
 * Change classification on an audit entry.
 *
 *   `diff`     — envelope had a non-empty `previous`; the entry records the
 *                transition as `{ from, to }`.
 *   `snapshot` — no `previous` was provided (e.g. create events, or initial
 *                seed); the entry records the full `data` snapshot.
 */
export const auditChangeKindSchema = z.enum(['diff', 'snapshot']);
export type AuditChangeKind = z.infer<typeof auditChangeKindSchema>;

/**
 * Actor taxonomy shared with the platform event envelope. Mirrors
 * DomainEventActorType from @ikary/cell-contract so upstream producers and
 * the audit trail agree on the taxonomy.
 */
export const auditActorTypeSchema = z.enum(['user', 'system', 'workflow', 'api']);
export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

/**
 * Boundary shape for an audit entry row — used when reading out of the DB,
 * when handing to the repository, and (potentially) for downstream UIs.
 * Kysely table types live in src/server/db/schema.ts and are kept separate
 * from this Zod schema.
 */
export const auditEntrySchema = z.object({
  eventId:          z.string().min(1),
  eventName:        z.string().min(1),
  eventVersion:     z.number().int().positive(),
  occurredAt:       z.string().datetime(),
  tenantId:         z.string().min(1),
  workspaceId:      z.string().min(1).nullable(),
  cellId:           z.string().min(1).nullable(),
  actorId:          z.string().nullable(),
  actorType:        auditActorTypeSchema,
  resourceType:     z.string().min(1),
  resourceId:       z.string().min(1),
  resourceVersion:  z.number().int().positive(),
  changeKind:       auditChangeKindSchema,
  diff:             z.unknown().nullable(),
  snapshot:         z.unknown().nullable(),
  metadata:         z.record(z.unknown()),
  redactionApplied: z.boolean(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
