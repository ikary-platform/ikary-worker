-- Immutable audit trail — one row per DomainEventEnvelope.
-- Idempotent on event_id so redeliveries from RabbitMQ and republish-to-self
-- retries do not duplicate rows. Schema is derived from the envelope:
--   actor.type       -> actor_type
--   entity.type/id   -> resource_type, resource_id
--   version          -> resource_version
--   data + previous  -> diff (when previous is non-empty) or snapshot

CREATE TABLE IF NOT EXISTS ikary_audit_entries (
  event_id          TEXT        PRIMARY KEY,
  event_name        TEXT        NOT NULL,
  event_version     INTEGER     NOT NULL,
  occurred_at       TIMESTAMPTZ NOT NULL,
  tenant_id         TEXT        NOT NULL,
  workspace_id      TEXT        NULL,
  cell_id           TEXT        NULL,
  actor_id          TEXT        NULL,
  actor_type        TEXT        NOT NULL,
  resource_type     TEXT        NOT NULL,
  resource_id       TEXT        NOT NULL,
  resource_version  INTEGER     NOT NULL,
  change_kind       TEXT        NOT NULL CHECK (change_kind IN ('diff', 'snapshot')),
  diff              JSONB       NULL,
  snapshot          JSONB       NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  redaction_applied BOOLEAN     NOT NULL DEFAULT FALSE,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-wide time-range queries ("all audit activity in the last hour")
CREATE INDEX IF NOT EXISTS ikary_audit_entries_tenant_occurred_idx
  ON ikary_audit_entries (tenant_id, occurred_at DESC);

-- Per-resource history ("all changes to invoice inv-001, newest first")
CREATE INDEX IF NOT EXISTS ikary_audit_entries_resource_idx
  ON ikary_audit_entries (tenant_id, resource_type, resource_id, resource_version DESC);
