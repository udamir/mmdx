import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // a hung test fails fast instead of blocking the whole run
    testTimeout: 20_000,
    hookTimeout: 20_000,
    teardownTimeout: 10_000,
  },
});
