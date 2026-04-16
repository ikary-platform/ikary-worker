### Library rules

Every `libs/*` Node.js / TypeScript package MUST comply with:

- `LIBRARY_STYLE_RULES.md` — naming (`system-*` vs `worker-*`), `microPackageKind`,
  folder layout, Zod, Kysely, no circular deps
- `LIBRARY_TEMPLATE.md` — folder blueprint, export conventions, vitest config template

Key rules at a glance:

- Declare `"microPackageKind"` in `package.json`
- Use `src/shared/` (not `src/contracts/`) for browser-safe Zod schemas and types
- Use `src/server/` for Node/NestJS runtime code in mixed packages
- All runtime DB access must use `@ikary/system-db-core` (Kysely repositories)
- No inline SQL strings outside migrations

### Naming conventions

Libs MUST be prefixed `system-*` (wraps a 3rd-party tool, reusable outside the
worker domain) or `worker-*` (worker-domain packages with business logic).

- `system-*` — wraps a 3rd-party tool with no worker-specific knowledge
  (e.g. `system-amqp` wraps amqplib).
- `worker-*` — domain packages specific to the outbox/event-dispatch problem
  (e.g. `worker-consumer`, `worker-outbox`).

Apps use descriptive names.

Every publishable package shares one version enforced by Changesets `fixed`
config in `.changeset/config.json`. Release everything or nothing. When
adding a new `libs/*` package, add its `@ikary/*` name to the `fixed` array
at the same time.

### Zod contracts rule

Every type that crosses a system boundary (config, external input, service
interface) MUST be defined as a `z.ZodSchema` first, with the TypeScript type
derived via `z.infer<typeof schema>`. Raw `interface` or `type` declarations
are only acceptable for purely structural/generic helpers with no runtime
validation need.

```ts
// Correct
export const amqpOptionsSchema = z.object({ url: z.string().min(1) });
export type AmqpOptions = z.infer<typeof amqpOptionsSchema>;

// Wrong — loses runtime validation
export interface AmqpOptions { url: string; }
```

### Testing

- All `libs/*` packages must maintain 100% coverage (`thresholds` in vitest.config.ts).
- `apps/worker` maintains 90% coverage.
- No real DB or broker in unit tests — mock everything.
- `@swc/core` must be present in any `libs/*` package that uses NestJS decorators
  (tsup needs SWC to emit `emitDecoratorMetadata`).

### NestJS DI rules

- Never use `import type` for a class that is a constructor-injected dependency.
  SWC strips type-only imports; NestJS then captures `Object` instead of the
  class reference in `Reflect.metadata`, leading to undefined injection.
- Use `@Global()` sparingly — only for modules that are genuinely app-wide
  (e.g. `DatabaseModule`).

### Thin-consumer pattern

Every broker consumer in this repo follows the same shape:

- **Consumer class** — `handle(event, tx) { await this.service.method(event, tx); }`.
  One line. No business logic. Imports only the service.
- **Service class** — owns the envelope-to-row mapping, classification, any
  derivation logic. Returns / passes value objects that are Zod-validated.
- **Repository class** — owns all Kysely queries. No inline SQL anywhere else.
  Accepts an optional transaction client so it can ride on the framework's
  receipt + offset transaction.
- **Module** — `FooModule.register({ databaseProviderToken })` provides the
  repository, service, and consumer and exports them. Registering the consumer
  in `ConsumerModule.register({ consumers })` is done at the app level so the
  active consumer set is auditable by reading one file.
- **Cross-aggregate sinks set `ordered: false`** on the IConsumer. Per-aggregate
  projections leave it default (true) so the framework enforces ordering.

See `libs/worker-audit/` for the reference implementation.

### Folder layout for new libs

Follow `LIBRARY_TEMPLATE.md`:

```
src/
  config/<lib>.config.ts          # Zod config schema
  shared/<entry>.schema.ts        # Zod cross-boundary schemas
  shared/index.ts
  server/
    db/schema.ts                  # Kysely table types
    repositories/<domain>.repository.ts
    <lib>.module.ts
    <lib>.tokens.ts
    index.ts
  modules/<domain>/
    <domain>.service.ts
    <domain>.consumer.ts
  index.ts                        # shared surface exports
```

The older flat `src/server/` layout in `worker-consumer` predates this
convention — new libs use the structure above.
