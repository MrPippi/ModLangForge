import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogModSchema, type CatalogMod } from '../catalog/schema';
import { type ModIssue, validateModData } from '../catalog/validateMod';
import { mergeGlossaries } from '../glossary/merge';
import type { GlossaryTerm } from '../glossary/schema';
import { validateGlossaryFile } from '../glossary/validateGlossary';
import { stripBom } from '../lang/types';
import { type LoadedGuide, loadGuide } from './loadGuide';

/** 全域術語檔問題回報用的 modId */
export const GLOBAL_GLOSSARY_ID = '(glossary)';
const EMPTY_GLOSSARY = { terms: [] };

export interface LoadedMod {
  readonly meta: CatalogMod;
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
  /** 模組術語表（不含全域） */
  readonly glossary: readonly GlossaryTerm[];
  /** Patchouli 手冊；沒有手冊時省略 */
  readonly guide?: LoadedGuide;
}

export type DataIssue = ModIssue & { readonly modId: string };

export interface LoadResult {
  readonly mods: readonly LoadedMod[];
  readonly issues: readonly DataIssue[];
  /** 全域術語；全域術語檔無效時為空 */
  readonly glossary: readonly GlossaryTerm[];
}

type ReadOutcome = { ok: true; value: unknown } | { ok: false; issue: ModIssue };

async function readJson(dir: string, file: ModIssue['file'], fallback?: unknown): Promise<ReadOutcome> {
  let text: string;
  try {
    text = await readFile(join(dir, file), 'utf8');
  } catch {
    return fallback !== undefined ? { ok: true, value: fallback } : { ok: false, issue: { level: 'error', file, message: '檔案不存在' } };
  }
  try {
    return { ok: true, value: JSON.parse(stripBom(text)) as unknown };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, issue: { level: 'error', file, message: `JSON 解析失敗：${reason}` } };
  }
}

interface GlossaryLoad {
  /** null 代表術語檔無效 */
  readonly terms: readonly GlossaryTerm[] | null;
  readonly issues: readonly ModIssue[];
}

async function readGlossary(dir: string): Promise<GlossaryLoad> {
  const read = await readJson(dir, 'glossary.json', EMPTY_GLOSSARY);
  if (!read.ok) return { terms: null, issues: [read.issue] };
  const result = validateGlossaryFile(read.value);
  if (result.ok) return { terms: result.terms, issues: [] };
  return { terms: null, issues: result.messages.map((message) => ({ level: 'error', file: 'glossary.json', message })) };
}

async function loadOne(
  modsDir: string,
  modId: string,
  globalTerms: readonly GlossaryTerm[] | null,
): Promise<{ mod?: LoadedMod; issues: DataIssue[] }> {
  const dir = join(modsDir, modId);
  const [meta, en, zh, glossary] = await Promise.all([
    readJson(dir, 'mod.json'),
    readJson(dir, 'en_us.json'),
    readJson(dir, 'zh_tw.json', {}),
    readGlossary(dir),
  ]);
  const modTerms = glossary.terms ?? [];
  const terms = globalTerms === null ? [] : mergeGlossaries(globalTerms, modTerms);
  const guideLoad = await loadGuide(dir, terms);
  const readIssues = [meta, en, zh].flatMap((r) => (r.ok ? [] : [r.issue]));
  const issues = readIssues.length > 0 || !meta.ok || !en.ok || !zh.ok
    ? readIssues
    : validateModData(modId, meta.value, en.value, zh.value, terms);
  const tagged = [...issues, ...glossary.issues, ...guideLoad.issues].map((i) => ({ ...i, modId }));
  if (tagged.some((i) => i.level === 'error') || !meta.ok || !en.ok || !zh.ok) return { issues: tagged };
  const mod: LoadedMod = {
    meta: catalogModSchema.parse(meta.value),
    en: en.value as Record<string, string>,
    zh: zh.value as Record<string, string>,
    glossary: modTerms,
    ...(guideLoad.guide ? { guide: guideLoad.guide } : {}),
  };
  return { mod, issues: tagged };
}

/** 讀取 `<dataDir>/glossary.json` 與 `<dataDir>/mods/*`；有 error 的模組不會出現在 mods 中 */
export async function loadAllMods(dataDir: string): Promise<LoadResult> {
  const modsDir = join(dataDir, 'mods');
  let names: string[];
  try {
    const entries = await readdir(modsDir, { withFileTypes: true });
    names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return { mods: [], glossary: [], issues: [{ modId: '(mods)', level: 'error', file: 'mod.json', message: `找不到模組資料夾：${modsDir}` }] };
  }
  const global = await readGlossary(dataDir);
  const results = await Promise.all(names.map((name) => loadOne(modsDir, name, global.terms)));
  return {
    mods: results.flatMap((r) => (r.mod ? [r.mod] : [])),
    issues: [...global.issues.map((i) => ({ ...i, modId: GLOBAL_GLOSSARY_ID })), ...results.flatMap((r) => r.issues)],
    glossary: global.terms ?? [],
  };
}

/** 內建繁中條目的 issue 用此檔名標記（實際檔案是 builtin-mods/<modId>.json） */
const BUILTIN_ISSUE_FILE = 'builtin.json';

function issuePath(i: DataIssue, dataDirLabel: string): string {
  if (i.modId === GLOBAL_GLOSSARY_ID) return `${dataDirLabel}/${i.file}`;
  if (i.file === BUILTIN_ISSUE_FILE) return `${dataDirLabel}/builtin-mods/${i.modId}.json`;
  return `${dataDirLabel}/mods/${i.modId}/${i.file}`;
}

/** 轉為 GitHub Actions 註記格式 */
export function formatIssues(issues: readonly DataIssue[], dataDirLabel: string): string[] {
  return issues.map((i) => {
    const path = issuePath(i, dataDirLabel);
    const where = i.key ? `${i.key}：` : '';
    return `::${i.level} file=${path}::[${i.modId}] ${where}${i.message}`;
  });
}
