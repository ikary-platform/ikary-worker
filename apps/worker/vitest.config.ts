import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    // Point workspace packages to their source so Vitest doesn't need a
    // pre-built dist/. Sub-path aliases must come before the root alias.
    alias: {
      '@ikary/system-amqp/server':          resolve(__dirname, '../../libs/system-amqp/src/server/index.ts'),
      '@ikary/system-amqp':                 resolve(__dirname, '../../libs/system-amqp/src/index.ts'),
      '@ikary/worker-consumer/server':      resolve(__dirname, '../../libs/worker-consumer/src/server/index.ts'),
      '@ikary/worker-consumer':             resolve(__dirname, '../../libs/worker-consumer/src/index.ts'),
      '@ikary/worker-audit/server':         resolve(__dirname, '../../libs/worker-audit/src/server/index.ts'),
      '@ikary/worker-audit':                resolve(__dirname, '../../libs/worker-audit/src/index.ts'),
      '@ikary/worker-analytics/server':     resolve(__dirname, '../../libs/worker-analytics/src/server/index.ts'),
      '@ikary/worker-analytics':            resolve(__dirname, '../../libs/worker-analytics/src/index.ts'),
      '@ikary/worker-activity-feed/server': resolve(__dirname, '../../libs/worker-activity-feed/src/server/index.ts'),
      '@ikary/worker-activity-feed':        resolve(__dirname, '../../libs/worker-activity-feed/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/main.ts',
        'src/**/*.module.ts',               // module wiring — tested via smoke, not unit
        'src/config/env.ts',                // thin Zod parse of process.env
        'src/health/*.ts',                  // trivial passthrough controller
        'src/adapters/null.adapter.ts',     // no-op adapter (no logic to test)
      ],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
