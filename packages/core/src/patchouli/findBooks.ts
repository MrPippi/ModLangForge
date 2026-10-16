import type { DetectedGuide, GuideFiles, SkippedBook } from '../types';
import { parseGuideJson } from './fields';
import { isValidBookName, parseGuidePath } from './paths';

/** 讀取 jar 內的文字檔；由呼叫端負責大小限制 */
export type ReadText = (path: string) => Promise<string>;

export const SKIP_REASONS = {
  i18n: 'book.json 設定了 "i18n": true，文字已在語言檔裡',
  data: '手冊內容放在 data/，資源包無法覆蓋',
  noContent: '找不到英文（en_us）手冊內容',
  invalidName: '手冊名稱含不支援的字元',
  invalidJson: (path: string) => `${path} 不是合法的 JSON 物件`,
} as const;

const BOOK_PATH = /^(assets|data)\/([^/]+)\/patchouli_books\/([^/]+)\/(.+)$/;

interface BookRef {
  readonly root: 'assets' | 'data';
  readonly book: string;
  /** 手冊資料夾底下的相對路徑，例如 en_us/entries/a.json 或 book.json */
  readonly rest: string;
  readonly path: string;
}

type BookResult = { readonly files: GuideFiles } | { readonly skipped: SkippedBook };

function bookRefs(namespace: string, paths: readonly string[]): BookRef[] {
  return paths.flatMap((path): BookRef[] => {
    const m = BOOK_PATH.exec(path);
    if (!m || m[2] !== namespace) return [];
    const [, root = 'assets', , book = '', rest = ''] = m;
    return [{ root: root === 'data' ? 'data' : 'assets', book, rest, path }];
  });
}

const isEnglishJson = (rest: string): boolean => rest.startsWith('en_us/') && rest.endsWith('.json');

/** data/ 的 book.json 優先；沒有 book.json 時視為非 i18n */
async function readI18n(refs: readonly BookRef[], read: ReadText): Promise<{ ok: true; i18n: boolean } | { ok: false; path: string }> {
  const ref = refs.find((r) => r.rest === 'book.json' && r.root === 'data') ?? refs.find((r) => r.rest === 'book.json');
  if (!ref) return { ok: true, i18n: false };
  const data = parseGuideJson(await read(ref.path));
  return data ? { ok: true, i18n: data.i18n === true } : { ok: false, path: ref.path };
}

async function readBook(book: string, refs: readonly BookRef[], read: ReadText): Promise<BookResult> {
  const skip = (reason: string): BookResult => ({ skipped: { book, reason } });
  if (!isValidBookName(book)) return skip(SKIP_REASONS.invalidName);
  const meta = await readI18n(refs, read);
  if (!meta.ok) return skip(SKIP_REASONS.invalidJson(meta.path));
  if (meta.i18n) return skip(SKIP_REASONS.i18n);
  const content = refs.filter((r) => r.root === 'assets' && parseGuidePath(`${book}/${r.rest}`) !== null);
  if (content.length === 0) {
    return skip(refs.some((r) => r.root === 'data' && isEnglishJson(r.rest)) ? SKIP_REASONS.data : SKIP_REASONS.noContent);
  }
  const texts = await Promise.all(content.map((r) => read(r.path)));
  const broken = content.find((_r, i) => parseGuideJson(texts[i] ?? '') === null);
  if (broken) return skip(SKIP_REASONS.invalidJson(broken.path));
  return { files: Object.fromEntries(content.map((r, i) => [`${book}/${r.rest}`, texts[i] ?? ''])) };
}

/** 找出命名空間 namespace 下可翻譯的手冊（依手冊名稱排序）；沒有任何手冊時回傳 undefined */
export async function findBooks(namespace: string, paths: readonly string[], read: ReadText): Promise<DetectedGuide | undefined> {
  const refs = bookRefs(namespace, paths);
  const books = [...new Set(refs.map((r) => r.book))].sort();
  if (books.length === 0) return undefined;
  const results = await Promise.all(books.map((book) => readBook(book, refs.filter((r) => r.book === book), read)));
  return {
    files: Object.fromEntries(results.flatMap((r) => ('files' in r ? Object.entries(r.files) : []))),
    skipped: results.flatMap((r) => ('skipped' in r ? [r.skipped] : [])),
  };
}
