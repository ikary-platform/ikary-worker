-- Hourly analytics buckets — one row per
--   (bucket_start, tenant_id, workspace_id, cell_id, event_name, http_method, status_class)
-- Populated by worker-analytics via INSERT ... ON CONFLICT DO UPDATE SET
-- event_count = event_count + 1 on every matching event.
--
-- NOTE on empty-string sentinels for nullable scope dimensions:
-- PostgreSQL treats NULL <> NULL in unique constraints, so rows with any NULL
-- PK column would never conflict and upsert idempotency would break. We use
-- '' as the "not applicable" sentinel. The shared AnalyticsBucket Zod schema
-- documents this — downstream code compares against '' rather than NULL.

CREATE TABLE IF NOT EXISTS ikary_analytics_buckets_hourly (
  bucket_start       TIMESTAMPTZ NOT NULL,
  tenant_id          TEXT        NOT NULL,
  workspace_id       TEXT        NOT NULL DEFAULT '',
  cell_id            TEXT        NOT NULL DEFAULT '',
  event_name         TEXT        NOT NULL,
  analytics_pattern  TEXT        NOT NULL,
  business_domain    TEXT        NOT NULL,
  http_method        TEXT        NOT NULL DEFAULT '',
  status_class       TEXT        NOT NULL DEFAULT '',
  event_count        BIGINT      NOT NULL DEFAULT 0,
  failure_count      BIGINT      NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_start, tenant_id, workspace_id, cell_id,
               event_name, http_method, status_class)
);
