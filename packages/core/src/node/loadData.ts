import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogModSchema, type CatalogMod } from '../catalog/schema';
import { type ModIssue, validateModData } from '../catalog/validateMod';
import { stripBom } from '../lang/types';

export interface LoadedMod {
  readonly meta: CatalogMod;
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

export type DataIssue = ModIssue & { readonly modId: string };

export interface LoadResult {
  readonly mods: readonly LoadedMod[];
  readonly issues: readonly DataIssue[];
}

type ReadOutcome = { ok: true; value: unknown } | { ok: false; issue: ModIssue };

async function readJson(dir: string, file: ModIssue['file'], optional: boolean): Promise<ReadOutcome> {
  let text: string;
  try {
    text = await readFile(join(dir, file), 'utf8');
  } catch {
    return optional ? { ok: true, value: {} } : { ok: false, issue: { level: 'error', file, message: '檔案不存在' } };
  }
  try {
    return { ok: true, value: JSON.parse(stripBom(text)) as unknown };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, issue: { level: 'error', file, message: `JSON 解析失敗：${reason}` } };
  }
}

async function loadOne(modsDir: string, modId: string): Promise<{ mod?: LoadedMod; issues: DataIssue[] }> {
  const dir = join(modsDir, modId);
  const [meta, en, zh] = await Promise.all([
    readJson(dir, 'mod.json', false),
    readJson(dir, 'en_us.json', false),
    readJson(dir, 'zh_tw.json', true),
  ]);
  const readIssues = [meta, en, zh].flatMap((r) => (r.ok ? [] : [r.issue]));
  const issues = readIssues.length > 0 || !meta.ok || !en.ok || !zh.ok
    ? readIssues
    : validateModData(modId, meta.value, en.value, zh.value);
  const tagged = issues.map((i) => ({ ...i, modId }));
  if (tagged.some((i) => i.level === 'error') || !meta.ok || !en.ok || !zh.ok) return { issues: tagged };
  const mod: LoadedMod = {
    meta: catalogModSchema.parse(meta.value),
    en: en.value as Record<string, string>,
    zh: zh.value as Record<string, string>,
  };
  return { mod, issues: tagged };
}

/** 讀取 `<dataDir>/mods/*`；有 error 的模組不會出現在 mods 中 */
export async function loadAllMods(dataDir: string): Promise<LoadResult> {
  const modsDir = join(dataDir, 'mods');
  let names: string[];
  try {
    const entries = await readdir(modsDir, { withFileTypes: true });
    names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return { mods: [], issues: [] };
  }
  const results = await Promise.all(names.map((name) => loadOne(modsDir, name)));
  return {
    mods: results.flatMap((r) => (r.mod ? [r.mod] : [])),
    issues: results.flatMap((r) => r.issues),
  };
}

/** 轉為 GitHub Actions 註記格式 */
export function formatIssues(issues: readonly DataIssue[], dataDirLabel: string): string[] {
  return issues.map((i) => {
    const where = i.key ? `${i.key}：` : '';
    return `::${i.level} file=${dataDirLabel}/mods/${i.modId}/${i.file}::[${i.modId}] ${where}${i.message}`;
  });
}
