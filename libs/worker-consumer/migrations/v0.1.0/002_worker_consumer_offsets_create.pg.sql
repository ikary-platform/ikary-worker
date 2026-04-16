-- Per-consumer, per-aggregate version offset for gap detection.
--
-- When a consumer processes event v=N for aggregate A, it records
-- last_version = N. If v=N+2 arrives before v=N+1, the runner detects
-- the gap (last_version + 1 != incoming version) and requeues until
-- the missing version appears.
--
-- aggregate_key is the denormalised "<entity.type>:<entity.id>" composite
-- so that offsets are scoped per-aggregate, not per-tenant. Events for
-- aggregate A and aggregate B may be processed in any order across
-- aggregates without triggering the gap check.

CREATE TABLE IF NOT EXISTS ikary_event_consumer_offsets (
  consumer_name TEXT        NOT NULL,
  tenant_id     TEXT        NOT NULL,
  aggregate_key TEXT        NOT NULL,
  last_version  INTEGER     NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, tenant_id, aggregate_key)
);
