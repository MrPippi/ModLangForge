import type { BuiltinMod } from '../catalog/builtinSchema';
import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import type { SourceRef } from './addSourceVersion';
import { JSON_LANG_MIN_PACK_FORMAT, MACHINE_SOURCE_NAME, type ModrinthHit, SUMMARY_PLACEHOLDER } from './modrinth';

/** 草稿與內建條目共用的、平台中立的專案資訊；mcVersions／loaders 尚未篩選，由 buildDraftMeta 依本站支援的清單整理 */
export interface DraftProject {
  readonly name: string;
  readonly slug: string;
  readonly authors: readonly string[];
  readonly links: { readonly modrinth?: string; readonly curseforge?: string };
  readonly mcVersions: readonly string[];
  readonly loaders: readonly string[];
}

/** Modrinth 搜尋結果轉成草稿輸入；已確定相符的 CurseForge 連結接在 Modrinth 之後；authors 有給時取代搜尋結果的單一作者 */
export function draftFromModrinthHit(hit: ModrinthHit, curseforgeUrl?: string, authors?: readonly string[]): DraftProject {
  return {
    name: hit.title,
    slug: hit.slug,
    authors: authors ?? [hit.author],
    links: { modrinth: `https://modrinth.com/mod/${hit.slug}`, ...(curseforgeUrl !== undefined ? { curseforge: curseforgeUrl } : {}) },
    mcVersions: hit.versions,
    loaders: hit.categories,
  };
}

interface DraftInput {
  readonly project: DraftProject;
  readonly modId: string;
  readonly source: SourceRef;
  readonly builtinPercent?: number;
  readonly today: string;
}

/** 草稿與內建條目共用的欄位 */
function sharedMeta({ project, modId, today }: Pick<DraftInput, 'project' | 'modId' | 'today'>) {
  return {
    modId,
    name: project.name,
    aliases: project.slug !== modId ? [project.slug] : [],
    summary: SUMMARY_PLACEHOLDER,
    authors: [...project.authors],
    links: { ...project.links },
    mcVersions: PACK_FORMATS
      .filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT && project.mcVersions.includes(f.mcVersion))
      .map((f) => f.mcVersion),
    loaders: LOADERS.filter((l) => project.loaders.includes(l)),
    updatedAt: today,
  };
}

/** 產生機器翻譯用的 mod.json 草稿；summary 為佔位文字，需人工補上 */
export function buildDraftMeta({ project, modId, source, builtinPercent, today }: DraftInput): Record<string, unknown> {
  const { mcVersions, loaders, updatedAt, ...head } = sharedMeta({ project, modId, today });
  return {
    ...head,
    sourceVersions: [{ ...source, missingKeys: [] }],
    mcVersions,
    loaders,
    format: 'json',
    translation: {
      status: 'machine',
      license: 'CC-BY-SA-4.0',
      source: { name: MACHINE_SOURCE_NAME, url: null },
      contributors: [],
      ...(builtinPercent !== undefined ? { builtinPercent } : {}),
    },
    updatedAt,
  };
}

/** 產生內建繁中條目（data/builtin-mods）；summary 為佔位文字，需人工補上。checkedVersion 為實際檢查的 jar 版本 */
export function buildBuiltinMeta({ project, modId, source, today }: Omit<DraftInput, 'builtinPercent'>): BuiltinMod {
  const { modVersion, ...rest } = source;
  if (modVersion === undefined) throw new Error(`${modId}：內建條目需要來源版本號`);
  return { ...sharedMeta({ project, modId, today }), checkedVersion: { ...rest, modVersion } };
}
