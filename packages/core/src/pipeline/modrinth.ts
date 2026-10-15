import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';

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

/** 依序偏好的 Minecraft 版本 */
export const PREFERRED_MC_VERSIONS = ['1.21.1', '1.20.1'] as const;

export const SUMMARY_PLACEHOLDER = '（待補繁中簡介）';
export const MACHINE_SOURCE_NAME = 'Claude 機器翻譯';
/** JSON 語言檔自 1.13（pack_format 4）起才有效 */
const JSON_LANG_MIN_PACK_FORMAT = 4;

/** 挑選支援偏好版本中最新發佈的版本 */
export function pickVersion(versions: readonly ModrinthVersion[]): ModrinthVersion | null {
  for (const mc of PREFERRED_MC_VERSIONS) {
    const matching = versions
      .filter((v) => v.game_versions.includes(mc) && v.files.length > 0)
      .sort((a, b) => b.date_published.localeCompare(a.date_published));
    if (matching[0]) return matching[0];
  }
  return null;
}

export function primaryFile(v: ModrinthVersion): ModrinthVersion['files'][number] | undefined {
  return v.files.find((f) => f.primary) ?? v.files[0];
}

interface DraftInput {
  readonly hit: ModrinthHit;
  readonly modId: string;
  readonly modVersion: string;
  readonly builtinPercent?: number;
  readonly today: string;
}

/** 產生機器翻譯用的 mod.json 草稿；summary 為佔位文字，需人工補上 */
export function buildDraftMeta({ hit, modId, modVersion, builtinPercent, today }: DraftInput): Record<string, unknown> {
  return {
    modId,
    name: hit.title,
    aliases: hit.slug !== modId ? [hit.slug] : [],
    summary: SUMMARY_PLACEHOLDER,
    authors: [hit.author],
    links: { modrinth: `https://modrinth.com/mod/${hit.slug}` },
    modVersion,
    mcVersions: PACK_FORMATS
      .filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT && hit.versions.includes(f.mcVersion))
      .map((f) => f.mcVersion),
    loaders: LOADERS.filter((l) => hit.categories.includes(l)),
    format: 'json',
    translation: {
      status: 'machine',
      license: 'CC-BY-SA-4.0',
      source: { name: MACHINE_SOURCE_NAME, url: null },
      contributors: [],
      ...(builtinPercent !== undefined ? { builtinPercent } : {}),
    },
    updatedAt: today,
  };
}
