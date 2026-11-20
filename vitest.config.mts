import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  resolve: { alias: { '@puesto/shared': resolve('packages/shared/src/index.ts') } },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 40000, hookTimeout: 40000 },
})
