import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:48732',
    headless: true,
    launchOptions: !process.env.CI && existsSync(edge) ? { executablePath: edge } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:48732/api/status',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
