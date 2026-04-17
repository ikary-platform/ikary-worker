#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Integration smoke tests for ikary-worker
#
# Spins up Postgres + RabbitMQ + Worker via docker compose, publishes events
# through the broker, and verifies the worker wrote correct rows to the DB.
#
# Prerequisites:
#   - docker & docker compose
#   - No host ports required (smoke overlay removes all port mappings)
#
# Usage:
#   bash tests/integration/smoke-test.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures"

# ── Configuration ────────────────────────────────────────────────────────────
# The smoke overlay resets all host port mappings so the suite can run
# alongside a local dev environment without port conflicts. All interaction
# happens via `docker compose exec` inside the container network.
COMPOSE="docker compose -f $ROOT_DIR/docker-compose.yml -f $SCRIPT_DIR/docker-compose.smoke.yml"
PG_USER=ikary
PG_DB=ikary
EXCHANGE="cell.events"

INFRA_TIMEOUT=60
APP_TIMEOUT=120
CONSUME_TIMEOUT=30
POLL_INTERVAL=2

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# ── Helpers ──────────────────────────────────────────────────────────────────

log()      { printf "${CYAN}[smoke]${NC} %s\n" "$*"; }
log_pass() { printf "${GREEN}  PASS${NC} %s\n" "$*"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail() { printf "${RED}  FAIL${NC} %s\n" "$*" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_step() { printf "\n${YELLOW}── %s ──${NC}\n" "$*"; }

cleanup() {
  log "Tearing down..."
  $COMPOSE --profile apps --profile tools down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Run psql inside the postgres container.
# Returns raw tuples-only (-t), unaligned (-A) output.
pg_query() {
  $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -t -A -c "$1"
}

# Publish a JSON event fixture to the cell.events exchange via the RabbitMQ
# management HTTP API. Runs a Python script inside the rabbitmq container so
# no host port mapping is needed.
# Usage: publish_event <routing_key> <fixture_file>
publish_event() {
  local routing_key="$1"
  local fixture_file="$2"
  local payload
  payload=$(cat "$fixture_file")

  local response
  response=$(printf '%s' "$payload" | $COMPOSE exec -T rabbitmq python3 -c "
import sys, json, urllib.request
payload = sys.stdin.read()
body = json.dumps({
    'properties': {'content_type': 'application/json', 'delivery_mode': 2},
    'routing_key': '$routing_key',
    'payload': payload,
    'payload_encoding': 'string',
}).encode()
req = urllib.request.Request(
    'http://localhost:15672/api/exchanges/%2F/$EXCHANGE/publish',
    data=body,
    headers={'Content-Type': 'application/json',
             'Authorization': 'Basic Z3Vlc3Q6Z3Vlc3Q='},  # guest:guest
    method='POST',
)
resp = urllib.request.urlopen(req).read().decode()
print(resp)
")

  if ! printf '%s' "$response" | grep -q '"routed":true'; then
    log_fail "Failed to publish to $routing_key (response: $response)"
    return 1
  fi
}

# Assert that a SQL query returns an expected value.
# Usage: assert_eq <description> <expected> <sql>
assert_eq() {
  local desc="$1" expected="$2" sql="$3"
  local actual
  actual=$(pg_query "$sql" | tr -d '[:space:]')
  expected=$(printf '%s' "$expected" | tr -d '[:space:]')
  if [[ "$actual" == "$expected" ]]; then
    log_pass "$desc (got: $actual)"
  else
    log_fail "$desc (expected: $expected, got: $actual)"
  fi
}

# Poll the DB until a query returns the expected value or the timeout expires.
# Returns 0 on match, 1 on timeout.
# Usage: wait_for_value <expected> <sql> [timeout]
wait_for_value() {
  local expected="$1" sql="$2" timeout="${3:-$CONSUME_TIMEOUT}"
  local elapsed=0 actual
  local expected_trimmed
  expected_trimmed=$(printf '%s' "$expected" | tr -d '[:space:]')
  while [[ $elapsed -lt $timeout ]]; do
    actual=$(pg_query "$sql" 2>/dev/null | tr -d '[:space:]' || echo "")
    if [[ "$actual" == "$expected_trimmed" ]]; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  return 1
}

# Wait for a docker compose service to report healthy.
# Uses `docker inspect` to bypass compose profile filtering.
# Usage: wait_healthy <service> [timeout]
wait_healthy() {
  local service="$1" timeout="${2:-$INFRA_TIMEOUT}"
  local elapsed=0
  # Resolve the container name from the compose project
  local container
  container=$($COMPOSE --profile apps --profile tools ps -a --format '{{.Name}}' "$service" 2>/dev/null || echo "")
  if [[ -z "$container" ]]; then
    # Fallback: try the conventional naming pattern
    container="ikary-smoke-${service}-1"
  fi
  log "Waiting for $service ($container) to be healthy (timeout: ${timeout}s)..."
  while [[ $elapsed -lt $timeout ]]; do
    local status
    status=$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
    if [[ "$status" == "healthy" ]]; then
      log "$service is healthy"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  log_fail "$service did not become healthy within ${timeout}s"
  $COMPOSE --profile apps logs "$service" --tail 50
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

log_step "Phase 1: Start infrastructure"

$COMPOSE up -d postgres rabbitmq
wait_healthy postgres
wait_healthy rabbitmq

log_step "Phase 2: Run migrations"

$COMPOSE --profile tools run --rm migrate

log_step "Phase 3: Build and start worker"

$COMPOSE --profile apps up -d --build worker
wait_healthy worker "$APP_TIMEOUT"

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Projection write
# Publish a single event and verify it appears in all three projection tables.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 1: Projection write (invoice.created)"

publish_event "cell.t-smoke.ws-smoke.c-smoke.invoice.created" \
  "$FIXTURES_DIR/event-invoice-created.json"

log "Waiting for projections..."
wait_for_value "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-001'" || true

# Give all three consumers time to finish
sleep 2

assert_eq "1 audit entry" "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "1 analytics bucket" "1" \
  "SELECT count(*) FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.created'"

assert_eq "1 activity entry" "1" \
  "SELECT count(*) FROM ikary_activity_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "audit change_kind is snapshot (empty previous)" "snapshot" \
  "SELECT change_kind FROM ikary_audit_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "analytics event_count = 1" "1" \
  "SELECT event_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.created'"

assert_eq "analytics failure_count = 0" "0" \
  "SELECT failure_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.created'"

assert_eq "activity title = event_name" "invoice.created" \
  "SELECT title FROM ikary_activity_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "3 consumer receipts" "3" \
  "SELECT count(*) FROM ikary_event_consumer_receipts WHERE event_id = 'evt-smoke-001'"

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Idempotency
# Re-publish the exact same event_id. The consumer framework should skip it
# (receipt already exists) — no new rows, no double-counting.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 2: Idempotency (duplicate evt-smoke-001)"

publish_event "cell.t-smoke.ws-smoke.c-smoke.invoice.created" \
  "$FIXTURES_DIR/event-invoice-created-dup.json"

# Duplicate is fast-pathed (receipt check → ack); brief sleep is sufficient.
sleep 3

assert_eq "still 1 audit entry" "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "still 1 activity entry" "1" \
  "SELECT count(*) FROM ikary_activity_entries WHERE event_id = 'evt-smoke-001'"

assert_eq "analytics event_count still 1" "1" \
  "SELECT event_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.created'"

assert_eq "still 3 receipts (no duplicate receipt)" "3" \
  "SELECT count(*) FROM ikary_event_consumer_receipts WHERE event_id = 'evt-smoke-001'"

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Analytics aggregation
# Publish a second event with a different event_id but the same event_name and
# same hourly bucket. Analytics should aggregate: event_count → 2.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 3: Analytics aggregation (second invoice.created)"

publish_event "cell.t-smoke.ws-smoke.c-smoke.invoice.created" \
  "$FIXTURES_DIR/event-invoice-created-2.json"

log "Waiting for second event..."
wait_for_value "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-002'" || true

sleep 2

assert_eq "2 audit entries total" "2" \
  "SELECT count(*) FROM ikary_audit_entries WHERE tenant_id = 't-smoke'"

assert_eq "analytics event_count = 2" "2" \
  "SELECT event_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.created'"

assert_eq "2 activity entries total" "2" \
  "SELECT count(*) FROM ikary_activity_entries WHERE tenant_id = 't-smoke'"

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Failure count
# Publish an event whose name ends in `.failed`. The analytics service should
# set failure_count = 1 on its bucket.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 4: Failure count (invoice.failed)"

publish_event "cell.t-smoke.ws-smoke.c-smoke.invoice.failed" \
  "$FIXTURES_DIR/event-invoice-failed.json"

log "Waiting for failure event..."
wait_for_value "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-003'" || true

sleep 2

assert_eq "analytics failure_count = 1 for invoice.failed" "1" \
  "SELECT failure_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.failed'"

assert_eq "analytics event_count = 1 for invoice.failed" "1" \
  "SELECT event_count FROM ikary_analytics_buckets_hourly
   WHERE tenant_id = 't-smoke' AND event_name = 'invoice.failed'"

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Diff vs snapshot
# Publish an event with a non-empty `previous` field. The audit service should
# set change_kind = 'diff' and store {from, to} in the diff column.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 5: Diff vs snapshot (invoice.updated with previous)"

publish_event "cell.t-smoke.ws-smoke.c-smoke.invoice.updated" \
  "$FIXTURES_DIR/event-invoice-updated.json"

log "Waiting for update event..."
wait_for_value "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-smoke-004'" || true

assert_eq "change_kind is diff" "diff" \
  "SELECT change_kind FROM ikary_audit_entries WHERE event_id = 'evt-smoke-004'"

assert_eq "snapshot is null for diff entry" "" \
  "SELECT snapshot FROM ikary_audit_entries WHERE event_id = 'evt-smoke-004'"

assert_eq "diff contains from and to keys" "true" \
  "SELECT (diff ? 'from' AND diff ? 'to')::text
   FROM ikary_audit_entries WHERE event_id = 'evt-smoke-004'"

# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Retention
# Insert an old audit entry directly, then publish a retention event. The
# audit retention consumer should delete the old row but leave recent rows.
# ─────────────────────────────────────────────────────────────────────────────

log_step "Test 6: Retention (delete old audit entries)"

# Seed an old row (occurred_at = 2020-01-01)
pg_query "
  INSERT INTO ikary_audit_entries (
    event_id, event_name, event_version, occurred_at,
    tenant_id, workspace_id, cell_id,
    actor_type, resource_type, resource_id, resource_version,
    change_kind, snapshot, metadata
  ) VALUES (
    'evt-old-001', 'old.event', 1, '2020-01-01T00:00:00Z',
    't-old', 'ws-old', 'c-old',
    'system', 'legacy', 'leg-001', 1,
    'snapshot', '{\"legacy\": true}'::jsonb, '{}'::jsonb
  ) ON CONFLICT DO NOTHING
" >/dev/null

assert_eq "old audit entry seeded" "1" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-old-001'"

# Publish retention event (cutoffDate = 2025-01-01 — after the old row's 2020 date)
publish_event "cell._scheduler._scheduler._scheduler.scheduler.retention.audit" \
  "$FIXTURES_DIR/event-retention-audit.json"

log "Waiting for retention consumer..."
wait_for_value "0" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-old-001'" 45 || true

assert_eq "old audit entry deleted" "0" \
  "SELECT count(*) FROM ikary_audit_entries WHERE event_id = 'evt-old-001'"

assert_eq "recent smoke entries still exist" "4" \
  "SELECT count(*) FROM ikary_audit_entries WHERE tenant_id = 't-smoke'"

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

log_step "Results"

TOTAL=$((PASS_COUNT + FAIL_COUNT))
printf "${CYAN}[smoke]${NC} %d/%d assertions passed\n" "$PASS_COUNT" "$TOTAL"

if [[ $FAIL_COUNT -gt 0 ]]; then
  printf "${RED}[smoke] %d assertion(s) FAILED${NC}\n" "$FAIL_COUNT"
  log "Dumping worker logs for diagnosis..."
  $COMPOSE --profile apps logs worker --tail 100
  exit 1
fi

printf "${GREEN}[smoke] All smoke tests passed!${NC}\n"
