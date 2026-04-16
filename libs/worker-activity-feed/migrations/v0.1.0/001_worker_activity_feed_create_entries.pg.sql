-- User-facing activity feed — one row per DomainEventEnvelope.
-- Idempotent on event_id. Downstream UIs filter at query time (by tenant,
-- actor, resource, time window).

CREATE TABLE IF NOT EXISTS ikary_activity_entries (
  event_id       TEXT        PRIMARY KEY,
  event_name     TEXT        NOT NULL,
  tenant_id      TEXT        NOT NULL,
  workspace_id   TEXT        NULL,
  cell_id        TEXT        NULL,
  actor_id       TEXT        NULL,
  actor_type     TEXT        NOT NULL,
  resource_type  TEXT        NOT NULL,
  resource_id    TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  summary        TEXT        NULL,
  payload        JSONB       NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ikary_activity_entries_tenant_occurred_idx
  ON ikary_activity_entries (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ikary_activity_entries_workspace_occurred_idx
  ON ikary_activity_entries (tenant_id, workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ikary_activity_entries_actor_occurred_idx
  ON ikary_activity_entries (tenant_id, actor_id, occurred_at DESC);
