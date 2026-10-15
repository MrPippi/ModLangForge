import type { CatalogMod, SourceVersion } from './schema';

export interface VersionCoverage {
  readonly source: SourceVersion;
  readonly total: number;
  readonly translated: number;
  readonly percent: number;
}

/** 計算每個來源版本的翻譯涵蓋率；分母為該版本實際擁有的 key */
export function versionCoverage(
  meta: Pick<CatalogMod, 'sourceVersions'>,
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
): VersionCoverage[] {
  return (meta.sourceVersions ?? []).map((source) => {
    const missing = new Set(source.missingKeys);
    const keys = Object.keys(en).filter((k) => !missing.has(k));
    const translated = keys.filter((k) => (zh[k] ?? '') !== '').length;
    const percent = keys.length === 0 ? 0 : Math.round((translated / keys.length) * 100);
    return { source, total: keys.length, translated, percent };
  });
}
