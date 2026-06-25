import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
      exclude: ['src/server/supabase/**'],
      thresholds: {
        branches: 55,
        functions: 75,
        lines: 75,
        statements: 70,
      },
    },
  },
});
