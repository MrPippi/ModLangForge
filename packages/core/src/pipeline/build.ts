import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS, PREFERRED_MC_VERSIONS } from '../export/packFormats';
import type { SourceRef } from './addSourceVersion';
import type { ModrinthVersion } from './modrinth';

/** 由 LOADERS 推導，避免與 trackPlan 形成循環匯入 */
export type Loader = (typeof LOADERS)[number];

export type Platform = 'modrinth' | 'curseforge';

/** 平台中立的模組版本：Modrinth 版本與 CurseForge 檔案都轉成這個形狀後再挑選 */
export interface PlatformBuild {
  readonly platform: Platform;
  readonly id: string;
  readonly modVersion: string;
  readonly mcVersions: readonly string[];
  readonly loaders: readonly Loader[];
  readonly publishedAt: string;
  readonly file: { readonly name: string; readonly url: string | null; readonly sha1?: string };
}

const isLoader = (value: string): value is Loader => (LOADERS as readonly string[]).includes(value);

/** Modrinth 版本轉成平台中立的版本；沒有檔案時 file 為空名稱 */
export function fromModrinthVersion(v: ModrinthVersion): PlatformBuild {
  const file = v.files.find((f) => f.primary) ?? v.files[0];
  return {
    platform: 'modrinth',
    id: v.id,
    modVersion: v.version_number,
    mcVersions: v.game_versions,
    loaders: v.loaders.filter(isLoader),
    publishedAt: v.date_published,
    file: file ? { name: file.filename, url: file.url } : { name: '', url: null },
  };
}

const newestFirst = (a: PlatformBuild, b: PlatformBuild): number => b.publishedAt.localeCompare(a.publishedAt);

/** 挑選支援偏好 MC 版本中最新發佈、且有檔案的版本 */
export function pickBuild(builds: readonly PlatformBuild[]): PlatformBuild | null {
  for (const mc of PREFERRED_MC_VERSIONS) {
    const matching = builds.filter((b) => b.mcVersions.includes(mc) && b.file.name !== '').sort(newestFirst);
    if (matching[0]) return matching[0];
  }
  return null;
}

/** 挑選指定 MC 版本與載入器中最新發佈、且有檔案的版本 */
export function pickBuildFor(builds: readonly PlatformBuild[], mcVersion: string, loader: string): PlatformBuild | null {
  return (
    builds
      .filter((b) => b.mcVersions.includes(mcVersion) && (b.loaders as readonly string[]).includes(loader) && b.file.name !== '')
      .sort(newestFirst)[0] ?? null
  );
}

/** NeoForge 自 1.20.1 之後成為主流，同一 jar 同時標示 forge 與 neoforge 時依 MC 版本選擇（比較資源包格式主版本號） */
const LAST_FORGE_FIRST_PACK_FORMAT = 15;

function loaderPreference(mcVersion: string): readonly Loader[] {
  const pack = PACK_FORMATS.find((f) => f.mcVersion === mcVersion)?.packFormat ?? 0;
  return pack > LAST_FORGE_FIRST_PACK_FORMAT ? ['neoforge', 'forge', 'fabric', 'quilt'] : LOADERS;
}

/** 由版本推斷來源版本；列出多個 MC 版本時優先 PREFERRED_MC_VERSIONS，再取最新的已知版本 */
export function buildSourceRef(b: PlatformBuild): SourceRef | null {
  const candidates = [...PREFERRED_MC_VERSIONS, ...PACK_FORMATS.map((f) => f.mcVersion)];
  const mcVersion = candidates.find((mc) => b.mcVersions.includes(mc));
  if (!mcVersion) return null;
  const loader = loaderPreference(mcVersion).find((l) => b.loaders.includes(l));
  return loader ? { modVersion: b.modVersion, mcVersion, loader } : null;
}
