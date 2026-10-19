import { byUpdatedDesc, type ModSummary } from '../lib/summary';

export const ALL = '';

export interface ModFilter {
  readonly loader: string;
  readonly version: string;
  readonly status: string;
}

export function filterMods(mods: readonly ModSummary[], filter: ModFilter): ModSummary[] {
  const { loader, version, status } = filter;
  return mods.filter(
    (m) =>
      (loader === ALL || m.loaders.some((l) => l === loader)) &&
      (version === ALL || m.mcVersions.includes(version)) &&
      (status === ALL || m.status === status),
  );
}

export const SORT_KEYS = ['name', 'updated', 'percent', 'downloads'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const byName = (a: ModSummary, b: ModSummary): number => a.name.localeCompare(b.name);

const COMPARATORS: Readonly<Record<SortKey, (a: ModSummary, b: ModSummary) => number>> = {
  name: byName,
  updated: byUpdatedDesc,
  percent: (a, b) => b.percent - a.percent || byName(a, b),
  // 沒有下載量的排最後，再依名稱
  downloads: (a, b) => (b.downloads?.count ?? -1) - (a.downloads?.count ?? -1) || byName(a, b),
};

/** 回傳排序後的新陣列，不修改輸入 */
export function sortMods(mods: readonly ModSummary[], key: SortKey): ModSummary[] {
  return [...mods].sort(COMPARATORS[key]);
}
