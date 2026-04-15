import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    // Point workspace packages to their source so Vitest doesn't need a
    // pre-built dist/. Sub-path aliases must come before the root alias.
    alias: {
      '@ikary/system-amqp/server': resolve(__dirname, '../../libs/system-amqp/src/server/index.ts'),
      '@ikary/system-amqp':        resolve(__dirname, '../../libs/system-amqp/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/index.ts', 'src/main.ts'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
