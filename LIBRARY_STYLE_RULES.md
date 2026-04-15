# Worker Library Style Rules

These rules define how every new `libs/*` package must be designed and delivered in this repository.

## 1) Scope and Goal

- A library must have one clear domain purpose (single responsibility).
- A library must be reusable by multiple apps.
- A library must be framework-friendly for NestJS integration.
- Do not duplicate types or repository logic already exported from `@ikary/cell-runtime-core`.

## 2) Stack Alignment

- Language: TypeScript (strict mode).
- Backend integration target: NestJS.
- Database: PostgreSQL — accessed via `@ikary/system-db-core` (Kysely only).
- Validation: Zod for all external inputs and configuration.
- Migrations: raw SQL files only.
- No inline SQL outside migrations and approved `sql\`\`` edge cases.

## 3) Naming Rules

Libraries in this repo use two prefixes:

- `system-*` — wraps a 3rd-party tool with no worker-domain knowledge
  (e.g. `system-amqp`, `system-redis`). Re-usable outside this repo.
- `worker-*` — worker-domain packages with business logic
  (e.g. `worker-core`, `worker-handlers`). Depends on `@ikary/cell-contract`.

Package name: `@ikary/<lib-name>`.

Migration files: `NNN_<lib>_<module>_<action>.sql`
Example: `001_worker_outbox_add_dlx_column.sql`

## 4) Package Kind and Export Surface

Every library MUST declare `microPackageKind` in `package.json`:

- `shared` — browser-safe schemas and types, no framework imports.
- `server` — NestJS / Node runtime, package root only.
- `mixed-shared-server` — shared root + `./server` subpath for NestJS integration.

Use explicit `exports` in every `libs/*/package.json`.

## 5) Required Library Structure

```
libs/<lib-name>/
  src/
    config/         Zod config schema
    modules/        domain modules, services, repositories
    shared/         browser-safe Zod schemas and types (NOT src/contracts/)
    server/         NestJS runtime — only for mixed-shared-server
  migrations/
    v1.0.0/
      001_<lib>_<module>_<action>.sql
  package.json
  tsconfig.json
  README.md
  vitest.config.ts
```

## 6) Database Rules

- All primary keys: UUID.
- Runtime DB access via Kysely repositories built on `@ikary/system-db-core`.
- No raw SQL in services or controllers.

## 7) Architecture Rules

- Separation of domain logic, NestJS integration, and adapter/port logic.
- Dependency injection for all services and ports.
- No circular dependencies.
- Public API exported from `src/index.ts` only.

## 8) Configuration

- All runtime config validated by Zod.
- Sensible defaults for every optional variable.

## 9) Changesets

- Every publishable `libs/*` package: add its `@ikary/*` name to the `fixed`
  array in `.changeset/config.json` at the same time the package is created.
- All packages release together (lockstep versioning).

## 10) Definition of Done

- `pnpm typecheck` passes.
- `pnpm test` passes with ≥ 90% coverage.
- `pnpm build` produces dist/.
- README is complete (purpose, install, config, NestJS wiring example).
- Migration files follow naming rule and execute in order.
- `@ikary/*` name added to `.changeset/config.json` fixed array.
