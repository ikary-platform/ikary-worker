# ──────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for ikary-worker apps (worker | scheduler)
#
# Build context: parent directory containing both ikary-worker/ and
# ikary-manifest/ as siblings. The pnpm overrides in ikary-worker/package.json
# use link:../ikary-manifest/... which resolves correctly inside the container.
#
# Usage:
#   docker build -f ikary-worker/Dockerfile --build-arg APP=worker -t ikary-worker ..
#   docker build -f ikary-worker/Dockerfile --build-arg APP=scheduler -t ikary-scheduler ..
# ──────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=24.14.1
FROM node:${NODE_VERSION}-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── Stage 1: Install manifest dependencies ──────────────────────────────────
FROM base AS manifest-deps
COPY ikary-manifest/pnpm-lock.yaml ikary-manifest/pnpm-workspace.yaml \
     ikary-manifest/package.json ikary-manifest/tsconfig.base.json \
     ikary-manifest/turbo.json \
     ./ikary-manifest/
# Package.json files for the subset needed by ikary-worker
COPY ikary-manifest/libs/cell-contract/package.json         ikary-manifest/libs/cell-contract/package.json
COPY ikary-manifest/libs/cell-engine/package.json           ikary-manifest/libs/cell-engine/package.json
COPY ikary-manifest/libs/cell-loader/package.json           ikary-manifest/libs/cell-loader/package.json
COPY ikary-manifest/libs/cell-runtime-core/package.json     ikary-manifest/libs/cell-runtime-core/package.json
COPY ikary-manifest/libs/cell-primitive-contract/package.json ikary-manifest/libs/cell-primitive-contract/package.json
COPY ikary-manifest/libs/system-db-core/package.json        ikary-manifest/libs/system-db-core/package.json
COPY ikary-manifest/libs/system-log-core/package.json       ikary-manifest/libs/system-log-core/package.json
COPY ikary-manifest/libs/system-migration-core/package.json ikary-manifest/libs/system-migration-core/package.json
COPY ikary-manifest/libs/system-localization/package.json   ikary-manifest/libs/system-localization/package.json
COPY ikary-manifest/apps/cli/package.json                   ikary-manifest/apps/cli/package.json
WORKDIR /app/ikary-manifest
RUN pnpm install --frozen-lockfile \
      --filter @ikary/cli... \
      --filter @ikary/system-log-core...

# ── Stage 2: Build manifest packages ────────────────────────────────────────
# WORKDIR is /app/ikary-manifest (inherited), so dest paths are relative to it
FROM manifest-deps AS manifest-build
COPY ikary-manifest/libs/cell-contract/           ./libs/cell-contract/
COPY ikary-manifest/libs/cell-engine/             ./libs/cell-engine/
COPY ikary-manifest/libs/cell-loader/             ./libs/cell-loader/
COPY ikary-manifest/libs/cell-runtime-core/       ./libs/cell-runtime-core/
COPY ikary-manifest/libs/cell-primitive-contract/  ./libs/cell-primitive-contract/
COPY ikary-manifest/libs/system-db-core/          ./libs/system-db-core/
COPY ikary-manifest/libs/system-log-core/         ./libs/system-log-core/
COPY ikary-manifest/libs/system-migration-core/   ./libs/system-migration-core/
COPY ikary-manifest/libs/system-localization/     ./libs/system-localization/
COPY ikary-manifest/apps/cli/                     ./apps/cli/
RUN pnpm build \
      --filter @ikary/system-db-core \
      --filter @ikary/cell-contract \
      --filter @ikary/cell-runtime-core \
      --filter @ikary/system-log-core \
      --filter @ikary/system-migration-core \
      --filter @ikary/cli

# ── Stage 3: Install worker dependencies ────────────────────────────────────
FROM base AS worker-deps
# Bring built manifest into the same relative layout
COPY --from=manifest-build /app/ikary-manifest/ ./ikary-manifest/
# Copy only package.json files for cache-friendly dependency install
COPY ikary-worker/pnpm-lock.yaml ikary-worker/pnpm-workspace.yaml \
     ikary-worker/package.json ikary-worker/tsconfig.base.json \
     ./ikary-worker/
COPY ikary-worker/libs/system-amqp/package.json         ikary-worker/libs/system-amqp/package.json
COPY ikary-worker/libs/worker-consumer/package.json     ikary-worker/libs/worker-consumer/package.json
COPY ikary-worker/libs/worker-audit/package.json        ikary-worker/libs/worker-audit/package.json
COPY ikary-worker/libs/worker-analytics/package.json    ikary-worker/libs/worker-analytics/package.json
COPY ikary-worker/libs/worker-activity-feed/package.json ikary-worker/libs/worker-activity-feed/package.json
COPY ikary-worker/apps/worker/package.json              ikary-worker/apps/worker/package.json
COPY ikary-worker/apps/scheduler/package.json           ikary-worker/apps/scheduler/package.json
WORKDIR /app/ikary-worker
RUN pnpm install --frozen-lockfile

# ── Stage 4: Build all worker packages ──────────────────────────────────────
# WORKDIR is /app/ikary-worker (inherited), so dest paths are relative to it
FROM worker-deps AS worker-build
COPY ikary-worker/turbo.json       ./turbo.json
COPY ikary-worker/libs/            ./libs/
COPY ikary-worker/apps/            ./apps/
COPY ikary-worker/ikary.config.json ./ikary.config.json
RUN pnpm run build

# ── Stage 5: Production image ──────────────────────────────────────────────
FROM base AS production
ARG APP=worker
ENV NODE_ENV=production
ENV APP_NAME=${APP}

WORKDIR /app/ikary-worker

# Root package.json (needed for pnpm workspace resolution)
COPY --from=worker-deps /app/ikary-worker/package.json ./package.json
COPY --from=worker-deps /app/ikary-worker/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Root node_modules (workspace symlinks)
COPY --from=worker-deps /app/ikary-worker/node_modules/ ./node_modules/

# Built libs (dist + package.json + migrations)
COPY --from=worker-build /app/ikary-worker/libs/ ./libs/

# Selected app dist + package.json + node_modules (pnpm hoists per-package deps)
COPY --from=worker-build /app/ikary-worker/apps/${APP}/dist/ ./apps/${APP}/dist/
COPY --from=worker-deps  /app/ikary-worker/apps/${APP}/package.json ./apps/${APP}/package.json
COPY --from=worker-deps  /app/ikary-worker/apps/${APP}/node_modules/ ./apps/${APP}/node_modules/

# Scheduler migrations (always included — harmless if running worker)
COPY --from=worker-build /app/ikary-worker/apps/scheduler/migrations/ ./apps/scheduler/migrations/
COPY --from=worker-deps  /app/ikary-worker/apps/scheduler/package.json ./apps/scheduler/package.json

# Migration config
COPY --from=worker-build /app/ikary-worker/ikary.config.json ./ikary.config.json

# Manifest packages needed at runtime (built dist + migrations + package.json)
COPY --from=manifest-build /app/ikary-manifest/ /app/ikary-manifest/

EXPOSE 3002 3003
CMD ["sh", "-c", "node apps/${APP_NAME}/dist/main.js"]
