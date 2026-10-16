/** 手冊名稱沿用命名空間規則；排除 . 與 .. 以免匯出路徑跳脫 */
const VALID_BOOK = /^[a-z0-9_.-]+$/;
const GUIDE_PATH = /^([^/]+)\/en_us\/(.+\.json)$/;
const VALID_SEGMENT = /^[a-z0-9_.-]+$/;
const UNSAFE_SEGMENTS = new Set(['', '.', '..']);

export interface GuidePath {
  readonly book: string;
  /** en_us 底下的相對路徑，例如 entries/basics/intro.json */
  readonly rel: string;
}

export function isValidBookName(book: string): boolean {
  return VALID_BOOK.test(book) && book !== '.' && book !== '..';
}

/** 解析 GuideFiles 的路徑；不在 `<book>/en_us/` 下、位於 templates/、或含不安全片段時回傳 null */
export function parseGuidePath(path: string): GuidePath | null {
  const m = GUIDE_PATH.exec(path);
  if (!m) return null;
  const [, book = '', rel = ''] = m;
  if (!isValidBookName(book)) return null;
  const segments = rel.split('/');
  if (segments[0] === 'templates') return null;
  if (segments.some((s) => UNSAFE_SEGMENTS.has(s) || !VALID_SEGMENT.test(s))) return null;
  return { book, rel };
}

/** 條目 key：`<book>/<en_us 下的相對路徑>#<JSON 路徑>` */
export function guideKey(path: GuidePath, pointer: string): string {
  return `${guideFilePrefix(path)}#${pointer}`;
}

/** 同一檔案所有 key 共用的前綴（`#` 之前） */
export function guideFilePrefix(path: GuidePath): string {
  return `${path.book}/${path.rel}`;
}

/** 資源包內的譯文檔路徑；路徑無效時回傳 null */
export function guidePackPath(modId: string, path: string): string | null {
  const parsed = parseGuidePath(path);
  return parsed ? `assets/${modId}/patchouli_books/${parsed.book}/zh_tw/${parsed.rel}` : null;
}
