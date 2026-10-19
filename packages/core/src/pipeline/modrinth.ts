import type { BuiltinMod } from '../catalog/builtinSchema';
import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS, PREFERRED_MC_VERSIONS } from '../export/packFormats';
import type { SourceRef } from './addSourceVersion';
import { buildSourceRef, fromModrinthVersion, pickBuild, pickBuildFor } from './build';

/** Modrinth /v2/search 回傳的單筆專案（僅用到的欄位） */
export interface ModrinthHit {
  readonly project_id: string;
  readonly slug: string;
  readonly title: string;
  readonly author: string;
  readonly description: string;
  readonly categories: readonly string[];
  readonly versions: readonly string[];
}

export interface ModrinthVersion {
  readonly id: string;
  readonly version_number: string;
  readonly game_versions: readonly string[];
  readonly loaders: readonly string[];
  readonly date_published: string;
  readonly files: readonly { readonly url: string; readonly filename: string; readonly primary: boolean }[];
}

export { PREFERRED_MC_VERSIONS };

/** 橫幅圖只接受 Modrinth CDN */
export const MODRINTH_CDN_PREFIX = 'https://cdn.modrinth.com/';

/** Modrinth /v2/project 的展示圖（僅用到的欄位） */
export interface ModrinthGalleryImage {
  readonly url: string;
  /** 未壓縮的原圖；url 是 Modrinth 縮小過的版本 */
  readonly raw_url?: string;
  readonly featured: boolean;
  readonly ordering: number;
}

/** Modrinth /v2/project 回傳的專案資訊（僅用到的欄位） */
export interface ModrinthProjectInfo {
  readonly downloads: number;
  readonly icon_url: string | null;
  readonly gallery: readonly ModrinthGalleryImage[];
}

/** 挑選橫幅：featured 優先，其次 ordering 最小；只考慮 Modrinth CDN 的圖。回傳依序嘗試的網址，沒有則為空陣列 */
export function bannerSources(gallery: readonly ModrinthGalleryImage[]): readonly string[] {
  const onCdn = (url: string | undefined): url is string => url?.startsWith(MODRINTH_CDN_PREFIX) ?? false;
  const usable = gallery.filter((g) => onCdn(g.url));
  const picked = usable.find((g) => g.featured) ?? [...usable].sort((a, b) => a.ordering - b.ordering)[0];
  if (!picked) return [];
  // 原圖較清晰，先試；太大或下載失敗時退回壓縮版
  return onCdn(picked.raw_url) && picked.raw_url !== picked.url ? [picked.raw_url, picked.url] : [picked.url];
}


export const SUMMARY_PLACEHOLDER = '（待補繁中簡介）';
export const MACHINE_SOURCE_NAME = 'Claude 機器翻譯';
/** JSON 語言檔自 1.13（資源包格式主版本號 4）起才有效；比較 PackFormat.packFormat（主版本號） */
export const JSON_LANG_MIN_PACK_FORMAT = 4;

/** 挑選支援偏好版本中最新發佈的版本 */
export function pickVersion(versions: readonly ModrinthVersion[]): ModrinthVersion | null {
  const builds = versions.map(fromModrinthVersion);
  const picked = pickBuild(builds);
  return picked ? (versions[builds.indexOf(picked)] ?? null) : null;
}

export function primaryFile(v: ModrinthVersion): ModrinthVersion['files'][number] | undefined {
  return v.files.find((f) => f.primary) ?? v.files[0];
}

/** 由 Modrinth 版本推斷來源版本；列出多個 MC 版本時優先 PREFERRED_MC_VERSIONS，再取最新的已知版本 */
export function resolveSourceRef(v: ModrinthVersion): SourceRef | null {
  return buildSourceRef(fromModrinthVersion(v));
}

/** 挑選指定 MC 版本與載入器中最新發佈、且有檔案的版本 */
export function pickVersionFor(versions: readonly ModrinthVersion[], mcVersion: string, loader: string): ModrinthVersion | null {
  const builds = versions.map(fromModrinthVersion);
  const picked = pickBuildFor(builds, mcVersion, loader);
  return picked ? (versions[builds.indexOf(picked)] ?? null) : null;
}

/** 遷移用：同一個 version_number 常對應多個條目（各載入器／MC 版本），依 fetch:modrinth 當初的挑選規則找出實際抽取的那一個 */
export function migrationSourceRef(versions: readonly ModrinthVersion[], modVersion: string): SourceRef | null {
  const picked = pickVersion(versions.filter((v) => v.version_number === modVersion));
  return picked ? resolveSourceRef(picked) : null;
}

const MODRINTH_MOD_URL = /^https:\/\/modrinth\.com\/mod\/([^/?#]+)\/?$/;

export function modrinthSlug(url: string | undefined): string | null {
  return url?.match(MODRINTH_MOD_URL)?.[1] ?? null;
}

interface DraftInput {
  readonly hit: ModrinthHit;
  readonly modId: string;
  readonly source: SourceRef;
  readonly builtinPercent?: number;
  readonly today: string;
}

/** 草稿與內建條目共用的欄位 */
function sharedMeta({ hit, modId, today }: Pick<DraftInput, 'hit' | 'modId' | 'today'>) {
  return {
    modId,
    name: hit.title,
    aliases: hit.slug !== modId ? [hit.slug] : [],
    summary: SUMMARY_PLACEHOLDER,
    authors: [hit.author],
    links: { modrinth: `https://modrinth.com/mod/${hit.slug}` },
    mcVersions: PACK_FORMATS
      .filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT && hit.versions.includes(f.mcVersion))
      .map((f) => f.mcVersion),
    loaders: LOADERS.filter((l) => hit.categories.includes(l)),
    updatedAt: today,
  };
}

/** 產生機器翻譯用的 mod.json 草稿；summary 為佔位文字，需人工補上 */
export function buildDraftMeta({ hit, modId, source, builtinPercent, today }: DraftInput): Record<string, unknown> {
  const { mcVersions, loaders, updatedAt, ...head } = sharedMeta({ hit, modId, today });
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
export function buildBuiltinMeta({ hit, modId, source, today }: Omit<DraftInput, 'builtinPercent'>): BuiltinMod {
  const { modVersion, ...rest } = source;
  if (modVersion === undefined) throw new Error(`${modId}：內建條目需要來源版本號`);
  return { ...sharedMeta({ hit, modId, today }), checkedVersion: { ...rest, modVersion } };
}
