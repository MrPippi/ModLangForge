import { type CatalogMod, LOADERS, type SourceVersion } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { isPrerelease, type PlatformBuild, pickBuildFor } from './build';
import { JSON_LANG_MIN_PACK_FORMAT } from './modrinth';
import { NO_LINK_REASON, trackingPlatform } from './platform';

export type Loader = CatalogMod['loaders'][number];

export interface TrackTarget {
  readonly kind: 'update' | 'add';
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: PlatformBuild;
  /** 更新時，原本記錄的版本號（未記錄時省略） */
  readonly previous?: string;
}

export type TrackPlan = { readonly kind: 'skip'; readonly reason: string } | { readonly kind: 'track'; readonly targets: readonly TrackTarget[] };

/** 可用 JSON 語言檔的 MC 版本，新到舊 */
export const TRACKED_MC_VERSIONS: readonly string[] = PACK_FORMATS.filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT).map((f) => f.mcVersion);

/**
 * 已收錄的版本在平台上比挑出的版本晚發佈：挑選結果變舊（例如新版是測試版而被略過、或舊分支晚發佈），不能拿來取代。
 * 已收錄版本在平台上找不到時無從比較，照常更新。
 */
function recordsNewer(rows: readonly SourceVersion[], builds: readonly PlatformBuild[], latest: PlatformBuild, mcVersion: string, loader: Loader): boolean {
  const recorded = new Set(rows.map((r) => r.modVersion));
  // 只比對同一 MC 版本與載入器的建置：有些模組在各 MC 版本用同一個版本號
  return builds.some((b) => recorded.has(b.modVersion) && b.mcVersions.includes(mcVersion) && b.loaders.includes(loader) && b.publishedAt > latest.publishedAt);
}

function targetFor(meta: CatalogMod, builds: readonly PlatformBuild[], mcVersion: string, loader: Loader): TrackTarget | null {
  // Quilt 可載入 Fabric 模組；已有 Fabric 版時另記 Quilt 只會重複同一個 jar 或落後的版本
  if (loader === 'quilt' && pickBuildFor(builds, mcVersion, 'fabric')) return null;
  const latest = pickBuildFor(builds, mcVersion, loader);
  // 只有測試版的組合先不追蹤：測試版的 key 與內建翻譯在正式版前仍會變動
  if (!latest || isPrerelease(latest)) return null;
  const rows = meta.sourceVersions.filter((r) => r.mcVersion === mcVersion && r.loader === loader);
  if (rows.length === 0) return { kind: 'add', mcVersion, loader, version: latest };
  if (rows.some((r) => r.modVersion === latest.modVersion) || recordsNewer(rows, builds, latest, mcVersion, loader)) return null;
  const previous = rows.map((r) => r.modVersion).filter((m): m is string => m !== undefined).at(-1);
  return previous === undefined
    ? { kind: 'update', mcVersion, loader, version: latest }
    : { kind: 'update', mcVersion, loader, version: latest, previous };
}

/** 找出已收錄組合的新版本，以及平台上有、尚未收錄的支援組合；更新在前，新增依 MC 新到舊、再依載入器順序 */
export function planTracking(meta: CatalogMod, builds: readonly PlatformBuild[]): TrackPlan {
  if (meta.format !== 'json') return { kind: 'skip', reason: '使用 .lang 語言檔，不支援自動追蹤' };
  if (!trackingPlatform(meta.links)) return { kind: 'skip', reason: NO_LINK_REASON };
  const targets = TRACKED_MC_VERSIONS.flatMap((mc) => LOADERS.map((loader) => targetFor(meta, builds, mc, loader)))
    .filter((t): t is TrackTarget => t !== null);
  return { kind: 'track', targets: [...targets.filter((t) => t.kind === 'update'), ...targets.filter((t) => t.kind === 'add')] };
}

export interface ModTarget {
  readonly modId: string;
  readonly target: TrackTarget;
}

const mcRank = (mc: string): number => TRACKED_MC_VERSIONS.indexOf(mc);
const loaderRank = (loader: Loader): number => LOADERS.indexOf(loader);

function compareTargets(a: ModTarget, b: ModTarget): number {
  const kind = (a.target.kind === 'update' ? 0 : 1) - (b.target.kind === 'update' ? 0 : 1);
  return kind
    || mcRank(a.target.mcVersion) - mcRank(b.target.mcVersion)
    || loaderRank(a.target.loader) - loaderRank(b.target.loader)
    || a.modId.localeCompare(b.modId);
}

/** 依處理順序排序（更新在前、新增依 MC 新到舊與載入器順序）；回傳新陣列，不修改輸入 */
export function sortTargets(items: readonly ModTarget[]): ModTarget[] {
  return [...items].sort(compareTargets);
}

/** 全部模組合計取前 max 個目標；回傳新陣列，不修改輸入 */
export function selectTargets(items: readonly ModTarget[], max: number): { chosen: ModTarget[]; deferred: number } {
  const sorted = sortTargets(items);
  return { chosen: sorted.slice(0, max), deferred: Math.max(0, sorted.length - max) };
}

/** 作者不允許第三方下載（沒有下載網址）的目標無法取得 jar，先分開列為略過；回傳新陣列，不修改輸入 */
export function splitBlocked(items: readonly ModTarget[]): { allowed: ModTarget[]; blocked: ModTarget[] } {
  return {
    allowed: items.filter((i) => i.target.version.file.url !== null),
    blocked: items.filter((i) => i.target.version.file.url === null),
  };
}
