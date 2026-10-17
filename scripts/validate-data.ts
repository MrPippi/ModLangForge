import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { checkModStats } from '@mlf/core/catalog';
import { formatIssues, formatModpackIssues, GLOBAL_GLOSSARY_ID, loadAllModpacks, loadAllMods } from '@mlf/core/node';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');

/** 讀 JSON 檔；檔案不存在回傳 undefined */
async function readOptionalJson(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return JSON.parse(text) as unknown;
}

/** 檢查下載量資料檔與橫幅停用清單，回傳錯誤訊息 */
async function checkBannerData(knownModIds: ReadonlySet<string>): Promise<readonly string[]> {
  const errors: string[] = [];
  const stats = await readOptionalJson(resolve(DATA_DIR, 'modrinth-stats.json'));
  if (stats !== undefined) errors.push(...checkModStats(stats, knownModIds).map((m) => `data/modrinth-stats.json: ${m}`));
  const disabled = await readOptionalJson(resolve(DATA_DIR, 'banners-disabled.json'));
  if (disabled === undefined) return errors;
  if (!Array.isArray(disabled) || !disabled.every((id) => typeof id === 'string')) {
    return [...errors, 'data/banners-disabled.json: 必須是 modId 字串陣列'];
  }
  const unknown = (disabled as string[]).filter((id) => !knownModIds.has(id));
  return [...errors, ...unknown.map((id) => `data/banners-disabled.json: ${id} 不是已收錄的模組`)];
}

async function main(): Promise<void> {
  const { mods, issues, glossary } = await loadAllMods(DATA_DIR);
  const packs = await loadAllModpacks(DATA_DIR, glossary);
  [...formatIssues(issues, 'data'), ...formatModpackIssues(packs.issues, 'data')].forEach((line) => console.log(line));
  const modDirs = await readdir(resolve(DATA_DIR, 'mods'), { withFileTypes: true });
  const bannerErrors = await checkBannerData(new Set(modDirs.filter((e) => e.isDirectory()).map((e) => e.name)));
  bannerErrors.forEach((line) => console.log(`error ${line}`));
  const all = [...issues, ...packs.issues];
  const errors = all.filter((i) => i.level === 'error').length + bannerErrors.length;
  const warnings = all.filter((i) => i.level !== 'error').length;
  const failedMods = new Set(issues.filter((i) => i.level === 'error' && i.modId !== GLOBAL_GLOSSARY_ID).map((i) => i.modId)).size;
  const failedPacks = new Set(packs.issues.filter((i) => i.level === 'error').map((i) => i.modpackId)).size;
  console.log(`已檢查 ${mods.length + failedMods} 個模組、${packs.modpacks.length + failedPacks} 個整合包：${errors} 個錯誤、${warnings} 個警告`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('validate-data 執行失敗', err);
  process.exitCode = 1;
});
