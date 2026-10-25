import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { siteChangelogSchema, translationChangelogSchema } from '@mlf/core/changelog';
import { checkBuiltinConflicts, checkCurseforgeLinks, checkModStats } from '@mlf/core/catalog';
import { formatIssues, formatModpackIssues, GLOBAL_GLOSSARY_ID, listModIdsIn, loadAllBuiltinMods, loadAllModpacks, loadAllMods } from '@mlf/core/node';

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
  const stats = await readOptionalJson(resolve(DATA_DIR, 'mod-stats.json'));
  if (stats !== undefined) errors.push(...checkModStats(stats, knownModIds).map((m) => `data/mod-stats.json: ${m}`));
  const disabled = await readOptionalJson(resolve(DATA_DIR, 'banners-disabled.json'));
  if (disabled === undefined) return errors;
  if (!Array.isArray(disabled) || !disabled.every((id) => typeof id === 'string')) {
    return [...errors, 'data/banners-disabled.json: 必須是 modId 字串陣列'];
  }
  const unknown = (disabled as string[]).filter((id) => !knownModIds.has(id));
  return [...errors, ...unknown.map((id) => `data/banners-disabled.json: ${id} 不是已收錄的模組`)];
}

/** 檢查更新日誌的兩個資料檔格式，回傳錯誤訊息 */
async function checkChangelog(): Promise<readonly string[]> {
  const files = [
    { name: 'site.json', schema: siteChangelogSchema },
    { name: 'translations.json', schema: translationChangelogSchema },
  ] as const;
  const errors: string[] = [];
  for (const { name, schema } of files) {
    const raw = await readOptionalJson(resolve(DATA_DIR, 'changelog', name));
    if (raw === undefined) continue;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) errors.push(...parsed.error.issues.map((i) => `data/changelog/${name}: ${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return errors;
}

async function main(): Promise<void> {
  const { mods, issues, glossary } = await loadAllMods(DATA_DIR);
  const builtin = await loadAllBuiltinMods(DATA_DIR);
  const packs = await loadAllModpacks(DATA_DIR, glossary);
  [...formatIssues(issues, 'data'), ...formatIssues(builtin.issues, 'data'), ...formatModpackIssues(packs.issues, 'data')].forEach((line) => console.log(line));
  const knownIds = await listModIdsIn(DATA_DIR);
  const conflictErrors = checkBuiltinConflicts(mods.map((m) => m.meta.modId), builtin.mods.map((m) => m.modId));
  conflictErrors.forEach((line) => console.log(`error ${line}`));
  const linkErrors = checkCurseforgeLinks([...mods.map((m) => ({ modId: m.meta.modId, links: m.meta.links })), ...builtin.mods]);
  linkErrors.forEach((line) => console.log(`error ${line}`));
  const bannerErrors = await checkBannerData(new Set(knownIds));
  bannerErrors.forEach((line) => console.log(`error ${line}`));
  const changelogErrors = await checkChangelog();
  changelogErrors.forEach((line) => console.log(`error ${line}`));
  const all = [...issues, ...builtin.issues, ...packs.issues];
  const errors = all.filter((i) => i.level === 'error').length + conflictErrors.length + linkErrors.length + bannerErrors.length + changelogErrors.length;
  const warnings = all.filter((i) => i.level !== 'error').length;
  const failedMods = new Set(issues.filter((i) => i.level === 'error' && i.modId !== GLOBAL_GLOSSARY_ID).map((i) => i.modId)).size;
  const failedBuiltin = new Set(builtin.issues.map((i) => i.modId)).size;
  const failedPacks = new Set(packs.issues.filter((i) => i.level === 'error').map((i) => i.modpackId)).size;
  console.log(
    `已檢查 ${mods.length + failedMods} 個模組、${builtin.mods.length + failedBuiltin} 個內建繁中模組、${packs.modpacks.length + failedPacks} 個整合包：${errors} 個錯誤、${warnings} 個警告`,
  );
  if (errors > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('validate-data 執行失敗', err);
  process.exitCode = 1;
});
