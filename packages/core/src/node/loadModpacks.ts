import { join } from 'node:path';
import type { GlossaryTerm } from '../glossary/schema';
import { type CatalogModpack, catalogModpackSchema, isValidNamespace } from '../modpack/schema';
import type { KubejsData, KubejsTexts, QuestData } from '../modpack/types';
import {
  KUBEJS_DIR, KUBEJS_EN_FILE, KUBEJS_ZH_FILE, kubejsFile, MODPACK_FILE, type ModpackIssue, validateKubejsData, validateModpackMeta,
} from '../modpack/validate';
import { loadQuestDir, questMetaIssues } from './loadQuests';
import { listEntries, loadTextPair, readJson } from './modpackFs';

/** `<dataDir>` 底下的整合包資料夾 */
export const MODPACKS_DIR = 'modpacks';

export interface LoadedModpack {
  readonly meta: CatalogModpack;
  readonly kubejs: KubejsData;
  /** FTB 任務文字；只在 modpack.json 的 ftbquests 為 supported 時存在 */
  readonly quests?: QuestData;
}

export type ModpackDataIssue = ModpackIssue & { readonly modpackId: string };

export interface ModpackLoadResult {
  readonly modpacks: readonly LoadedModpack[];
  readonly issues: readonly ModpackDataIssue[];
}

const isError = (i: ModpackIssue): boolean => i.level === 'error';

interface NamespaceLoad {
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

async function loadNamespace(root: string, ns: string, terms: readonly GlossaryTerm[]): Promise<NamespaceLoad> {
  if (!isValidNamespace(ns)) return { issues: validateKubejsData(ns, {}, {}) };
  return loadTextPair({
    dir: join(root, ns),
    enFile: KUBEJS_EN_FILE,
    zhFile: KUBEJS_ZH_FILE,
    fileOf: (name) => kubejsFile(ns, name),
    enOptional: false,
    validate: (en, zh) => validateKubejsData(ns, en, zh, terms),
  });
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

function questData(meta: CatalogModpack, texts: KubejsTexts | undefined): QuestData | undefined {
  return meta.ftbquests?.status === 'supported' && texts ? { layout: meta.ftbquests.layout, ...texts } : undefined;
}

async function loadOne(root: string, id: string, terms: readonly GlossaryTerm[]): Promise<{ modpack?: LoadedModpack; issues: ModpackDataIssue[] }> {
  const dir = join(root, id);
  const [meta, kubejs, quests] = await Promise.all([
    readJson(join(dir, MODPACK_FILE), MODPACK_FILE, false),
    loadKubejs(dir, terms),
    loadQuestDir(dir, terms),
  ]);
  const metaIssues = !meta ? [] : meta.ok ? validateModpackMeta(id, meta.value) : [meta.issue];
  const parsed = meta?.ok && metaIssues.length === 0 ? catalogModpackSchema.parse(meta.value) : null;
  const consistency = parsed ? questMetaIssues(parsed, quests) : [];
  const tagged = [...metaIssues, ...kubejs.issues, ...quests.issues, ...consistency].map((i) => ({ ...i, modpackId: id }));
  if (!parsed || tagged.some(isError)) return { issues: tagged };
  const data = questData(parsed, quests.texts);
  return { modpack: { meta: parsed, kubejs: kubejs.kubejs, ...(data ? { quests: data } : {}) }, issues: tagged };
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
