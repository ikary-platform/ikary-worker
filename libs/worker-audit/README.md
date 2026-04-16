# @ikary/worker-audit

## Export Surface

- **Shared root (`@ikary/worker-audit`)** — browser-safe Zod schemas and types (`auditEntrySchema`, `AuditEntry`, `auditActorTypeSchema`, `auditChangeKindSchema`). Use these in UIs and read APIs.
- **Server (`@ikary/worker-audit/server`)** — `WorkerAuditModule`, `AuditService`, `AuditRepository`, `AuditConsumer`, Kysely schema types, DI tokens.

## Purpose

Ships an OOTB consumer that derives a rich audit-trail row from every `DomainEventEnvelope` published through `@ikary/worker`. One row per event; idempotent under at-least-once delivery; thin consumer + domain service + Kysely repository.

Per the repo's thin-consumer convention: the consumer class body is a single call to `AuditService.record(event, tx)`. The service does the envelope→row mapping (incl. change-kind inference from `previous`/`data`) and delegates to `AuditRepository.insertIfNotExists`. No inline SQL anywhere.

## Installation

Workspace-linked:
```json
"@ikary/worker-audit": "workspace:*"
```

## Migrations

Run the migration in `migrations/v0.1.0/` — creates `ikary_audit_entries` plus two indexes. The `ikary local db migrate` CLI applies it automatically: `@ikary/worker-audit` is in the CLI's built-in default package list.

## Configuration

```ts
WorkerAuditModule.register({
  databaseProviderToken: DatabaseService,   // any NestJS token exposing a Kysely DatabaseService
})
```

Host's DB schema must include `ikary_audit_entries`:
```ts
type AppDatabase =
  & ConsumerDatabaseSchema
  & WorkerAuditDatabaseSchema
  & /* your own tables */ ;
```

## Usage in NestJS

```ts
import { Module } from '@nestjs/common';
import { ConsumerModule, CONSUMER } from '@ikary/worker-consumer/server';
import { WorkerAuditModule, AuditConsumer } from '@ikary/worker-audit/server';
import { DatabaseService } from '@ikary/system-db-core';

@Module({
  imports: [
    WorkerAuditModule.register({ databaseProviderToken: DatabaseService }),
    ConsumerModule.register({
      databaseProviderToken: DatabaseService,
      consumers: [
        { provide: CONSUMER, useClass: AuditConsumer, multi: true },
      ],
    }),
  ],
})
export class AppModule {}
```

## Example query (read side)

```ts
// Via Kysely, using the exported WorkerAuditDatabaseSchema
const history = await db
  .selectFrom('ikary_audit_entries')
  .selectAll()
  .where('tenant_id', '=', tenantId)
  .where('resource_type', '=', 'invoice')
  .where('resource_id', '=', invoiceId)
  .orderBy('resource_version', 'desc')
  .execute();
```

Rows conform to `WorkerAuditEntriesTable`; parse into an `AuditEntry` at the API boundary with `auditEntrySchema`.

## Security/Isolation Notes

- `redaction_applied` is a structural column for downstream redaction pipelines; v0.1 writes `false` unconditionally. If your ingest contains PII, run redaction in the producer OR add a redaction step inside `AuditService.buildEntry` before the insert.
- Actor trust — the audit row trusts the envelope's `actor` fields. Upstream (`cell-runtime-api` or equivalent) must authenticate the actor before producing the event.
- Retention — v0.1 has no cleanup job. `ikary_audit_entries` grows unbounded; plan a cron or partition strategy per your compliance requirements.

## Versioning

Part of the ikary-worker fixed-group in `.changeset/config.json`. Releases with `@ikary/worker`, `@ikary/system-amqp`, `@ikary/worker-consumer`, and the sibling projection libs.

## Breaking Changes

Changes to `AuditConsumer.name` or `eventTypes` rebind the queue in production. Treat them as breaking: bump major and document the re-bind steps.
