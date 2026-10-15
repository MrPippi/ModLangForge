import { defineConfig, devices } from '@playwright/test';

const DEFAULT_PORT = 8787;

function e2ePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}

// 多個 worktree 同時跑 E2E 時以 E2E_PORT 指定不同埠，避免沿用到其他 worktree 的 server。
const PORT = e2ePort(process.env.E2E_PORT);
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT} --var SITE_URL:${ORIGIN}`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
