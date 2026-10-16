import { stripBom } from '../lang/types';

/** 分類與條目檔頂層可翻譯欄位 */
export const TOP_FIELDS = ['name', 'description'] as const;
/** pages 陣列每頁可翻譯欄位 */
export const PAGE_FIELDS = ['title', 'text', 'link_text'] as const;

export type JsonObject = Record<string, unknown>;

export interface TextField {
  /** JSON 路徑，以 / 連接，例如 pages/0/text */
  readonly pointer: string;
  readonly value: string;
}

export function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 解析原樣檔；不是合法 JSON 物件時回傳 null */
export function parseGuideJson(text: string): JsonObject | null {
  try {
    const data: unknown = JSON.parse(stripBom(text));
    return isPlainObject(data) ? data : null;
  } catch {
    return null;
  }
}

function own(obj: JsonObject, field: string): unknown {
  return Object.hasOwn(obj, field) ? obj[field] : undefined;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function pick(obj: JsonObject, fields: readonly string[], prefix: string): TextField[] {
  return fields.flatMap((field): TextField[] => {
    const value = own(obj, field);
    return isText(value) ? [{ pointer: `${prefix}${field}`, value }] : [];
  });
}

/** 依固定順序列出可翻譯欄位：頂層 name、description，再依頁序列出 title、text、link_text */
export function textFields(data: JsonObject): TextField[] {
  const pages = own(data, 'pages');
  const pageFields = Array.isArray(pages)
    ? pages.flatMap((page: unknown, i: number) => (isPlainObject(page) ? pick(page, PAGE_FIELDS, `pages/${i}/`) : []))
    : [];
  return [...pick(data, TOP_FIELDS, ''), ...pageFields];
}
