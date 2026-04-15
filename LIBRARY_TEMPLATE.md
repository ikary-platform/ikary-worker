# Worker Library Template

Copy-paste baseline for a new `libs/*` package in this repository.

## 1) Folder Blueprint

```text
libs/<lib-name>/
  src/
    config/
      <lib>.config.ts        Zod schema + getConfig() helper
    modules/
      <module-a>/
        <module-a>.service.ts
        <module-a>.repository.ts  (if the lib owns DB access)
        <module-a>.spec.ts
    shared/                  browser-safe Zod schemas and TypeScript types
      index.ts
    server/                  NestJS runtime — only for mixed-shared-server packages
      index.ts
    index.ts                 exports shared surface only
  migrations/
    v1.0.0/
      001_<lib>_<module>_create_<table>.sql
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
```

## 2) Quick Start Checklist

1. Choose a name: `system-<tool>` or `worker-<domain>`.
2. Set `"name": "@ikary/<lib-name>"` in `package.json`.
3. Choose `microPackageKind` (`shared`, `server`, or `mixed-shared-server`).
4. Add the `@ikary/<lib-name>` entry to `.changeset/config.json` → `fixed[0]`.
5. Write Zod config schema in `src/config/`.
6. Implement domain logic in `src/modules/`.
7. Expose only the intended surface from `src/index.ts`.
8. Add `vitest.config.ts` using the pattern below.
9. Write tests; aim for ≥ 90% coverage.
10. Document in `README.md`.

## 3) Export Conventions

### Pure server (`microPackageKind: "server"`)

```json
{
  "name": "@ikary/<lib-name>",
  "version": "0.1.0",
  "license": "MIT",
  "microPackageKind": "server",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "types":   "./src/index.ts",
      "import":  "./dist/index.js"
    }
  },
  "scripts": {
    "build":     "tsup src/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test":      "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Mixed shared + server (`microPackageKind: "mixed-shared-server"`)

```json
{
  "microPackageKind": "mixed-shared-server",
  "exports": {
    ".": {
      "types":   "./src/index.ts",
      "import":  "./dist/index.js"
    },
    "./server": {
      "types":   "./src/server/index.ts",
      "import":  "./dist/server/index.js"
    }
  }
}
```

## 4) tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 5) vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/index.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

## 6) NestJS Integration Example

```ts
// In the consuming app's AppModule:
import { Module } from '@nestjs/common';
import { MyLibModule } from '@ikary/<lib-name>/server';

@Module({
  imports: [
    MyLibModule.register({
      // validated config here
    }),
  ],
})
export class AppModule {}
```

## 7) Migration Naming

`NNN_<lib>_<module>_<action>.sql`

Examples:
- `001_worker_dlq_create_table.sql`
- `002_system_amqp_add_retry_column.sql`

## 8) README Template Sections

```md
# @ikary/<lib-name>

## Package Kind
## Purpose
## Installation
## Migrations
## Configuration
## Usage in NestJS
## Versioning
```

## 9) Reuse Rule

Enforce all constraints in `LIBRARY_STYLE_RULES.md` before opening a PR.
