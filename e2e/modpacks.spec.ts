import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { zipFileNames, zipInnerZip, zipQuestTexts } from '../packages/core/src/test/zipFiles';
import { gotoHydrated, unzipDownload } from './helpers';

const KUBEJS_DIR = 'data/modpacks/example-pack/kubejs/kubejs';
const QUESTS_DIR = 'data/modpacks/example-quests/ftbquests';
const GUIDE = '安裝說明.txt';
const QUEST_FILE = 'config/ftbquests/quests/lang/zh_tw.snbt';
const EXAMPLE_PACK_ZIP = 'resourcepacks/example-pack-zh_tw.zip';
const EXAMPLE_QUESTS_ZIP = 'resourcepacks/example-quests-zh_tw.zip';
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';

async function readJsonFile(path: string): Promise<Record<string, string>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
}

async function readZipJson(zip: JSZip, path: string): Promise<Record<string, string>> {
  return JSON.parse((await zip.file(path)?.async('string')) ?? '{}') as Record<string, string>;
}

/** 期望值從 repo 資料推導：只有已翻譯的條目會寫入（未翻譯的由遊戲退回英文） */
async function translatedOnly(dir: string): Promise<Record<string, string>> {
  const en = await readJsonFile(`${dir}/en_us.json`);
  const zh = await readJsonFile(`${dir}/zh_tw.json`);
  return Object.fromEntries(Object.keys(en).filter((k) => Object.hasOwn(zh, k) && zh[k] !== '').map((k) => [k, zh[k] ?? '']));
}

test('modpack catalog links to the example modpacks and shows quest status', async ({ page }) => {
  await gotoHydrated(page, '/');
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '整合包', exact: true }).click();
  await expect(page).toHaveURL(/\/modpacks\/?$/);
  const list = page.getByRole('list', { name: '整合包清單' });
  const card = list.getByRole('listitem').filter({ hasText: 'Example Pack' });
  await expect(card).toContainText('已收錄模組 3／4');
  await expect(card).toContainText('Minecraft 1.20.1');
  await expect(card).toContainText('此版本的任務暫不支援翻譯');
  await expect(list.getByRole('listitem').filter({ hasText: 'Example Quests' })).toContainText('FTB 任務 50%');
  await card.getByRole('link', { name: 'Example Pack', exact: true }).click();
  await expect(page).toHaveURL(/\/modpacks\/example-pack\/?$/);
});

test('modpack page downloads the resource pack under resourcepacks/ with no quest files on 1.20.1', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-pack/');
  await expect(page.getByRole('link', { name: 'Create', exact: true })).toHaveAttribute('href', '/mods/create/');
  await expect(page.getByText('example-missing-mod')).toBeVisible();
  await expect(page.getByText(/整合包文字已翻譯 2 \/ 3 條/).first()).toBeVisible();
  await expect(page.getByText('此版本的任務暫不支援翻譯')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載整合包翻譯' }).click()]);
  expect(download.suggestedFilename()).toBe('example-pack-zh_tw-1.20.1.zip');
  const zip = await unzipDownload(download);
  expect(zipFileNames(zip)).toEqual([EXAMPLE_PACK_ZIP, GUIDE]);
  const inner = await zipInnerZip(zip, EXAMPLE_PACK_ZIP);
  expect(zipFileNames(inner)).toEqual(['assets/create/lang/zh_tw.json', 'assets/jei/lang/zh_tw.json', 'assets/kubejs/lang/zh_tw.json', 'pack.mcmeta']);
  expect(JSON.parse((await inner.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(15);
  expect(inner.file('assets/create/lang/zh_tw.json')).not.toBeNull();
  expect(inner.file('assets/jei/lang/zh_tw.json')).not.toBeNull();
  expect(await readZipJson(inner, 'assets/kubejs/lang/zh_tw.json')).toEqual(await translatedOnly(KUBEJS_DIR));
});

test('quest modpack page shows quest progress and downloads quest translations', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-quests/');
  await expect(page.getByText(/FTB 任務已翻譯 3 \/ 6 條/).first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載整合包翻譯' }).click()]);
  expect(download.suggestedFilename()).toBe('example-quests-zh_tw-1.21.1.zip');
  const zip = await unzipDownload(download);
  expect(zipFileNames(zip)).toEqual([QUEST_FILE, EXAMPLE_QUESTS_ZIP, GUIDE]);
  expect(await zipQuestTexts(zip, QUEST_FILE)).toEqual(await translatedOnly(QUESTS_DIR));
  const inner = await zipInnerZip(zip, EXAMPLE_QUESTS_ZIP);
  expect(zipFileNames(inner)).toEqual(['assets/create/lang/zh_tw.json', 'pack.mcmeta']);
  expect(JSON.parse((await inner.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(34);
  expect((await zip.file(GUIDE)?.async('string')) ?? '').toContain('伺服器的 config 資料夾');
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

test('translator loads FTB quests, edits a multi-line description and exports it', async ({ page }) => {
  const typed = '歡迎來到範例整合包。\n{@pagebreak}\n做一個 &6齒輪&r 繼續。';
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('選擇整合包').selectOption('example-quests');
  await page.getByRole('button', { name: '載入整合包' }).click();
  await expect(page.getByRole('button', { name: /Example Quests（FTB 任務）/ })).toBeVisible();
  const box = page.getByRole('textbox', { name: /quest\.44A5523F7A909209\.quest_desc/ });
  await expect(box).toHaveAttribute('rows', '3');
  await box.fill(typed);
  await box.press('Enter');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下載翻譯' });
  const [pack] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zip = await unzipDownload(pack);
  expect(zipFileNames(zip)).toEqual([QUEST_FILE, GUIDE]);
  const texts = await zipQuestTexts(zip, QUEST_FILE);
  expect(texts[DESC]).toBe(typed);
  expect(texts[TITLE]).toBe('&a歡迎');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  await dialog.getByRole('radio', { name: /分享給本站/ }).click();
  const [contribution] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zh = await readZipJson(await unzipDownload(contribution), 'modpacks/example-quests/ftbquests/zh_tw.json');
  expect(zh[DESC]).toBe(typed);
});
