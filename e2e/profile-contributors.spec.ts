import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const WRANGLER_BIN = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
// 只有假 playerdb 認得這個名稱；真服務會回 400 invalid_username
const E2E_MC_NAME = 'MLF_E2E';
const E2E_MC_UUID = '0123456789abcdef0123456789abcdef';

function d1(sql: string): void {
  execFileSync(process.execPath, [WRANGLER_BIN, 'd1', 'execute', 'DB', '--local', '--command', sql], { stdio: 'pipe' });
}

async function testLogin(page: Page, providerUserId: string, displayName: string): Promise<void> {
  const status = await page.evaluate(async ({ id, name }) => {
    const me = await fetch('/api/v1/me');
    const { data } = (await me.json()) as { data: { csrfToken: string } };
    const res = await fetch('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
      body: JSON.stringify({ provider: 'discord', providerUserId: id, username: id, displayName: name }),
    });
    return res.status;
  }, { id: providerUserId, name: displayName });
  expect(status).toBe(200);
}

test('a contributor edits the profile and appears on the contributor pages', async ({ page }) => {
  // 每次執行用新身分，避免本機 D1 殘留的名稱或頻率紀錄影響結果
  const stamp = Date.now();
  const providerUserId = `e2e-profile-${stamp}`;
  const newName = `E2E 改名 ${stamp % 100000}`;
  await page.route('https://mc-heads.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));

  await page.goto('/me/');
  await expect(page.getByText(/請從右上角登入/)).toBeVisible();
  await testLogin(page, providerUserId, 'E2E 貢獻者');
  await page.reload();

  await page.getByLabel('顯示名稱', { exact: true }).fill(newName);
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已儲存。' })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: newName })).toBeVisible();

  await page.getByLabel('玩家名稱').fill(E2E_MC_NAME);
  await page.getByRole('button', { name: '確認並儲存' }).click();
  await expect(page.getByText(E2E_MC_NAME, { exact: true })).toBeVisible();
  await expect(page.getByText('未驗證', { exact: true })).toBeVisible();

  // 已發佈的建議直接寫入本機 D1；完整發佈流程由 review-publish.spec 覆蓋（平行執行時避免爭用發佈鎖）
  d1(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
      SELECT 'create', 'e2e.profile.${stamp}', 'x', user_id, 'e2e', 'published', '2026-10-16T00:00:00.000Z'
      FROM identities WHERE provider = 'discord' AND provider_user_id = '${providerUserId}'`);

  const list = await page.request.get('/contributors/?mod=create');
  expect(list.headers()['content-security-policy']).toContain('https://mc-heads.net');

  await page.goto('/contributors/?mod=create');
  const link = page.getByRole('link', { name: newName });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/contributors\/\d+\/$/);

  const shell = await page.request.get(href!);
  expect(shell.headers()['content-security-policy']).toContain('https://mc-heads.net');
  expect(shell.headers()['x-frame-options']).toBeTruthy();

  await link.click();
  await expect(page.getByRole('heading', { name: newName })).toBeVisible();
  await expect(page.getByRole('link', { name: 'create' })).toHaveAttribute('href', '/mods/create/');
  await expect(page.locator(`img[src*="${E2E_MC_UUID}"]`).first()).toBeVisible();

  // 無斜線的網址 301 到頁殼
  const bare = await page.request.get(href!.replace(/\/$/, ''), { maxRedirects: 0 });
  expect(bare.status()).toBe(301);
});

test('a hidden contributor profile says not found', async ({ page }) => {
  await page.goto('/contributors/999999999/');
  await expect(page.getByText(/找不到這位貢獻者/)).toBeVisible();
});
