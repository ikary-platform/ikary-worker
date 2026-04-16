---
"@ikary/worker": minor
"@ikary/system-amqp": minor
"@ikary/worker-consumer": minor
---

New `@ikary/worker-consumer` library — the missing half of the framework:

- `IConsumer` contract: `name` (scaling) × `eventTypes` (fan-out) as two orthogonal knobs — same-name pods compete for a shared queue, different names get independent queues bound to the topic exchange
- `ConsumerModule.register({ consumers, options })` matches the `WorkerModule.register()` shape
- `ConsumerRunner` per-consumer message loop: poison message → DLX, retry cap via republish-to-self with `x-retry-count`, idempotency via `ikary_event_consumer_receipts`, gap detection via `ikary_event_consumer_offsets`
- Handler runs inside a Kysely transaction that also inserts the receipt and advances the offset — atomic-or-nothing
- Automatic re-subscription after RabbitMQ reconnects (listens for channel close, polls for fresh channel)
- Graceful shutdown: cancels consumer tags before the AMQP connection is closed
- `ConsumerHealthIndicator` for Kubernetes readiness probes
- Two new tables (`ikary_event_consumer_receipts`, `ikary_event_consumer_offsets`) with migrations in `migrations/v0.1.0/`
- 100% test coverage (67 tests across 8 spec files)

Downstream private applications now only implement `handle(event, tx)` — the framework takes care of queue lifecycle, idempotency, gap detection, retries, and reconnection.
