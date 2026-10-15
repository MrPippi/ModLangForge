import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, type Download, type Page, test } from '@playwright/test';
import { makeJar } from '../packages/core/src/test/makeJar';

async function unzipDownload(download: Download): Promise<JSZip> {
  const path = await download.path();
  return JSZip.loadAsync(await readFile(path));
}

/** 前往頁面並等待所有 Astro island 完成 hydration */
async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
}

async function search(page: Page, query: string): Promise<void> {
  await gotoHydrated(page, '/');
  await page.getByLabel('搜尋模組').fill(query);
}

test.describe('search', () => {
  for (const query of ['Create', 'create', '機械動力']) {
    test(`finds Create by "${query}"`, async ({ page }) => {
      await search(page, query);
      await expect(page.getByRole('link', { name: /Create（機械動力）/ })).toBeVisible();
    });
  }

  test('offers the translate entry when nothing matches', async ({ page }) => {
    await search(page, 'zzznotamod');
    await expect(page.getByText('找不到「zzznotamod」的翻譯')).toBeVisible();
    await page.getByRole('link', { name: '上傳 jar 自己翻' }).click();
    await expect(page).toHaveURL(/\/translate\/?$/);
  });
});

test('mod page downloads a working resource pack', async ({ page }) => {
  await gotoHydrated(page, '/mods/create/');
  await expect(page).toHaveTitle('Create（機械動力）繁體中文翻譯下載 | ModLangForge');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /下載資源包/ }).click()]);
  expect(download.suggestedFilename()).toBe('create-zh_tw-1.21.1.zip');
  const zip = await unzipDownload(download);
  const lang = JSON.parse((await zip.file('assets/create/lang/zh_tw.json')?.async('string')) ?? '{}');
  expect(lang['block.create.cogwheel']).toBe('齒輪');
  expect(JSON.parse((await zip.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(34);
});

test('merged pack combines selected mods', async ({ page }) => {
  await gotoHydrated(page, '/mods/create/');
  await page.getByRole('button', { name: /加入合併包/ }).click();
  await gotoHydrated(page, '/mods/jei/');
  await page.getByRole('button', { name: /加入合併包/ }).click();
  await gotoHydrated(page, '/pack/');
  await expect(page.getByLabel('Minecraft 版本')).toHaveValue('1.20.1');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載合併資源包（2 個模組）' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('ModLangForge-zh_tw-1.20.1.zip');
  const zip = await unzipDownload(download);
  expect(zip.file('assets/create/lang/zh_tw.json')).not.toBeNull();
  const jei = JSON.parse((await zip.file('assets/jei/lang/zh_tw.json')?.async('string')) ?? '{}');
  expect(jei['jei.tooltip.config']).toBe('JEI 設定');
  expect(jei['jei.key.toggleOverlay']).toBe('Show/Hide Item List');
});

test('translator accepts an uploaded jar and shows its entries', async ({ page }) => {
  const jar = await makeJar({
    'assets/e2emod/lang/en_us.json': JSON.stringify({ 'item.e2emod.gem': 'Shiny Gem' }),
    'fabric.mod.json': JSON.stringify({ id: 'e2emod', name: 'E2E Mod', version: '1.0.0' }),
  });
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('將模組 .jar 檔拖曳到這裡，或點擊選擇檔案').setInputFiles({
    name: 'e2emod.jar', mimeType: 'application/java-archive', buffer: Buffer.from(jar),
  });
  await expect(page.getByText('Shiny Gem')).toBeVisible();
  await page.getByRole('textbox', { name: /item.e2emod.gem/ }).fill('閃亮寶石');
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(page.getByRole('textbox', { name: /item.e2emod.gem/ })).toHaveValue('閃亮寶石');
});
