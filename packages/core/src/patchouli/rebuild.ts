import type { GuideFiles } from '../types';
import { isPlainObject, type JsonObject, PAGE_FIELDS, parseGuideJson, TOP_FIELDS } from './fields';
import { guideKey, type GuidePath, parseGuidePath } from './paths';

type Translations = Readonly<Record<string, string>>;

/** 只替換非空字串欄位；譯文為空或不存在時保留英文 */
function translated(translations: Translations, key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  const target = Object.hasOwn(translations, key) ? translations[key] : undefined;
  return target !== undefined && target !== '' ? target : value;
}

function replaceFields(obj: JsonObject, fields: readonly string[], keyOf: (field: string) => string, translations: Translations): JsonObject {
  return Object.fromEntries(
    Object.entries(obj).map(([field, value]) => [field, fields.includes(field) ? translated(translations, keyOf(field), value) : value]),
  );
}

function translateFile(path: GuidePath, data: JsonObject, translations: Translations): JsonObject {
  const top = replaceFields(data, TOP_FIELDS, (f) => guideKey(path, f), translations);
  const pages = Object.hasOwn(data, 'pages') ? data.pages : undefined;
  if (!Array.isArray(pages)) return top;
  return {
    ...top,
    pages: pages.map((page: unknown, i: number) =>
      isPlainObject(page) ? replaceFields(page, PAGE_FIELDS, (f) => guideKey(path, `pages/${i}/${f}`), translations) : page,
    ),
  };
}

export function serializeGuide(data: JsonObject): string {
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * 以譯文重建原樣檔，回傳與輸入相同路徑的新檔案集合。
 * 未翻譯保留英文、非文字欄位原樣保留；路徑無效（含 templates/）或無法解析的檔案原樣回傳。
 */
export function rebuild(files: GuideFiles, translations: Translations): GuideFiles {
  return Object.fromEntries(
    Object.entries(files).map(([path, text]) => {
      const parsed = parseGuidePath(path);
      const data = parsed ? parseGuideJson(text) : null;
      return [path, parsed && data ? serializeGuide(translateFile(parsed, data, translations)) : text];
    }),
  );
}
