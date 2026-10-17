import { platformModpackUrl } from '../modpack/resolve';
import {
  type CatalogModpack, catalogModpackSchema, isValidModpackId, type ModpackLoader, type ModpackMod, type ModpackPlatform,
} from '../modpack/schema';
import { findKeyConflicts, type KeyConflict } from '../pipeline/addSourceVersion';
import { MACHINE_SOURCE_NAME, SUMMARY_PLACEHOLDER } from '../pipeline/modrinth';
import type { KubejsEnglish } from './archive';

export const AUTHOR_PLACEHOLDER = '（待補作者）';

/** 從平台與壓縮檔取得的整合包資料 */
export interface ImportedModpack {
  readonly platform: ModpackPlatform;
  readonly projectId: string;
  readonly slug: string;
  readonly name: string;
  readonly authors: readonly string[];
  readonly version: string;
  readonly mcVersion: string;
  readonly loader: ModpackLoader;
  readonly mods: readonly ModpackMod[];
  readonly kubejs: KubejsEnglish;
  /** 給維護者看的提示（略過的檔案、查不到的專案） */
  readonly notes: readonly string[];
}

export interface ExistingModpack {
  readonly meta: CatalogModpack;
  readonly kubejsEn: KubejsEnglish;
}

export interface NamespaceChange {
  readonly ns: string;
  readonly created: boolean;
  readonly addedKeys: readonly string[];
  /** 原文不同的 key（保留既有原文） */
  readonly conflicts: readonly KeyConflict[];
}

export interface NamespacedConflict extends KeyConflict {
  readonly ns: string;
}

export type ModpackPlan =
  | { readonly kind: 'write'; readonly meta: CatalogModpack; readonly kubejsEn: KubejsEnglish; readonly changes: readonly NamespaceChange[] }
  | { readonly kind: 'refused'; readonly conflicts: readonly NamespacedConflict[] };

/** 平台 slug → 整合包 id（小寫）；不符合 id 規則時為 null */
export function modpackIdFromSlug(slug: string): string | null {
  const id = slug.toLowerCase();
  return isValidModpackId(id) ? id : null;
}

function sourceOf(incoming: ImportedModpack): CatalogModpack['source'] {
  const { platform, projectId, version, mcVersion, loader } = incoming;
  return { platform, projectId, version, mcVersion, loader };
}

function linkOf(incoming: ImportedModpack): Partial<CatalogModpack['links']> {
  return { [incoming.platform]: platformModpackUrl(incoming.platform, incoming.slug) };
}

function draftMeta(id: string, incoming: ImportedModpack, today: string): CatalogModpack {
  return catalogModpackSchema.parse({
    id,
    name: incoming.name,
    summary: SUMMARY_PLACEHOLDER,
    authors: incoming.authors.length > 0 ? incoming.authors : [AUTHOR_PLACEHOLDER],
    links: linkOf(incoming),
    source: sourceOf(incoming),
    mods: incoming.mods,
    translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: MACHINE_SOURCE_NAME, url: null }, contributors: [] },
    updatedAt: today,
  });
}

/** 更新只動 source、mods、平台連結與日期；名稱、簡介、作者、翻譯資訊由維護者維護 */
function updatedMeta(meta: CatalogModpack, incoming: ImportedModpack, today: string): CatalogModpack {
  return catalogModpackSchema.parse({
    ...meta,
    links: { ...meta.links, ...linkOf(incoming) },
    source: sourceOf(incoming),
    mods: incoming.mods,
    updatedAt: today,
  });
}

interface NamespaceResult {
  readonly change: NamespaceChange;
  readonly en: Readonly<Record<string, string>>;
}

/** 沿用 addSourceVersion：既有原文優先，新 key 依序附加在最後 */
function mergeNamespace(ns: string, current: Readonly<Record<string, string>> | undefined, incoming: Readonly<Record<string, string>>): NamespaceResult {
  const base = current ?? {};
  const addedKeys = Object.keys(incoming).filter((k) => !Object.hasOwn(base, k));
  return {
    change: { ns, created: current === undefined, addedKeys, conflicts: findKeyConflicts(base, incoming) },
    en: { ...base, ...Object.fromEntries(addedKeys.map((k) => [k, incoming[k] ?? ''])) },
  };
}

/** 決定要寫入的 modpack.json 與 KubeJS 英文；任何格式碼衝突都拒絕寫入 */
export function planModpackWrite(id: string, existing: ExistingModpack | null, incoming: ImportedModpack, today: string): ModpackPlan {
  const results = Object.keys(incoming.kubejs).sort().map((ns) => mergeNamespace(ns, existing?.kubejsEn[ns], incoming.kubejs[ns] ?? {}));
  const refused = results.flatMap(({ change }) =>
    change.conflicts.filter((c) => c.formatChanged).map((c): NamespacedConflict => ({ ...c, ns: change.ns })));
  if (refused.length > 0) return { kind: 'refused', conflicts: refused };
  const written = results.filter(({ change }) => change.created || change.addedKeys.length > 0);
  return {
    kind: 'write',
    meta: existing ? updatedMeta(existing.meta, incoming, today) : draftMeta(id, incoming, today),
    kubejsEn: Object.fromEntries(written.map(({ change, en }) => [change.ns, en])),
    changes: results.map((r) => r.change),
  };
}
