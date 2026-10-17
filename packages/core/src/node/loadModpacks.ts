import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GlossaryTerm } from '../glossary/schema';
import { type CatalogModpack, catalogModpackSchema, isValidNamespace } from '../modpack/schema';
import type { KubejsData, KubejsTexts } from '../modpack/types';
import {
  KUBEJS_DIR, KUBEJS_EN_FILE, KUBEJS_ZH_FILE, kubejsFile, MODPACK_FILE, type ModpackIssue, validateKubejsData, validateModpackMeta,
} from '../modpack/validate';
import { isMissing, parseJsonText } from './fsErrors';

/** `<dataDir>` 底下的整合包資料夾 */
export const MODPACKS_DIR = 'modpacks';

export interface LoadedModpack {
  readonly meta: CatalogModpack;
  readonly kubejs: KubejsData;
}

export type ModpackDataIssue = ModpackIssue & { readonly modpackId: string };

export interface ModpackLoadResult {
  readonly modpacks: readonly LoadedModpack[];
  readonly issues: readonly ModpackDataIssue[];
}

const ALLOWED_FILES: ReadonlySet<string> = new Set([KUBEJS_EN_FILE, KUBEJS_ZH_FILE]);

const isError = (i: ModpackIssue): boolean => i.level === 'error';

async function listEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

type JsonRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ModpackIssue };

/** optional 為 true 時檔案不存在回傳 null；否則回報「檔案不存在」 */
async function readJson(path: string, file: ModpackIssue['file'], optional: boolean): Promise<JsonRead | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (!isMissing(err)) throw err;
    return optional ? null : { ok: false, issue: { level: 'error', file, message: '檔案不存在' } };
  }
  const parsed = parseJsonText(text);
  return parsed.ok ? parsed : { ok: false, issue: { level: 'error', file, message: `JSON 解析失敗：${parsed.reason}` } };
}

interface NamespaceLoad {
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

async function loadNamespace(root: string, ns: string, terms: readonly GlossaryTerm[]): Promise<NamespaceLoad> {
  if (!isValidNamespace(ns)) return { issues: validateKubejsData(ns, {}, {}) };
  const dir = join(root, ns);
  const extra = ((await listEntries(dir)) ?? [])
    .filter((e) => !e.isFile() || !ALLOWED_FILES.has(e.name))
    .map((e): ModpackIssue => ({ level: 'error', file: kubejsFile(ns, e.name), message: '只接受 en_us.json 與 zh_tw.json' }));
  const [en, zh] = await Promise.all([
    readJson(join(dir, KUBEJS_EN_FILE), kubejsFile(ns, KUBEJS_EN_FILE), false),
    readJson(join(dir, KUBEJS_ZH_FILE), kubejsFile(ns, KUBEJS_ZH_FILE), true),
  ]);
  const readIssues = [en, zh].flatMap((r) => (r && !r.ok ? [r.issue] : []));
  if (readIssues.length > 0 || !en?.ok) return { issues: [...extra, ...readIssues] };
  const zhValue = zh?.ok ? zh.value : {};
  const issues = [...extra, ...validateKubejsData(ns, en.value, zhValue, terms)];
  if (issues.some(isError)) return { issues };
  return { texts: { en: en.value as Record<string, string>, zh: zhValue as Record<string, string> }, issues };
}

async function loadKubejs(dir: string, terms: readonly GlossaryTerm[]): Promise<{ kubejs: KubejsData; issues: readonly ModpackIssue[] }> {
  const root = join(dir, KUBEJS_DIR);
  const entries = await listEntries(root);
  if (entries === null) return { kubejs: {}, issues: [] };
  const stray = entries
    .filter((e) => !e.isDirectory())
    .map((e): ModpackIssue => ({ level: 'error', file: `kubejs/${e.name}`, message: 'kubejs/ 底下只能放命名空間資料夾' }));
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const loads = await Promise.all(names.map((ns) => loadNamespace(root, ns, terms)));
  const kubejs = Object.fromEntries(names.flatMap((ns, i) => {
    const texts = loads[i]?.texts;
    return texts ? [[ns, texts] as const] : [];
  }));
  return { kubejs, issues: [...stray, ...loads.flatMap((l) => l.issues)] };
}

async function loadOne(root: string, id: string, terms: readonly GlossaryTerm[]): Promise<{ modpack?: LoadedModpack; issues: ModpackDataIssue[] }> {
  const dir = join(root, id);
  const [meta, kubejs] = await Promise.all([readJson(join(dir, MODPACK_FILE), MODPACK_FILE, false), loadKubejs(dir, terms)]);
  const metaIssues = !meta ? [] : meta.ok ? validateModpackMeta(id, meta.value) : [meta.issue];
  const tagged = [...metaIssues, ...kubejs.issues].map((i) => ({ ...i, modpackId: id }));
  if (!meta?.ok || tagged.some(isError)) return { issues: tagged };
  return { modpack: { meta: catalogModpackSchema.parse(meta.value), kubejs: kubejs.kubejs }, issues: tagged };
}

/** 讀取 `<dataDir>/modpacks/*`；有 error 的整合包不會出現在 modpacks 中；terms 為全域術語 */
export async function loadAllModpacks(dataDir: string, terms: readonly GlossaryTerm[] = []): Promise<ModpackLoadResult> {
  const root = join(dataDir, MODPACKS_DIR);
  const entries = await listEntries(root);
  if (entries === null) return { modpacks: [], issues: [] };
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const results = await Promise.all(names.map((id) => loadOne(root, id, terms)));
  return {
    modpacks: results.flatMap((r) => (r.modpack ? [r.modpack] : [])),
    issues: results.flatMap((r) => r.issues),
  };
}

/** 轉為 GitHub Actions 註記格式 */
export function formatModpackIssues(issues: readonly ModpackDataIssue[], dataDirLabel: string): string[] {
  return issues.map((i) => {
    const where = i.key ? `${i.key}：` : '';
    return `::${i.level} file=${dataDirLabel}/${MODPACKS_DIR}/${i.modpackId}/${i.file}::[modpack:${i.modpackId}] ${where}${i.message}`;
  });
}
