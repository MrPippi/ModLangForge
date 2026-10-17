import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS, PREFERRED_MC_VERSIONS } from '../export/packFormats';
import type { SourceRef } from './addSourceVersion';

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

export const SUMMARY_PLACEHOLDER = '（待補繁中簡介）';
export const MACHINE_SOURCE_NAME = 'Claude 機器翻譯';
/** JSON 語言檔自 1.13（資源包格式主版本號 4）起才有效；比較 PackFormat.packFormat（主版本號） */
export const JSON_LANG_MIN_PACK_FORMAT = 4;

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

/** NeoForge 自 1.20.1 之後成為主流，同一 jar 同時標示 forge 與 neoforge 時依 MC 版本選擇（比較資源包格式主版本號） */
const LAST_FORGE_FIRST_PACK_FORMAT = 15;

function loaderPreference(mcVersion: string): readonly (typeof LOADERS)[number][] {
  const pack = PACK_FORMATS.find((f) => f.mcVersion === mcVersion)?.packFormat ?? 0;
  return pack > LAST_FORGE_FIRST_PACK_FORMAT ? ['neoforge', 'forge', 'fabric', 'quilt'] : LOADERS;
}

/** 由 Modrinth 版本推斷來源版本；列出多個 MC 版本時優先 PREFERRED_MC_VERSIONS，再取最新的已知版本 */
export function resolveSourceRef(v: ModrinthVersion): SourceRef | null {
  const candidates = [...PREFERRED_MC_VERSIONS, ...PACK_FORMATS.map((f) => f.mcVersion)];
  const mcVersion = candidates.find((mc) => v.game_versions.includes(mc));
  if (!mcVersion) return null;
  const loader = loaderPreference(mcVersion).find((l) => v.loaders.includes(l));
  return loader ? { modVersion: v.version_number, mcVersion, loader } : null;
}

/** 挑選指定 MC 版本與載入器中最新發佈、且有檔案的版本 */
export function pickVersionFor(versions: readonly ModrinthVersion[], mcVersion: string, loader: string): ModrinthVersion | null {
  return (
    versions
      .filter((v) => v.game_versions.includes(mcVersion) && v.loaders.includes(loader) && v.files.length > 0)
      .sort((a, b) => b.date_published.localeCompare(a.date_published))[0] ?? null
  );
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

/** 產生機器翻譯用的 mod.json 草稿；summary 為佔位文字，需人工補上 */
export function buildDraftMeta({ hit, modId, source, builtinPercent, today }: DraftInput): Record<string, unknown> {
  return {
    modId,
    name: hit.title,
    aliases: hit.slug !== modId ? [hit.slug] : [],
    summary: SUMMARY_PLACEHOLDER,
    authors: [hit.author],
    links: { modrinth: `https://modrinth.com/mod/${hit.slug}` },
    sourceVersions: [{ ...source, missingKeys: [] }],
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
