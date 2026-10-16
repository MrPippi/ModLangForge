import type { GuideFiles } from '../types';
import { parseGuideJson, textFields } from './fields';
import { guideKey, parseGuidePath } from './paths';

export interface FlatGuide {
  readonly source: Readonly<Record<string, string>>;
  readonly order: readonly string[];
}

/** 原樣檔集合 → key→英文；檔案依路徑排序，路徑無效或不是 JSON 物件的檔案略過 */
export function flatten(files: GuideFiles): FlatGuide {
  const pairs = Object.keys(files).sort().flatMap((path): [string, string][] => {
    const parsed = parseGuidePath(path);
    const data = parsed ? parseGuideJson(files[path] ?? '') : null;
    if (!parsed || !data) return [];
    return textFields(data).map((f): [string, string] => [guideKey(parsed, f.pointer), f.value]);
  });
  return { source: Object.fromEntries(pairs), order: pairs.map(([key]) => key) };
}
