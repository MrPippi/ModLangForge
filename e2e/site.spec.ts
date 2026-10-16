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

/** 讀取翻譯工具存在 IndexedDB 的譯文 */
function storedTarget(page: Page, modId: string, key: string): Promise<string | null> {
  return page.evaluate(
    ([id, k]) =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('modlangforge');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const get = open.result.transaction('projects').objectStore('projects').get(id);
          get.onerror = () => resolve(null);
          get.onsuccess = () => {
            const entries = (get.result?.entries ?? []) as { key: string; target: string }[];
            resolve(entries.find((e) => e.key === k)?.target ?? null);
            open.result.close();
          };
        };
      }),
    [modId, key] as const,
  );
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
    await page.getByRole('link', { name: '自己動手翻' }).click();
    await expect(page).toHaveURL(/\/translate\/?$/);
  });
});

test.describe('mods catalog', () => {
  test('filters by status and sorts by recent update', async ({ page }) => {
    await gotoHydrated(page, '/mods/');
    const status = page.getByLabel('翻譯狀態');
    await expect(status).toBeEnabled();
    const items = page.getByRole('list', { name: '模組清單' }).getByRole('listitem');

    await status.selectOption('reviewed');
    await expect(page.getByText('共 1 個模組')).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Create');

    await status.selectOption('');
    await page.getByLabel('排序').selectOption('updated');
    await expect(items.last()).toContainText('Example Legacy Mod');
  });
});

test('mod page joins the version select and download button into one control', async ({ page }) => {
  await gotoHydrated(page, '/mods/create/');
  const select = await page.getByLabel('Minecraft 版本').boundingBox();
  const button = await page.getByRole('button', { name: '下載資源包' }).boundingBox();
  expect(select && button).toBeTruthy();
  expect(Math.abs(select!.height - button!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(select!.y - button!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(select!.x + select!.width - button!.x)).toBeLessThanOrEqual(1);
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

test('partial built-in mod page explains that only missing keys are shipped', async ({ page }) => {
  await gotoHydrated(page, '/mods/modmenu/');
  await expect(page.getByText(/這個模組本身已有約 87% 的繁中翻譯/)).toBeVisible();
  await expect(page.getByText('這份翻譯是機器自動翻的，還沒有人檢查過，看到不通順的地方歡迎幫忙修正。')).toBeVisible();
});

test('merged pack combines selected mods', async ({ page }) => {
  await gotoHydrated(page, '/mods/create/');
  await page.getByRole('button', { name: /加入合併資源包/ }).click();
  await gotoHydrated(page, '/mods/jei/');
  await page.getByRole('button', { name: /加入合併資源包/ }).click();
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
  await page.getByLabel('把模組 .jar 檔拖到這裡，或點一下選擇檔案').setInputFiles({
    name: 'e2emod.jar', mimeType: 'application/java-archive', buffer: Buffer.from(jar),
  });
  await expect(page.getByText('Shiny Gem')).toBeVisible();
  await page.getByRole('textbox', { name: /item.e2emod.gem/ }).fill('閃亮寶石');
  await page.keyboard.press('Enter');
  await expect.poll(() => storedTarget(page, 'e2emod', 'item.e2emod.gem')).toBe('閃亮寶石');
  await page.reload();
  await expect(page.getByRole('textbox', { name: /item.e2emod.gem/ })).toHaveValue('閃亮寶石');
});

test('translator shows glossary hints and flags unused terms', async ({ page }) => {
  const jar = await makeJar({
    'assets/glossmod/lang/en_us.json': JSON.stringify({ 'item.glossmod.dust': 'Redstone Dust' }),
    'fabric.mod.json': JSON.stringify({ id: 'glossmod', name: 'Gloss Mod', version: '1.0.0' }),
  });
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('把模組 .jar 檔拖到這裡，或點一下選擇檔案').setInputFiles({
    name: 'glossmod.jar', mimeType: 'application/java-archive', buffer: Buffer.from(jar),
  });
  await expect(page.getByText('Redstone→紅石')).toBeVisible();
  const box = page.getByRole('textbox', { name: /item.glossmod.dust/ });
  await box.fill('紅色粉末');
  await expect(page.locator('[data-missing]')).toContainText('Redstone→紅石');
  await box.fill('紅石粉');
  await expect(page.locator('[data-missing]')).toHaveCount(0);
});

test('pages run under a hash-based CSP without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  for (const url of ['/', '/mods/create/', '/pack/', '/translate/']) {
    await gotoHydrated(page, url);
    const csp = await page.locator('meta[http-equiv="content-security-policy"]').getAttribute('content');
    expect(csp).toMatch(/script-src [^;]*'sha(256|384|512)-/);
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
  }
  await search(page, 'Create');
  await expect(page.getByRole('link', { name: /Create（機械動力）/ })).toBeVisible();
  expect(violations).toEqual([]);
});
