import type { CatalogMod, GroupedSourceVersion, SourceVersion, StoredSourceVersion } from './schema';

const sameKeys = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/** 除了載入器以外完全相同（建置版本、MC 版本、缺少的 key 與其順序） */
function sameBuild(a: SourceVersion, b: SourceVersion): boolean {
  return a.modVersion === b.modVersion && a.mcVersion === b.mcVersion && sameKeys(a.missingKeys, b.missingKeys);
}

function toStored(group: readonly SourceVersion[]): StoredSourceVersion {
  const [first] = group;
  if (!first) throw new Error('空的來源版本群組');
  if (group.length === 1) return first;
  const grouped: GroupedSourceVersion = {
    ...(first.modVersion !== undefined ? { modVersion: first.modVersion } : {}),
    mcVersion: first.mcVersion,
    loaders: group.map((v) => v.loader),
    missingKeys: first.missingKeys,
  };
  return grouped;
}

/**
 * 寫入 mod.json 前，把相鄰且只差在載入器的列合併成一列（loaders）。
 * 只合併相鄰列，展開後的順序與合併前完全相同（頁面以每個平台的最後一列為最新版）。
 */
export function groupSourceVersions(rows: readonly SourceVersion[]): StoredSourceVersion[] {
  const groups = rows.reduce<SourceVersion[][]>((acc, row) => {
    const last = acc.at(-1);
    const head = last?.[0];
    return last && head && sameBuild(head, row) ? [...acc.slice(0, -1), [...last, row]] : [...acc, [row]];
  }, []);
  return groups.map(toStored);
}

/** 轉成寫入 mod.json 的格式 */
export function toStoredMod(meta: CatalogMod): Omit<CatalogMod, 'sourceVersions'> & { sourceVersions: StoredSourceVersion[] } {
  return { ...meta, sourceVersions: groupSourceVersions(meta.sourceVersions) };
}
