CREATE TABLE IF NOT EXISTS ikary_scheduler_jobs (
  id              TEXT        PRIMARY KEY,
  job_name        TEXT        NOT NULL,
  tenant_id       TEXT        NOT NULL,
  workspace_id    TEXT        NOT NULL,
  cell_id         TEXT        NOT NULL,
  entity_key      TEXT        NULL,
  entity_id       TEXT        NULL,
  status          TEXT        NOT NULL CHECK (status IN ('pending','emitted','failed')),
  event_id        TEXT        NOT NULL,
  event_data      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  emitted_at      TIMESTAMPTZ NULL,
  failed_at       TIMESTAMPTZ NULL,
  error_message   TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ikary_scheduler_jobs_name_scheduled_idx
  ON ikary_scheduler_jobs (job_name, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS ikary_scheduler_jobs_tenant_idx
  ON ikary_scheduler_jobs (tenant_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS ikary_scheduler_jobs_workspace_idx
  ON ikary_scheduler_jobs (workspace_id, scheduled_at DESC)
  WHERE workspace_id <> '_scheduler';

CREATE INDEX IF NOT EXISTS ikary_scheduler_jobs_cell_idx
  ON ikary_scheduler_jobs (cell_id, scheduled_at DESC)
  WHERE cell_id <> '_scheduler';
