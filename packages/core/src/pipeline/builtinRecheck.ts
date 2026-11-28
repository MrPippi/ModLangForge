import type { BuiltinMod } from '../catalog/builtinSchema';
import { LOADERS } from '../catalog/schema';
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

/** 可以代替該載入器執行的 jar：Quilt 可載入 Fabric 模組，1.20.1 的 NeoForge 可載入 Forge 模組 */
function runnableLoaders(mcVersion: string, loader: Loader): readonly Loader[] {
  if (loader === 'quilt') return ['quilt', 'fabric'];
  if (loader === 'neoforge' && mcVersion === '1.20.1') return ['neoforge', 'forge'];
  return [loader];
}

const buildsAt = (builds: readonly PlatformBuild[], mcVersion: string): PlatformBuild[] => builds.filter((b) => b.mcVersions.includes(mcVersion));

/**
 * 內建條目把 MC 版本與載入器分開記，兩兩組合會產生平台上沒有的組合（例如只有 NeoForge 版的 MC 版本也配上 Forge）。
 * 該 MC 版本在平台上有建置時，只保留有對應 jar 的載入器；完全沒有建置時（舊檔案可能沒列出）沿用原本的記錄。
 */
function offered(builds: readonly PlatformBuild[], mcVersion: string, loader: Loader): boolean {
  const atVersion = buildsAt(builds, mcVersion);
  if (atVersion.length === 0) return true;
  const runnable = runnableLoaders(mcVersion, loader);
  return atVersion.some((b) => b.loaders.some((l) => (runnable as readonly string[]).includes(l)));
}

/** 上次檢查與新建置之間、平台上有正式版的 MC 版本（不含兩端） */
function versionsBetween(entry: BuiltinMod, target: BuiltinTarget, builds: readonly PlatformBuild[]): string[] {
  const from = TRACKED_MC_VERSIONS.indexOf(target.mcVersion);
  const to = TRACKED_MC_VERSIONS.indexOf(entry.checkedVersion.mcVersion);
  if (from < 0 || to <= from + 1) return [];
  const loaders: readonly string[] = [...entry.loaders, target.loader];
  return TRACKED_MC_VERSIONS.slice(from + 1, to)
    .filter((mc) => buildsAt(builds, mc).some((b) => !isPrerelease(b) && b.loaders.some((l) => loaders.includes(l))));
}

/**
 * 原本內建條目涵蓋的版本：這些版本的內建繁中已確認完整，資源包不放任何 key（missingKeys 列出全部），
 * 之後追蹤到這些組合的新版本時，再依 jar 的內建繁中重新計算。
 * 新建置所在 MC 版本的其他載入器多半是同一版、同樣缺這些 key，先當成需要翻譯，等追蹤到實際的 jar 再修正。
 */
function builtinHistoryRows(entry: BuiltinMod, target: BuiltinTarget, keys: readonly string[], builds: readonly PlatformBuild[]) {
  const c = entry.checkedVersion;
  const isChecked = (mcVersion: string, loader: Loader): boolean => mcVersion === c.mcVersion && loader === c.loader;
  return entry.mcVersions.flatMap((mcVersion) => entry.loaders
    .filter((loader) => loaderExisted(mcVersion, loader) && !(mcVersion === target.mcVersion && loader === target.loader))
    .filter((loader) => isChecked(mcVersion, loader) || offered(builds, mcVersion, loader))
    .map((loader) => ({
      ...(isChecked(mcVersion, loader) ? { modVersion: c.modVersion } : {}),
      mcVersion,
      loader,
      missingKeys: mcVersion === target.mcVersion ? [] : [...keys],
    })));
}

/**
 * 依新建置的內建繁中判斷內建條目要更新檢查版本，還是改為一般模組。
 * builds 是平台上的全部建置：用來排除平台上沒有的組合，並補上上次檢查之後才有建置的 MC 版本。
 */
export function recheckBuiltin(
  entry: BuiltinMod,
  target: BuiltinTarget,
  detected: DetectedMod,
  today: string,
  builds: readonly PlatformBuild[],
): BuiltinRecheck {
  const { keys, builtinPercent } = uncoveredKeys(detected);
  const source = { modVersion: target.build.modVersion, mcVersion: target.mcVersion, loader: target.loader };
  const loaders = entry.loaders.includes(target.loader) ? entry.loaders : [...entry.loaders, target.loader];
  if (builtinPercent !== undefined && keys.length === 0) {
    return {
      kind: 'complete',
      entry: {
        ...entry,
        // 上次檢查與這次之間的 MC 版本沒有逐一下載檢查；前後兩個版本的內建繁中都完整，視為同樣完整
        mcVersions: byPackFormat([...entry.mcVersions, ...versionsBetween(entry, target, builds), target.mcVersion]),
        loaders,
        checkedVersion: source,
        updatedAt: today,
      },
    };
  }
  const sourceVersions = [...builtinHistoryRows(entry, target, keys, builds), { ...source, missingKeys: [] }];
  const meta = {
    modId: entry.modId,
    name: entry.name,
    aliases: entry.aliases,
    summary: entry.summary,
    authors: entry.authors,
    links: entry.links,
    // 新建置放最後，頁面才會把它當成這個 MC 版本＋載入器的最新版
    sourceVersions,
    mcVersions: byPackFormat(sourceVersions.map((r) => r.mcVersion)),
    loaders: LOADERS.filter((l) => sourceVersions.some((r) => r.loader === l)),
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
