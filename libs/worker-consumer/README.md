# @ikary/worker-consumer

RabbitMQ consumer framework for IKARY workers.

## Package Kind

`mixed-shared-server`

## Purpose

Provides the primitives every broker consumer needs, so downstream private applications (audit logger, metrics collector, webhook dispatcher, projection updaters, …) only have to implement `handle(event, tx)`:

- Queue + binding lifecycle per consumer
- Durable queues, persistent messages
- Manual ack with handler + receipt + offset all in one DB transaction
- Idempotency via `ikary_event_consumer_receipts`
- Gap detection via `ikary_event_consumer_offsets`
- Bounded retry via republish-to-self with `x-retry-count` header
- Automatic re-subscription after RabbitMQ reconnects
- Graceful shutdown (cancel consumer tags before closing)

## Scaling model

Two orthogonal knobs on every consumer:

| Knob | Controls | Example |
|---|---|---|
| `name` | Horizontal scaling (shared queue across pods of the same service). Same name = competing consumers; RabbitMQ delivers each message to exactly one pod. | 4 pods with `name: 'metrics'` share `ikary.metrics` |
| `eventTypes` | Fan-out (topic routing). Different names = different queues = each receives its own copy. | `audit` with `'#'` receives everything; `webhooks` with `'invoice.*'` receives only invoice events |

Broadcast events (`system.shutdown`, etc.) are not a special mechanism — consumers opt in by including the pattern in their `eventTypes`.

## Migrations

Run the migrations in `migrations/v0.1.0/` before first boot. They create two tables:

- `ikary_event_consumer_receipts` — idempotency
- `ikary_event_consumer_offsets` — gap detection

Use the `ikary local db migrate` CLI — `@ikary/worker-consumer` is in its built-in default package list, so the CLI applies these migrations automatically when run from any project that installs this package.

## Usage in NestJS

```ts
import { Module } from '@nestjs/common';
import { WorkerModule } from '@ikary/worker';
import { ConsumerModule, CONSUMER } from '@ikary/worker-consumer/server';
import { DatabaseService } from '@ikary/system-db-core';

@Injectable()
class AuditConsumer implements IConsumer {
  readonly name = 'audit';
  readonly eventTypes = ['#'];                    // everything

  async handle(event, tx) {
    await tx.insertInto('audit_log').values({ /* ... */ }).execute();
  }
}

@Module({
  imports: [
    WorkerModule.register(),
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: [
        { provide: CONSUMER, useClass: AuditConsumer, multi: true },
      ],
      options: {
        prefetch: 32,         // default
        maxRetries: 5,        // default
      },
    }),
  ],
})
export class AppModule {}
```

## Configuration

All options are optional with sensible defaults:

| Option | Default | Meaning |
|---|---|---|
| `queuePrefix` | `ikary.` | Prepended to each consumer's queue name |
| `exchange` | `cell.events` | Topic exchange consumers bind to |
| `prefetch` | `32` | Unacked messages per pod |
| `maxRetries` | `5` | Retries before routing to DLX |
| `dlx` | `cell.events.dlx` | Dead-letter exchange |

## Versioning

Shares the fixed group with `@ikary/worker` and `@ikary/system-amqp` — all three release together.
