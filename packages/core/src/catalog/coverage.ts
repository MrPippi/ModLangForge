import type { CatalogMod, SourceVersion } from './schema';

export interface VersionCoverage {
  readonly source: SourceVersion;
  readonly total: number;
  readonly translated: number;
  readonly percent: number;
  /** 這個版本沒有需要本站翻譯的 key（例如模組自帶的繁中已全部涵蓋）；percent 記為 100 */
  readonly nothingToTranslate: boolean;
}

/** 計算每個來源版本的翻譯涵蓋率；分母為該版本實際擁有的 key */
export function versionCoverage(
  meta: Pick<CatalogMod, 'sourceVersions'>,
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
): VersionCoverage[] {
  return meta.sourceVersions.map((source) => {
    const missing = new Set(source.missingKeys);
    const keys = Object.keys(en).filter((k) => !missing.has(k));
    const translated = keys.filter((k) => (zh[k] ?? '') !== '').length;
    const nothingToTranslate = keys.length === 0;
    const percent = nothingToTranslate ? 100 : Math.round((translated / keys.length) * 100);
    return { source, total: keys.length, translated, percent, nothingToTranslate };
  });
}

export interface SplitCoverage {
  readonly latest: readonly VersionCoverage[];
  readonly older: readonly VersionCoverage[];
}

/**
 * 每個 MC 版本＋載入器只取最後一列為最新版（新列一律附加在最後），其餘為較舊的建置；兩組都保留原順序。
 * 舊建置因為有新版沒有的 key 而保留在資料中，頁面可收合顯示。
 */
export function splitLatestCoverage(coverage: readonly VersionCoverage[]): SplitCoverage {
  const platform = (c: VersionCoverage): string => `${c.source.mcVersion}\u0000${c.source.loader}`;
  const lastIndex = new Map(coverage.map((c, i) => [platform(c), i]));
  const isLatest = (c: VersionCoverage, i: number): boolean => lastIndex.get(platform(c)) === i;
  return { latest: coverage.filter(isLatest), older: coverage.filter((c, i) => !isLatest(c, i)) };
}

/**
 * 某個 Minecraft 版本的資源包不需要的 key：該 MC 版本每一列來源版本都列在 missingKeys 裡
 * （jar 沒有這個 key，或模組內建繁中已涵蓋）。把它們留在資源包裡會蓋掉模組內建的譯文；
 * 沒有這個 MC 版本的來源列時無從判斷，回傳空集合。
 */
export function keysNotNeededFor(meta: Pick<CatalogMod, 'sourceVersions'>, mcVersion: string): ReadonlySet<string> {
  const rows = meta.sourceVersions.filter((v) => v.mcVersion === mcVersion);
  const [first, ...rest] = rows;
  if (!first) return new Set();
  const others = rest.map((v) => new Set(v.missingKeys));
  return new Set(first.missingKeys.filter((k) => others.every((s) => s.has(k))));
}
