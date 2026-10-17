import { expect, test } from '@playwright/test';
import { gotoHydrated } from './helpers';

test('home search shows Litematica with the built-in tag', async ({ page }) => {
  await gotoHydrated(page, '/');
  await page.getByLabel('搜尋模組').fill('Litematica');
  const link = page.getByRole('link', { name: /^Litematica/ }).first();
  await expect(link).toContainText('內建繁中');
  await expect(link).not.toContainText('%');
});

test('mods list shows Litematica card with the built-in tag', async ({ page }) => {
  await gotoHydrated(page, '/mods/');
  await page.getByLabel('翻譯狀態').selectOption({ label: '內建繁中' });
  const items = page.getByRole('list', { name: '模組清單' }).getByRole('listitem');
  const card = items.filter({ has: page.locator('a[href="/mods/litematica/"]') });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('內建繁中');
});

test('built-in mod page explains the language setting and links to Modrinth', async ({ page }) => {
  await gotoHydrated(page, '/mods/litematica/');
  await expect(page).toHaveTitle('Litematica 已內建繁體中文 | ModLangForge');
  await expect(page.getByText('本身已經有完整的繁體中文')).toBeVisible();
  await expect(page.getByRole('link', { name: /到 Modrinth 下載模組/ })).toHaveAttribute('href', 'https://modrinth.com/mod/litematica');
  await expect(page.getByRole('button', { name: /加入合併資源包/ })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('status filter 內建繁中 keeps only built-in mods', async ({ page }) => {
  await gotoHydrated(page, '/mods/');
  await page.getByLabel('翻譯狀態').selectOption({ label: '內建繁中' });
  const items = page.getByRole('list', { name: '模組清單' }).getByRole('listitem');
  await expect(items.filter({ has: page.locator('a[href="/mods/litematica/"]') })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Create' })).toHaveCount(0);
  await expect(items.filter({ hasNotText: '內建繁中' })).toHaveCount(0);
});

test('modpack page lists Litematica under included with the built-in tag', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-pack/');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Litematica', exact: true }) });
  await expect(row).toContainText('內建繁中');
  await expect(page.getByRole('link', { name: 'Litematica', exact: true })).toHaveAttribute('href', '/mods/litematica/');
});
