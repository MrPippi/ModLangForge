import { expect, test } from '@playwright/test';

test('local test login shows the account menu and logout returns to anonymous', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await expect(page.getByText('登入', { exact: true })).toBeVisible();

  const status = await page.evaluate(async () => {
    const me = await fetch('/api/v1/me');
    const { data } = (await me.json()) as { data: { csrfToken: string } };
    const res = await fetch('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
      body: JSON.stringify({ provider: 'discord', providerUserId: 'e2e-auth', username: 'e2e', displayName: 'E2E 測試者' }),
    });
    return res.status;
  });
  expect(status).toBe(200);

  await page.reload();
  await page.getByText('E2E 測試者').click();
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page.getByText('登入', { exact: true })).toBeVisible();
});

test('admin APIs reject anonymous visitors', async ({ request }) => {
  const res = await request.get('/api/v1/admin/users');
  expect(res.status()).toBe(401);
});
