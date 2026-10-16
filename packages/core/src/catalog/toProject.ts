import { makeEntry } from '../merge/buildProject';
import { flatten } from '../patchouli/flatten';
import type { GuideFiles, ModProject, ProjectGuide } from '../types';
import type { CatalogMod } from './schema';

/** 站上手冊資料：原樣檔與攤平後的譯文 */
export interface CatalogGuide {
  readonly files: GuideFiles;
  readonly zh: Readonly<Record<string, string>>;
}

function guideProject(guide: CatalogGuide): ProjectGuide {
  const { source, order } = flatten(guide.files);
  return { files: guide.files, entries: order.map((key) => makeEntry(key, source[key] ?? '', guide.zh[key] ?? '', undefined)) };
}

/** 將站上資料轉為 ModProject，以便共用統計與匯出邏輯 */
export function catalogToProject(
  meta: CatalogMod,
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
  guide?: CatalogGuide,
): ModProject {
  return {
    id: meta.modId,
    modId: meta.modId,
    name: meta.name,
    version: meta.sourceVersions[0]?.modVersion ?? 'unknown',
    jarName: '',
    format: meta.format,
    entries: Object.entries(en).map(([key, source]) => makeEntry(key, source, zh[key] ?? '', undefined)),
    updatedAt: Date.parse(meta.updatedAt),
    ...(guide ? { guide: guideProject(guide) } : {}),
  };
}
