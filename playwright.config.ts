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
// 假 GitHub 佔用 E2E_PORT + 1：並行 worktree 的 E2E_PORT 至少要差 2。
const FAKE_GITHUB_PORT = PORT + 1;
const FAKE_GITHUB_ORIGIN = `http://localhost:${FAKE_GITHUB_PORT}`;

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
  webServer: [
    {
      command: 'npx tsx e2e/fake-github.ts',
      url: `${FAKE_GITHUB_ORIGIN}/__state`,
      env: { FAKE_GITHUB_PORT: String(FAKE_GITHUB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx tsx e2e/prepare-dev-vars.ts && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT} --var SITE_URL:${ORIGIN} --var GITHUB_API_BASE:${FAKE_GITHUB_ORIGIN}`,
      url: ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
