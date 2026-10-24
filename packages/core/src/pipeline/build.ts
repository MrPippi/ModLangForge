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
  /** 平台標示為 alpha／beta；未標示時省略 */
  readonly prerelease?: boolean;
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
    ...(v.version_type !== undefined && v.version_type !== 'release' ? { prerelease: true } : {}),
    file: file ? { name: file.filename, url: file.url } : { name: '', url: null },
  };
}

const newestFirst = (a: PlatformBuild, b: PlatformBuild): number => b.publishedAt.localeCompare(a.publishedAt);

/** 版本號標示測試版（例如 1.8.0-BETA04、26.3.1-alpha、2.0-pre1）；平台沒標示 alpha／beta 時的補充判斷 */
const PRERELEASE_NAME = /(?:^|[^a-z])(?:alpha|beta|snapshot|pre\d+|rc\d+)(?:[^a-z]|$)/i;

export function isPrerelease(b: PlatformBuild): boolean {
  return b.prerelease === true || PRERELEASE_NAME.test(b.modVersion);
}

/** 有正式版時只考慮正式版，全部都是測試版才用測試版；呼叫端先篩出同一 MC 版本與載入器，以免其他版本的正式版讓只有測試版的組合被漏掉 */
function preferStable(builds: readonly PlatformBuild[]): readonly PlatformBuild[] {
  const stable = builds.filter((b) => !isPrerelease(b));
  return stable.length > 0 ? stable : builds;
}

const KNOWN_MC_VERSIONS = PACK_FORMATS.map((f) => f.mcVersion);
/**
 * 版本號裡的 MC 版本：前後不可緊接數字。三段的 MC 版本後面可以再接建置號（26.1.2.9、26.1.2.0.40）；
 * 兩段的只能接 .0（26.2.0.0.28），避免把模組自己的 26.1.12 當成 MC 26.1。
 */
const mcPattern = (mc: string): RegExp => {
  const tail = mc.split('.').length >= 3 ? '(?!\\d)' : '(?!\\d|\\.[1-9])';
  return new RegExp(`(?<![\\d.])${mc.replaceAll('.', '\\.')}${tail}`);
};
const MC_PATTERNS = new Map(KNOWN_MC_VERSIONS.map((mc) => [mc, mcPattern(mc)]));

/** 版本號或檔名裡寫明、且平台也列為支援的 MC 版本（例如 3.2.2+26.1.2 寫明 26.1.2） */
export function namedMcVersions(b: PlatformBuild): string[] {
  const text = `${b.modVersion} ${b.file.name}`;
  return b.mcVersions.filter((mc) => MC_PATTERNS.get(mc)?.test(text) === true);
}

/** 寫明為其他 MC 版本建置的 jar 不算這個 MC 版本的來源，避免把 26.1.2 的 jar 記成 26.1.1 */
function builtFor(b: PlatformBuild, mcVersion: string): boolean {
  if (!b.mcVersions.includes(mcVersion)) return false;
  const named = namedMcVersions(b);
  return named.length === 0 || named.includes(mcVersion);
}

/** 挑選支援偏好 MC 版本中最新發佈、且有檔案的版本；有正式版時不選測試版 */
export function pickBuild(builds: readonly PlatformBuild[]): PlatformBuild | null {
  for (const mc of PREFERRED_MC_VERSIONS) {
    const matching = preferStable(builds.filter((b) => builtFor(b, mc) && b.file.name !== '')).toSorted(newestFirst);
    if (matching[0]) return matching[0];
  }
  return null;
}

/** 挑選指定 MC 版本與載入器中最新發佈、且有檔案的版本；有正式版時不選測試版，寫明其他 MC 版本的 jar 不選 */
export function pickBuildFor(builds: readonly PlatformBuild[], mcVersion: string, loader: string): PlatformBuild | null {
  const matching = builds.filter((b) => builtFor(b, mcVersion) && (b.loaders as readonly string[]).includes(loader) && b.file.name !== '');
  return preferStable(matching).toSorted(newestFirst)[0] ?? null;
}

/** NeoForge 自 1.20.1 之後成為主流，同一 jar 同時標示 forge 與 neoforge 時依 MC 版本選擇（比較資源包格式主版本號） */
const LAST_FORGE_FIRST_PACK_FORMAT = 15;

export function loaderPreference(mcVersion: string): readonly Loader[] {
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
