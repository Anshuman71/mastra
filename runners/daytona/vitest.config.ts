import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit:runners/daytona',
    isolate: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
