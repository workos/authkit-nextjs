import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests start real servers on 127.0.0.1. They are kept out of the
// default `pnpm test` run, which only matches `**/*.spec.ts(x)`.
export default defineConfig({
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 15_000,
  },
});
