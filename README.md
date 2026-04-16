# ikary-worker

OSS transactional outbox poller and pluggable event dispatcher for the IKARY platform.

## Architecture

`ikary-worker` is a **framework, not an application**. It ships the outbox polling loop and a plugin interface. Platform-specific handler implementations live in a separate, private package that imports this repo as a library — mirroring how NestJS is OSS but your app is private.

```
cell-runtime-api  ──writes──►  domain_event_outbox
                                       │
                               ikary-worker polls
                                       │
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                  IEventHandler  IEventHandler  IBrokerAdapter
                  (private pkg)  (private pkg)  (RabbitMQ / SQS / …)
                                                       │
                                              consumers / queues
```

Each unprocessed outbox row is:
1. Parsed and validated against `DomainEventEnvelopeSchema`.
2. Dispatched to every matching `IEventHandler` (in registration order).
3. Published to the broker adapter unconditionally.

Handlers are **additional side-effects** — the broker adapter is always called.

## Monorepo Layout

| Path | Package | Purpose |
|------|---------|---------|
| `apps/worker` | `@ikary/worker` | NestJS poller + dispatcher app, wires OOTB consumers |
| `libs/system-amqp` | `@ikary/system-amqp` | AMQP connection + publisher + routing-key helpers |
| `libs/worker-consumer` | `@ikary/worker-consumer` | IConsumer framework: queue lifecycle, idempotency, gap detection, retries |
| `libs/worker-audit` | `@ikary/worker-audit` | OOTB audit-trail consumer — writes `ikary_audit_entries` |
| `libs/worker-analytics` | `@ikary/worker-analytics` | OOTB analytics consumer — hourly buckets in `ikary_analytics_buckets_hourly` |
| `libs/worker-activity-feed` | `@ikary/worker-activity-feed` | OOTB user-facing feed — writes `ikary_activity_entries` |

## Extending the worker (enterprise)

`ikary-worker` is designed as the **foundation for a downstream enterprise worker**. A private `ikary-enterprise-worker` repo composes on top by importing the OSS libs and adding its own consumers + domain libs — no fork, no plugin system, just NestJS module composition:

```ts
@Module({
  imports: [
    WorkerModule.register(),

    // Keep the OSS projections you want:
    WorkerAuditModule.register({ databaseProviderToken: DatabaseService }),
    WorkerActivityFeedModule.register({ databaseProviderToken: DatabaseService }),
    // Skip WorkerAnalyticsModule — enterprise has its own analytics stack

    // Add enterprise modules:
    WorkflowEngineModule.register({ databaseProviderToken: DatabaseService }),
    NotificationModule.register({ databaseProviderToken: DatabaseService }),

    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: [
        { provide: CONSUMER, useClass: AuditConsumer,          multi: true as const },
        { provide: CONSUMER, useClass: ActivityFeedConsumer,   multi: true as const },
        { provide: CONSUMER, useClass: WorkflowEngineConsumer, multi: true as const },
        { provide: CONSUMER, useClass: NotificationConsumer,   multi: true as const },
      ],
    }),
  ],
})
export class EnterpriseAppModule {}
```

**How to extend cleanly:**

1. **Pick OSS defaults à la carte** — import only the `Worker*Module` wrappers you want.
2. **Follow the thin-consumer convention** — your enterprise consumers' `handle` method is one line (`await this.service.method(event, tx)`); business logic lives in services; Kysely stays in repositories. See `libs/worker-audit/` for the reference shape.
3. **Compose the DB schema type** — your `DatabaseService` schema must extend the union of every OSS schema + your own:
   ```ts
   type EnterpriseDatabase =
     & ConsumerDatabaseSchema                 // from @ikary/worker-consumer/server
     & WorkerAuditDatabaseSchema              // from @ikary/worker-audit/server
     & WorkerAnalyticsDatabaseSchema          // (if you keep analytics)
     & WorkerActivityFeedDatabaseSchema       // (if you keep activity-feed)
     & WorkflowEngineDatabaseSchema           // your own
     & NotificationDatabaseSchema;            // your own
   ```
4. **Reuse the shared Zod schemas** — each OSS lib exports boundary Zod schemas (`auditEntrySchema`, `analyticsBucketSchema`, `activityEntrySchema`) that your enterprise UI/API can parse against.
5. **Migrations** — enterprise's own migrate script lists its `@ikary/*` packages in addition to the OSS set. The `ikary local db migrate` CLI handles any combination that's installed.

## Quickstart — local dev

```bash
# Start PostgreSQL and RabbitMQ
docker compose up -d

# Install dependencies
pnpm install

# Run with file-watch
pnpm --filter @ikary/worker start:dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | _(required)_ | PostgreSQL connection string |
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ AMQP URL |
| `OUTBOX_POLL_INTERVAL_MS` | `2000` | Poll interval in milliseconds |
| `OUTBOX_BATCH_SIZE` | `50` | Max rows per poll cycle |
| `OUTBOX_MAX_RETRIES` | `5` | Reference value for max retry attempts |
| `RABBITMQ_EXCHANGE` | `cell.events` | Topic exchange name |
| `RABBITMQ_DLX` | `cell.events.dlx` | Dead-letter fanout exchange name |
| `PORT` | `3002` | HTTP port (health endpoint) |

## Registering Handlers — private downstream package

```ts
// In your private app's AppModule:
import { Module } from '@nestjs/common';
import { WorkerModule, EVENT_HANDLER } from '@ikary/worker';
import { InvoiceCreatedHandler } from './handlers/invoice-created.handler';

@Module({
  imports: [
    WorkerModule.register({
      handlers: [
        { provide: EVENT_HANDLER, useClass: InvoiceCreatedHandler, multi: true },
      ],
    }),
  ],
})
export class AppModule {}
```

```ts
// InvoiceCreatedHandler
import type { IEventHandler } from '@ikary/worker';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InvoiceCreatedHandler implements IEventHandler {
  readonly eventNames = 'invoice.*';   // wildcard matches invoice.created, invoice.updated, …

  async handle(event: DomainEventEnvelope): Promise<void> {
    // your domain logic here
  }
}
```

`eventNames` supports:
- Exact string: `"invoice.created"`
- `"*"` suffix wildcard: `"invoice.*"` matches any name starting with `"invoice."`
- Array of either: `["invoice.created", "invoice.updated"]`

## Swapping the Broker Adapter

```ts
WorkerModule.register({
  brokerAdapter: { provide: BROKER_ADAPTER, useClass: SqsAdapter },
})
```

Ship `NullAdapter` is included for tests and local dev without a broker:

```ts
import { NullAdapter } from '@ikary/worker';

WorkerModule.register({
  brokerAdapter: { provide: BROKER_ADAPTER, useClass: NullAdapter },
})
```

## Adding a New Library

1. Create `libs/<lib-name>/` following the layout in `LIBRARY_TEMPLATE.md`.
2. Name it `system-<tool>` (infra wrapper) or `worker-<domain>` (domain logic).
3. Add `"@ikary/<lib-name>"` to the `fixed` array in `.changeset/config.json`.
4. Run `pnpm install` to register the workspace package.

See `LIBRARY_STYLE_RULES.md` for the full rule set.

## Development Scripts

```bash
pnpm build        # Build all packages via Turbo
pnpm typecheck    # Type-check all packages
pnpm test         # Run all tests via Vitest workspace
pnpm format       # Format with Prettier
pnpm changeset    # Create a new changeset
pnpm release      # Build + publish all packages
```

## License

MIT
