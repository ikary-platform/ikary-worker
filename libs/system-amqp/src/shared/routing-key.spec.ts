import { describe, it, expect } from 'vitest';
import { buildRoutingKey } from './routing-key.js';

describe('buildRoutingKey', () => {
  it('builds a cell-scoped key when all IDs are present', () => {
    expect(
      buildRoutingKey({ eventName: 'invoice.created', tenantId: 't1', workspaceId: 'w1', cellId: 'c1' }),
    ).toBe('cell.t1.w1.c1.invoice.created');
  });

  it('builds a workspace-scoped key when cellId is absent', () => {
    expect(
      buildRoutingKey({ eventName: 'invoice.created', tenantId: 't1', workspaceId: 'w1' }),
    ).toBe('workspace.t1.w1.invoice.created');
  });

  it('builds a workspace-scoped key when cellId is null', () => {
    expect(
      buildRoutingKey({ eventName: 'invoice.created', tenantId: 't1', workspaceId: 'w1', cellId: null }),
    ).toBe('workspace.t1.w1.invoice.created');
  });

  it('builds a tenant-scoped key when workspaceId is absent', () => {
    expect(
      buildRoutingKey({ eventName: 'license.updated', tenantId: 't1' }),
    ).toBe('tenant.t1.license.updated');
  });

  it('builds a tenant-scoped key when workspaceId is null', () => {
    expect(
      buildRoutingKey({ eventName: 'license.updated', tenantId: 't1', workspaceId: null }),
    ).toBe('tenant.t1.license.updated');
  });

  it('builds a system-scoped key when no IDs are present', () => {
    expect(
      buildRoutingKey({ eventName: 'health.checked' }),
    ).toBe('system.health.checked');
  });

  it('builds a system-scoped key when tenantId is null', () => {
    expect(
      buildRoutingKey({ eventName: 'health.checked', tenantId: null }),
    ).toBe('system.health.checked');
  });

  it('ignores workspaceId when tenantId is absent', () => {
    // workspaceId without tenantId is invalid data — falls back to system scope
    expect(
      buildRoutingKey({ eventName: 'thing.happened', workspaceId: 'w1' }),
    ).toBe('system.thing.happened');
  });
});
