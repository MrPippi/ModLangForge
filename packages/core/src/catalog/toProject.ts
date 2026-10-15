import { makeEntry } from '../merge/buildProject';
import type { ModProject } from '../types';
import type { CatalogMod } from './schema';

/** 將站上資料轉為 ModProject，以便共用統計與匯出邏輯 */
export function catalogToProject(
  meta: CatalogMod,
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
): ModProject {
  return {
    id: meta.modId,
    modId: meta.modId,
    name: meta.name,
    version: meta.modVersion ?? 'unknown',
    jarName: '',
    format: meta.format,
    entries: Object.entries(en).map(([key, source]) => makeEntry(key, source, zh[key] ?? '', undefined)),
    updatedAt: Date.parse(meta.updatedAt),
  };
}
