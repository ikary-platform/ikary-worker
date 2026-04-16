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
