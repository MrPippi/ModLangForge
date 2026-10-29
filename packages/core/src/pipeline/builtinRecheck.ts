import type { BuiltinMod } from '../catalog/builtinSchema';
import { PACK_FORMATS } from '../export/packFormats';
import type { DetectedMod } from '../types';
import { isPrerelease, loaderPreference, pickBuildFor, type PlatformBuild } from './build';
import { MACHINE_SOURCE_NAME } from './modrinth';
import { sourceOf, uncoveredKeys } from './select';
import { type Loader, TRACKED_MC_VERSIONS } from './trackPlan';

export interface BuiltinTarget {
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly build: PlatformBuild;
}

/** 同一 MC 版本時，目標必須比上次檢查的建置晚發佈；找不到上次的建置時無法比較，不重新檢查 */
function newerThanChecked(entry: BuiltinMod, builds: readonly PlatformBuild[], target: BuiltinTarget): boolean {
  const c = entry.checkedVersion;
  if (target.mcVersion !== c.mcVersion) return true;
  const checked = builds.find((b) => b.modVersion === c.modVersion && b.mcVersions.includes(c.mcVersion));
  return checked !== undefined && target.build.publishedAt > checked.publishedAt;
}

/**
 * 要重新檢查的建置：最新 MC 版本、最優先載入器的最新正式版。
 * 只看不比上次檢查更舊的 MC 版本；同一 MC 版本時要比上次檢查的建置新。沒有符合的建置時回傳 null。
 */
export function builtinRecheckTarget(entry: BuiltinMod, builds: readonly PlatformBuild[]): BuiltinTarget | null {
  const checkedRank = TRACKED_MC_VERSIONS.indexOf(entry.checkedVersion.mcVersion);
  const candidates = checkedRank < 0 ? TRACKED_MC_VERSIONS : TRACKED_MC_VERSIONS.slice(0, checkedRank + 1);
  for (const mcVersion of candidates) {
    for (const loader of loaderPreference(mcVersion)) {
      const build = pickBuildFor(builds, mcVersion, loader);
      if (!build || isPrerelease(build)) continue;
      const target = { mcVersion, loader, build };
      return newerThanChecked(entry, builds, target) ? target : null;
    }
  }
  return null;
}

export type BuiltinRecheck =
  /** 內建繁中仍然完整：更新檢查版本 */
  | { readonly kind: 'complete'; readonly entry: BuiltinMod }
  /** 內建繁中不完整：改為一般模組，只收錄內建缺少的 key */
  | { readonly kind: 'incomplete'; readonly meta: Record<string, unknown>; readonly en: Readonly<Record<string, string>>; readonly builtinPercent?: number };

const byPackFormat = (versions: Iterable<string>): string[] => {
  const set = new Set(versions);
  return PACK_FORMATS.map((f) => f.mcVersion).filter((v) => set.has(v));
};

/** 載入器第一個支援的 MC 版本：內建條目把 mcVersions 與 loaders 分開記，組合時要排除當時還不存在的載入器 */
const LOADER_SINCE: Partial<Readonly<Record<Loader, string>>> = { neoforge: '1.20.1', quilt: '1.18.2' };
const packFormatOf = (mc: string): number => PACK_FORMATS.find((f) => f.mcVersion === mc)?.packFormat ?? 0;

function loaderExisted(mcVersion: string, loader: Loader): boolean {
  const since = LOADER_SINCE[loader];
  return since === undefined || packFormatOf(mcVersion) >= packFormatOf(since);
}

/**
 * 原本內建條目涵蓋的版本：這些版本的內建繁中已確認完整，資源包不放任何 key（missingKeys 列出全部），
 * 之後追蹤到這些組合的新版本時，再依 jar 的內建繁中重新計算。
 * 新建置所在 MC 版本的其他載入器多半是同一版、同樣缺這些 key，先當成需要翻譯，等追蹤到實際的 jar 再修正。
 */
function builtinHistoryRows(entry: BuiltinMod, target: BuiltinTarget, keys: readonly string[]) {
  const c = entry.checkedVersion;
  return entry.mcVersions.flatMap((mcVersion) => entry.loaders
    .filter((loader) => loaderExisted(mcVersion, loader) && !(mcVersion === target.mcVersion && loader === target.loader))
    .map((loader) => ({
      ...(mcVersion === c.mcVersion && loader === c.loader ? { modVersion: c.modVersion } : {}),
      mcVersion,
      loader,
      missingKeys: mcVersion === target.mcVersion ? [] : [...keys],
    })));
}

/** 依新建置的內建繁中判斷內建條目要更新檢查版本，還是改為一般模組 */
export function recheckBuiltin(entry: BuiltinMod, target: BuiltinTarget, detected: DetectedMod, today: string): BuiltinRecheck {
  const { keys, builtinPercent } = uncoveredKeys(detected);
  const source = { modVersion: target.build.modVersion, mcVersion: target.mcVersion, loader: target.loader };
  const mcVersions = byPackFormat([...entry.mcVersions, target.mcVersion]);
  const loaders = entry.loaders.includes(target.loader) ? entry.loaders : [...entry.loaders, target.loader];
  if (builtinPercent !== undefined && keys.length === 0) {
    return {
      kind: 'complete',
      entry: {
        ...entry,
        mcVersions,
        loaders,
        checkedVersion: source,
        updatedAt: today,
      },
    };
  }
  const meta = {
    modId: entry.modId,
    name: entry.name,
    aliases: entry.aliases,
    summary: entry.summary,
    authors: entry.authors,
    links: entry.links,
    // 新建置放最後，頁面才會把它當成這個 MC 版本＋載入器的最新版
    sourceVersions: [...builtinHistoryRows(entry, target, keys), { ...source, missingKeys: [] }],
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
    updatedAt: today,
  };
  return { kind: 'incomplete', meta, en: sourceOf(detected, keys), ...(builtinPercent !== undefined ? { builtinPercent } : {}) };
}
