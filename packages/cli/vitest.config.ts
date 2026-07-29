// packages/cli/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // Docker container startup and the integration test's Go build take time
  },
})
