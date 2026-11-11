import { defineConfig } from 'vitest/config';
import { workerSourcePlugin } from './tools/worker-source.mjs';

export default defineConfig({
  plugins: [workerSourcePlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    // a hung test fails fast instead of blocking the whole run
    testTimeout: 20_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,
  },
});
