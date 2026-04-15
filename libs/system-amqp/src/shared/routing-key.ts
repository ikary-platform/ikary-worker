export interface RoutingKeyInput {
  eventName:    string;
  tenantId?:    string | null;
  workspaceId?: string | null;
  cellId?:      string | null;
}

/**
 * Build a hierarchical RabbitMQ routing key from event scope fields.
 *
 * The key encodes tenancy so consumers can subscribe with wildcards:
 *
 *   `cell.*.*.*.*`           — all cell-scoped events
 *   `workspace.{t}.{w}.*.*` — all events in workspace {w} of tenant {t}
 *   `tenant.{t}.*`           — all events for tenant {t}
 *   `system.*`               — all system-scoped events
 *
 * Resolution order (most specific first):
 *
 *   cellId + workspaceId + tenantId → `cell.{t}.{w}.{c}.{eventName}`
 *   workspaceId + tenantId          → `workspace.{t}.{w}.{eventName}`
 *   tenantId only                   → `tenant.{t}.{eventName}`
 *   none                            → `system.{eventName}`
 */
export function buildRoutingKey(input: RoutingKeyInput): string {
  const { eventName, tenantId, workspaceId, cellId } = input;

  if (cellId && workspaceId && tenantId) {
    return `cell.${tenantId}.${workspaceId}.${cellId}.${eventName}`;
  }
  if (workspaceId && tenantId) {
    return `workspace.${tenantId}.${workspaceId}.${eventName}`;
  }
  if (tenantId) {
    return `tenant.${tenantId}.${eventName}`;
  }
  return `system.${eventName}`;
}
