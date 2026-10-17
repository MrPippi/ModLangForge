import { readFile } from 'node:fs/promises';
import type JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { gotoHydrated, unzipDownload } from './helpers';

const KUBEJS_DIR = 'data/modpacks/example-pack/kubejs/kubejs';

async function readZipJson(zip: JSZip, path: string): Promise<Record<string, string>> {
  return JSON.parse((await zip.file(path)?.async('string')) ?? '{}') as Record<string, string>;
}

/** 期望值從 repo 資料推導：只有已翻譯的條目會寫入（未翻譯的 KubeJS 條目不寫入，遊戲自會退回 KubeJS 英文） */
async function expectedKubejs(): Promise<Record<string, string>> {
  const en = JSON.parse(await readFile(`${KUBEJS_DIR}/en_us.json`, 'utf8')) as Record<string, string>;
  const zh = JSON.parse(await readFile(`${KUBEJS_DIR}/zh_tw.json`, 'utf8')) as Record<string, string>;
  return Object.fromEntries(Object.keys(en).filter((k) => Object.hasOwn(zh, k) && zh[k] !== '').map((k) => [k, zh[k]]));
}

test('modpack catalog is in the main navigation and links to the example modpack', async ({ page }) => {
  await gotoHydrated(page, '/');
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '整合包', exact: true }).click();
  await expect(page).toHaveURL(/\/modpacks\/?$/);
  const card = page.getByRole('list', { name: '整合包清單' }).getByRole('listitem').filter({ hasText: 'Example Pack' });
  await expect(card).toContainText('已收錄模組 2／3');
  await expect(card).toContainText('Minecraft 1.20.1');
  await card.getByRole('link', { name: 'Example Pack（範例整合包）' }).click();
  await expect(page).toHaveURL(/\/modpacks\/example-pack\/?$/);
});

test('modpack page lists mods and downloads one resource pack with KubeJS text', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-pack/');
  await expect(page.getByRole('link', { name: 'Create（機械動力）' })).toHaveAttribute('href', '/mods/create/');
  await expect(page.getByText('example-missing-mod')).toBeVisible();
  await expect(page.getByText(/整合包文字已翻譯 2 \/ 3 條/).first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載整合包資源包' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('example-pack-zh_tw-1.20.1.zip');
  const zip = await unzipDownload(download);
  expect(JSON.parse((await zip.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(15);
  expect(zip.file('assets/create/lang/zh_tw.json')).not.toBeNull();
  expect(zip.file('assets/jei/lang/zh_tw.json')).not.toBeNull();
  expect(await readZipJson(zip, 'assets/kubejs/lang/zh_tw.json')).toEqual(await expectedKubejs());
});

test('translator loads the example modpack and exports its KubeJS text', async ({ page }) => {
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('選擇整合包').selectOption('example-pack');
  await page.getByRole('button', { name: '載入整合包' }).click();
  await expect(page.getByText('Example Casing', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: /item\.kubejs\.example_casing/ }).fill('範例外殼');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下載翻譯' });
  const [pack] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const lang = await readZipJson(await unzipDownload(pack), 'assets/kubejs/lang/zh_tw.json');
  expect(lang['item.kubejs.example_casing']).toBe('範例外殼');
  expect(lang['item.kubejs.example_gear']).toBe('範例齒輪');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  await dialog.getByRole('radio', { name: /分享給本站/ }).click();
  const [contribution] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zh = await readZipJson(await unzipDownload(contribution), 'modpacks/example-pack/kubejs/kubejs/zh_tw.json');
  expect(zh['item.kubejs.example_casing']).toBe('範例外殼');
});
