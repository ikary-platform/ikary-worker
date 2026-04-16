-- Idempotency records for domain event consumption.
-- Primary key (consumer_name, event_id) guarantees each consumer
-- processes each event at most once, even under redelivery.

CREATE TABLE IF NOT EXISTS ikary_event_consumer_receipts (
  consumer_name TEXT        NOT NULL,
  event_id      TEXT        NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
);

-- Supports periodic cleanup of old receipts once the matching broker
-- retention window has elapsed (messages older than this cannot be
-- redelivered, so their receipts are no longer needed for dedup).
CREATE INDEX IF NOT EXISTS ikary_event_consumer_receipts_received_at_idx
  ON ikary_event_consumer_receipts (received_at);
