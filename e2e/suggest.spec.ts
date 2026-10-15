import { expect, test } from '@playwright/test';

test('anonymous visitor suggests a translation fix', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w"},remove(){}};',
    }));
  await page.goto('/mods/create/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await page.locator('[data-suggest-key]').first().click();
  const box = page.getByLabel('建議譯文');
  await box.fill(`${await box.inputValue()}（測試）`);
  await page.getByRole('button', { name: '送出建議' }).click();
  await expect(page.getByText(/感謝你的建議/)).toBeVisible({ timeout: 20_000 });
});
