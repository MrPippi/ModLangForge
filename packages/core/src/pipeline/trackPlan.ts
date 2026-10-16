import { type CatalogMod, LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { JSON_LANG_MIN_PACK_FORMAT, type ModrinthVersion, modrinthSlug, pickVersionFor } from './modrinth';

export type Loader = CatalogMod['loaders'][number];

export interface TrackTarget {
  readonly kind: 'update' | 'add';
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: ModrinthVersion;
  /** 更新時，原本記錄的版本號（未記錄時省略） */
  readonly previous?: string;
}

export type TrackPlan = { readonly kind: 'skip'; readonly reason: string } | { readonly kind: 'track'; readonly targets: readonly TrackTarget[] };

/** 可用 JSON 語言檔的 MC 版本，新到舊 */
export const TRACKED_MC_VERSIONS: readonly string[] = PACK_FORMATS.filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT).map((f) => f.mcVersion);

function targetFor(meta: CatalogMod, versions: readonly ModrinthVersion[], mcVersion: string, loader: Loader): TrackTarget | null {
  const latest = pickVersionFor(versions, mcVersion, loader);
  if (!latest) return null;
  const rows = meta.sourceVersions.filter((r) => r.mcVersion === mcVersion && r.loader === loader);
  if (rows.length === 0) return { kind: 'add', mcVersion, loader, version: latest };
  if (rows.some((r) => r.modVersion === latest.version_number)) return null;
  const previous = rows.map((r) => r.modVersion).filter((m): m is string => m !== undefined).at(-1);
  return previous === undefined
    ? { kind: 'update', mcVersion, loader, version: latest }
    : { kind: 'update', mcVersion, loader, version: latest, previous };
}

/** 找出已收錄組合的新版本，以及 Modrinth 上有、尚未收錄的支援組合；更新在前，新增依 MC 新到舊、再依載入器順序 */
export function planTracking(meta: CatalogMod, versions: readonly ModrinthVersion[]): TrackPlan {
  if (meta.format !== 'json') return { kind: 'skip', reason: '使用 .lang 語言檔，不支援自動追蹤' };
  if (!modrinthSlug(meta.links.modrinth)) return { kind: 'skip', reason: 'mod.json 沒有 Modrinth 連結' };
  const targets = TRACKED_MC_VERSIONS.flatMap((mc) => LOADERS.map((loader) => targetFor(meta, versions, mc, loader)))
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
