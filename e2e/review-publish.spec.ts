import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 8787);
const FAKE_GITHUB = `http://localhost:${PORT + 1}`;
const KEY = 'block.create.shaft';
const ADMIN_ID = 'e2e-admin';

// 本機 D1 可能已有別的 admin（bootstrap 只在尚無 admin 時生效），所以登入後直接把 E2E 身分升為 admin，與先前執行無關。
function promoteToAdmin(): void {
  const sql = `UPDATE users SET role='admin' WHERE id=(SELECT user_id FROM identities WHERE provider='github' AND provider_user_id='${ADMIN_ID}')`;
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--command', `"${sql}"`], { stdio: 'pipe', shell: true });
}

test('anonymous suggestion is approved by an admin and published as one commit', async ({ page, request }) => {
  // 重試或 reuseExistingServer 時假 GitHub 可能留有上一次的提交
  expect((await request.post(`${FAKE_GITHUB}/__reset`)).status()).toBe(204);
  const marker = `E2E${Date.now()}`;
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w"},remove(){}};',
    }));

  await page.goto('/mods/create/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await page.getByRole('button', { name: `建議修改 ${KEY}` }).click();
  await page.getByLabel('建議譯文').fill(`傳動軸${marker}`);
  await page.getByRole('button', { name: '送出建議' }).click();
  await expect(page.getByText(/感謝你的建議/)).toBeVisible({ timeout: 20_000 });

  const status = await page.evaluate(async (adminId) => {
    const me = await fetch('/api/v1/me');
    const { data } = (await me.json()) as { data: { csrfToken: string } };
    const res = await fetch('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
      body: JSON.stringify({ provider: 'github', providerUserId: adminId, username: 'MrPippi' }),
    });
    return res.status;
  }, ADMIN_ID);
  expect(status).toBe(200);
  promoteToAdmin();

  await page.goto('/admin/');
  const card = page.getByRole('article').filter({ hasText: marker });
  await card.getByRole('button', { name: '核准', exact: true }).click();
  await expect(page.getByText('已核准。')).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole('tab', { name: '發佈' }).click();
  await page.getByRole('button', { name: '發佈到 GitHub' }).click();
  await page.getByRole('button', { name: '確定發佈' }).click();
  await expect(page.getByRole('status')).toContainText(/已發佈 \d+ 條/, { timeout: 20_000 });

  const file = await request.get(`${FAKE_GITHUB}/__file?path=data/mods/create/zh_tw.json`);
  expect(await file.text()).toContain(`傳動軸${marker}`);
  const state = (await (await request.get(`${FAKE_GITHUB}/__state`)).json()) as { head: string; commits: { sha: string; message: string; parents: string[] }[] };
  const head = state.commits.find((c) => c.sha === state.head);
  expect(head?.message).toMatch(/^chore\(data\): publish \d+ reviewed translations?/);
  expect(head?.message).toContain('create (');
});
