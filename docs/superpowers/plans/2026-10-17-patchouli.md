# Patchouli 手冊翻譯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 jar 內的 Patchouli 手冊（`assets/<ns>/patchouli_books/<book>/en_us/**.json`）能被讀出、攤平成 key→文字翻譯、收錄到 `data/`、在網站顯示獨立進度，並在資源包中以 `zh_tw` 手冊檔輸出。

**Architecture:** `packages/core/src/patchouli/` 提供純函式：路徑解析、`findBooks`（jar 路徑＋注入的讀檔函式 → 原樣檔與略過原因）、`flatten`／`rebuild`（原樣檔 ↔ key→文字，可還原）、`checkGuideFormat`（`$(…)` 格式碼＋既有格式碼）。`readJar` 把手冊放進 `DetectedMod.guide`；`ModProject.guide` 與語言檔條目分開，`buildProject`／`mergeProject`／`updateEntry(section)`／`guideStats` 共用既有規則；資源包輸出時以 `rebuild` 重建並寫到 `assets/<modId>/patchouli_books/<book>/zh_tw/`。`loadAllMods` 讀 `patchouli/**` 與 `patchouli_zh_tw.json` 並驗證；網站、API、下載包與 translator 都經由 `catalogToProject(meta, en, zh, guide)` 共用同一套統計與匯出。

**Tech Stack:** TypeScript、zod 4、JSZip、Vitest（core: node；site: jsdom＋Testing Library＋fake-indexeddb）、Astro 7、React 18、zustand、Playwright（wrangler dev）。

**Spec:** `docs/superpowers/specs/2026-10-17-patchouli-design.md`

## Global Constraints

- 只支援 `assets/<ns>/patchouli_books/<book>/en_us/**.json`，且 `<ns>` 等於 modId；其他命名空間的手冊歸屬各自的命名空間，不併入本模組。
- 略過並回報原因：`book.json`（`data/<ns>/patchouli_books/<book>/book.json` 或 `assets/…/book.json`）設定 `"i18n": true`；內容位於 `data/` 的手冊。`templates/` 目錄不擷取。
- 擷取欄位：分類與條目檔的頂層 `name`、`description`；`pages` 陣列中每頁的 `title`、`text`、`link_text`。只擷取字串值（空字串不擷取）。
- Key 格式：`<book>/<en_us 下的相對路徑>#<JSON 路徑>`，JSON 路徑以 `/` 連接、陣列以索引表示，例：`guide/categories/basics.json#name`、`guide/entries/basics/intro.json#pages/0/text`。
- `GuideFiles = Readonly<Record<string, string>>`：路徑相對 `patchouli/`（例 `guide/en_us/entries/a.json`）→ 原始 JSON 文字。
- `rebuild(files, flatten(files).source)` 產生的 JSON 與原檔語意相同（`JSON.parse` 後深度相等）。
- 資料格式：`data/mods/<modId>/patchouli/<book>/en_us/**.json`（原樣英文）＋選填 `patchouli_zh_tw.json`（攤平譯文）。英文原文只存原樣檔，不另存攤平檔。無手冊的模組行為與現在完全相同。
- 驗證：原樣檔不是合法 JSON → error；譯文 key 不存在於攤平原文 → error；格式碼（含 `$(…)`）不一致 → warning；術語表套用於手冊文字（依術語 level）。
- 網站：目錄排序與篩選仍以語言檔為準；`ModSummary.hasGuide: boolean`；`/api/v1/mods/<id>.json` 新增選填 `guide: { files, zh_tw }`，`version` 維持 1。
- 輸出：資源包（合併／分開）含手冊；`lang-files` 不含手冊；貢獻檔多出 `<modId>/patchouli/**` 與 `<modId>/patchouli_zh_tw.json`。
- IndexedDB 既有專案沒有 `guide` 欄位，視為無手冊。
- 不在範圍：`data/` 舊式手冊、自訂模板文字、`add:version` 與每週追蹤更新手冊、Phase 3 建議回報套用於手冊。
- 不可變：所有函式回傳新物件／陣列，不修改輸入。使用者看到的文字為台灣繁中、用玩家看得懂的說法。
- Commit 訊息用英文 Conventional Commits，不得含 `Claude-Session` 或任何 claude.ai 連結。core 覆蓋率維持 ≥ 80%。

## Review Focus

1. 頁面欄位是空字串、非字串（數字、物件）或頁面本身不是物件 → 不擷取、重建時原樣保留，不拋錯。（Task 1 測試 `leaves empty, non-string and non-object values untouched`）
2. 手冊名稱或相對路徑含 `..`、空白、大寫、反斜線，或位於 `templates/` → 不擷取，資源包絕不寫到 `assets/<modId>/patchouli_books/<book>/zh_tw/` 之外。（Task 1 `parseGuidePath`／`guidePackPath` 測試；Task 3 `invalidName` 測試）
3. jar 內手冊 JSON 損壞或帶 BOM → 損壞的手冊以原因略過、BOM 正常讀取，語言檔條目照常載入。（Task 3 `findBooks` 與 `readJar` 測試）
4. 同模組重新上傳：頁面文字改了、頁面被刪、或新版沒有手冊 → 原文未變的譯文保留、改過的清空並標 new、刪掉的標 obsolete 且譯文不遺失。（Task 4 `mergeProject` 測試）
5. 舊資料沒有手冊欄位：舊目錄 index 沒有 `hasGuide`、IndexedDB 舊專案沒有 `guide` → 視為無手冊，不報錯。（Task 7 `catalogIndex` 預設值測試；Task 9 `filterEntries` 無手冊專案測試）

---

### Task 1: 手冊路徑、攤平與重建

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/patchouli/paths.ts`
- Create: `packages/core/src/patchouli/fields.ts`
- Create: `packages/core/src/patchouli/flatten.ts`
- Create: `packages/core/src/patchouli/rebuild.ts`
- Create: `packages/core/src/patchouli/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/patchouli/paths.test.ts`
- Test: `packages/core/src/patchouli/flatten.test.ts`

**Interfaces:**
- Consumes: `stripBom`（`lang/types`）
- Produces（`types.ts`）:
  - `type GuideFiles = Readonly<Record<string, string>>`
  - `interface SkippedBook { book: string; reason: string }`
  - `interface DetectedGuide { files: GuideFiles; skipped: readonly SkippedBook[] }`
  - `interface ProjectGuide { files: GuideFiles; entries: readonly TranslationEntry[] }`
  - `type EntrySection = 'lang' | 'guide'`
  - `DetectedMod.guide?: DetectedGuide`、`ModProject.guide?: ProjectGuide`
- Produces（`patchouli/`）:
  - `interface GuidePath { book: string; rel: string }`
  - `isValidBookName(book: string): boolean`
  - `parseGuidePath(path: string): GuidePath | null`
  - `guideKey(path: GuidePath, pointer: string): string`
  - `guideFilePrefix(path: GuidePath): string`
  - `guidePackPath(modId: string, path: string): string | null`
  - `TOP_FIELDS`、`PAGE_FIELDS`、`type JsonObject`、`isPlainObject(value: unknown): value is JsonObject`、`parseGuideJson(text: string): JsonObject | null`、`textFields(data: JsonObject): TextField[]`（`fields.ts`，僅 `TOP_FIELDS`／`PAGE_FIELDS` 由 index 匯出）
  - `interface FlatGuide { source: Readonly<Record<string, string>>; order: readonly string[] }`
  - `flatten(files: GuideFiles): FlatGuide`
  - `rebuild(files: GuideFiles, translations: Readonly<Record<string, string>>): GuideFiles`
  - `serializeGuide(data: JsonObject): string`

- [ ] **Step 1: Write the failing tests** — `packages/core/src/patchouli/paths.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { guideFilePrefix, guideKey, guidePackPath, isValidBookName, parseGuidePath } from './index';

describe('parseGuidePath', () => {
  it('splits a book path into book and path under en_us', () => {
    expect(parseGuidePath('guide/en_us/entries/basics/intro.json')).toEqual({ book: 'guide', rel: 'entries/basics/intro.json' });
  });

  it.each([
    ['guide/en_us/templates/custom.json'],
    ['guide/zh_tw/entries/a.json'],
    ['guide/en_us/entries/a.txt'],
    ['../en_us/a.json'],
    ['Bad Book/en_us/a.json'],
    ['guide/en_us/../../x.json'],
    ['guide/en_us/entries//a.json'],
    ['guide/en_us/a\\..\\b.json'],
    ['en_us/a.json'],
  ])('rejects %s', (path) => {
    expect(parseGuidePath(path)).toBeNull();
  });
});

describe('book names and keys', () => {
  it('accepts namespace-like book names only', () => {
    expect(isValidBookName('guide_book-2.x')).toBe(true);
    expect(isValidBookName('.')).toBe(false);
    expect(isValidBookName('..')).toBe(false);
    expect(isValidBookName('Guide')).toBe(false);
  });

  it('builds keys and file prefixes without the en_us segment', () => {
    const path = { book: 'guide', rel: 'entries/basics/intro.json' };
    expect(guideKey(path, 'pages/0/text')).toBe('guide/entries/basics/intro.json#pages/0/text');
    expect(guideFilePrefix(path)).toBe('guide/entries/basics/intro.json');
  });
});

describe('guidePackPath', () => {
  it('maps a source file to its zh_tw location in the resource pack', () => {
    expect(guidePackPath('demo', 'guide/en_us/entries/a.json')).toBe('assets/demo/patchouli_books/guide/zh_tw/entries/a.json');
  });

  it('refuses paths that could escape the book folder', () => {
    expect(guidePackPath('demo', '../en_us/a.json')).toBeNull();
    expect(guidePackPath('demo', 'guide/en_us/../../../evil.json')).toBeNull();
  });
});
```

`packages/core/src/patchouli/flatten.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { flatten, rebuild } from './index';

const ENTRY = {
  name: 'B Entry',
  icon: 'minecraft:stone',
  category: 'demo:basics',
  pages: [
    { type: 'patchouli:text', text: 'Hello $(item)world$().', title: 'Page Title' },
    { type: 'patchouli:crafting', recipe: 'demo:x', text: '' },
    'not a page',
    { type: 'patchouli:link', text: 'Visit', url: 'https://example.com', link_text: 'Website', anchor: 'a' },
    { type: 'patchouli:text', text: 5 },
  ],
};
const CATEGORY = { description: 'Basics desc', name: 'Basics', icon: 'minecraft:book', sortnum: 1 };

const files = {
  'guide/en_us/entries/b.json': JSON.stringify(ENTRY),
  'guide/en_us/categories/basics.json': JSON.stringify(CATEGORY),
  'guide/en_us/templates/custom.json': JSON.stringify({ components: [{ type: 'text', text: 'x' }] }),
  'guide/en_us/broken.json': '{',
};

describe('flatten', () => {
  it('extracts whitelisted string fields in path order, then field order', () => {
    const { order, source } = flatten(files);
    expect(order).toEqual([
      'guide/categories/basics.json#name',
      'guide/categories/basics.json#description',
      'guide/entries/b.json#name',
      'guide/entries/b.json#pages/0/title',
      'guide/entries/b.json#pages/0/text',
      'guide/entries/b.json#pages/3/text',
      'guide/entries/b.json#pages/3/link_text',
    ]);
    expect(source['guide/entries/b.json#pages/0/text']).toBe('Hello $(item)world$().');
    expect(source['guide/categories/basics.json#description']).toBe('Basics desc');
  });

  it('strips a BOM before parsing', () => {
    const { order } = flatten({ 'guide/en_us/a.json': '\uFEFF' + JSON.stringify({ name: 'A' }) });
    expect(order).toEqual(['guide/a.json#name']);
  });

  it('returns nothing for empty input', () => {
    expect(flatten({})).toEqual({ source: {}, order: [] });
  });
});

describe('rebuild', () => {
  const translations = {
    'guide/entries/b.json#pages/0/text': '你好 $(item)世界$()。',
    'guide/categories/basics.json#name': '基礎',
    'guide/entries/b.json#name': '',
    'guide/entries/b.json#pages/4/text': '數字',
    'guide/entries/b.json#pages/1/text': '空白',
  };

  it('fills translations and keeps English for untranslated fields', () => {
    const out = rebuild(files, translations);
    expect(JSON.parse(out['guide/en_us/categories/basics.json'] ?? '{}')).toEqual({ ...CATEGORY, name: '基礎' });
    const entry = JSON.parse(out['guide/en_us/entries/b.json'] ?? '{}');
    expect(entry.name).toBe('B Entry');
    expect(entry.pages[0]).toEqual({ type: 'patchouli:text', text: '你好 $(item)世界$()。', title: 'Page Title' });
    expect(entry.icon).toBe('minecraft:stone');
  });

  it('leaves empty, non-string and non-object values untouched', () => {
    const entry = JSON.parse(rebuild(files, translations)['guide/en_us/entries/b.json'] ?? '{}');
    expect(entry.pages[1]).toEqual(ENTRY.pages[1]);
    expect(entry.pages[2]).toBe('not a page');
    expect(entry.pages[4]).toEqual({ type: 'patchouli:text', text: 5 });
  });

  it('returns the same paths and passes unparsable or template files through verbatim', () => {
    const out = rebuild(files, translations);
    expect(Object.keys(out).sort()).toEqual(Object.keys(files).sort());
    expect(out['guide/en_us/broken.json']).toBe('{');
    expect(out['guide/en_us/templates/custom.json']).toBe(files['guide/en_us/templates/custom.json']);
  });

  it('round-trips: rebuilding with the flattened source restores the original JSON', () => {
    const tricky = {
      'book/en_us/entries/x.json': JSON.stringify({
        name: 'X ✓', category: 'demo:c', read_by_default: true, sortnum: 3,
        extra_recipe_mappings: { 'demo:a': 1, 10: 2 },
        pages: [
          { type: 'patchouli:multiblock', name: 'Altar', multiblock: { pattern: [['A']], mapping: { A: 'minecraft:stone' } }, text: 'Line$(br)two' },
          { type: 'patchouli:image', images: ['demo:a.png'], title: 'Pic', border: true },
        ],
      }),
      ...files,
    };
    const out = rebuild(tricky, flatten(tricky).source);
    for (const [path, text] of Object.entries(tricky)) {
      if (path.endsWith('broken.json')) continue;
      expect(JSON.parse(out[path] ?? 'null')).toEqual(JSON.parse(text));
    }
  });

  it('writes pretty JSON with a trailing newline and does not mutate its inputs', () => {
    const snapshot = JSON.stringify([files, translations]);
    const out = rebuild(files, translations);
    expect(out['guide/en_us/categories/basics.json']).toMatch(/^\{\n {2}"description"[\s\S]*\}\n$/);
    expect(JSON.stringify([files, translations])).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- patchouli`
Expected: FAIL（`./index` 不存在）

- [ ] **Step 3: Add guide types** — `packages/core/src/types.ts`：在 `TranslationEntry` 之後加入

```ts
/** Patchouli 手冊原樣檔：相對 `patchouli/` 的路徑（例 `guide/en_us/entries/a.json`）→ 原始 JSON 文字 */
export type GuideFiles = Readonly<Record<string, string>>;

export interface SkippedBook {
  readonly book: string;
  readonly reason: string;
}

/** 從 jar 偵測到的手冊；所有手冊都被略過時 files 為空 */
export interface DetectedGuide {
  readonly files: GuideFiles;
  readonly skipped: readonly SkippedBook[];
}

/** 專案中的手冊；條目與語言檔條目分開 */
export interface ProjectGuide {
  readonly files: GuideFiles;
  readonly entries: readonly TranslationEntry[];
}

/** 條目所屬區塊 */
export type EntrySection = 'lang' | 'guide';
```

在 `ModProject` 的 `updatedAt` 之後加入：

```ts
  /** Patchouli 手冊；沒有手冊（含 IndexedDB 舊專案）時省略 */
  readonly guide?: ProjectGuide;
```

在 `DetectedMod` 的 `zhCn?` 之後加入：

```ts
  readonly guide?: DetectedGuide;
```

- [ ] **Step 4: Create `packages/core/src/patchouli/paths.ts`**

```ts
/** 手冊名稱沿用命名空間規則；排除 . 與 .. 以免匯出路徑跳脫 */
const VALID_BOOK = /^[a-z0-9_.-]+$/;
const GUIDE_PATH = /^([^/]+)\/en_us\/(.+\.json)$/;
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
  if (segments.some((s) => UNSAFE_SEGMENTS.has(s) || s.includes('\\'))) return null;
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
```

- [ ] **Step 5: Create `packages/core/src/patchouli/fields.ts`**

```ts
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
```

- [ ] **Step 6: Create `packages/core/src/patchouli/flatten.ts`**

```ts
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
```

- [ ] **Step 7: Create `packages/core/src/patchouli/rebuild.ts`**

```ts
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
```

- [ ] **Step 8: Create `packages/core/src/patchouli/index.ts`**

```ts
export { PAGE_FIELDS, TOP_FIELDS } from './fields';
export { flatten, type FlatGuide } from './flatten';
export { guideFilePrefix, guideKey, guidePackPath, isValidBookName, parseGuidePath, type GuidePath } from './paths';
export { rebuild, serializeGuide } from './rebuild';
```

在 `packages/core/src/index.ts` 檔尾加入：

```ts
export * from './patchouli';
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- patchouli && npm run typecheck -w @mlf/core`
Expected: PASS（paths 14 tests、flatten 8 tests），typecheck 無錯誤

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/src/patchouli
git commit -m "feat(core): flatten and rebuild Patchouli guide files"
```

---

### Task 2: Patchouli 格式碼與手冊專用檢查

**Files:**
- Modify: `packages/core/src/validate/formatCodes.ts`
- Modify: `packages/core/src/validate/index.ts`
- Modify: `packages/core/src/validate/formatCodes.test.ts`
- Create: `packages/core/src/patchouli/formatCodes.ts`
- Modify: `packages/core/src/patchouli/index.ts`
- Test: `packages/core/src/patchouli/formatCodes.test.ts`

**Interfaces:**
- Consumes: `extractTokens`、`FormatIssue`（validate）
- Produces:
  - `checkTokens(source: string, target: string, extract: (text: string) => string[]): FormatIssue | null`（validate）
  - `extractGuideTokens(text: string): string[]`
  - `checkGuideFormat(source: string, target: string): FormatIssue | null`

Patchouli 格式碼 token 定義：`/\$\([^()\n]*\)/g`，即 `$(` 後接任意不含 `(`、`)`、換行的字元，再接 `)`，涵蓋 `$(item)`、`$(l:path)`、`$(/l)`、`$(br)`、`$(br2)`、`$()`、`$(#ff0000)`、`$(k:use)`、`$(t:提示)`。正規化：`$(#…)` 轉小寫；`$(t:任意文字)` 一律視為 `$(t:)`（提示文字可翻譯，只比對有無）。

- [ ] **Step 1: Write the failing tests** — `packages/core/src/patchouli/formatCodes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { checkGuideFormat, extractGuideTokens } from './index';

describe('extractGuideTokens', () => {
  it('extracts Patchouli macros, lowercasing colours and collapsing tooltips', () => {
    const text = 'Use $(item)Wrench$() to $(l:basics/intro)read$(/l).$(br2)$(#FF0000)red$() $(t:Hover me)x$(/t) $(k:use)';
    expect(extractGuideTokens(text)).toEqual([
      '$(item)', '$()', '$(l:basics/intro)', '$(/l)', '$(br2)', '$(#ff0000)', '$()', '$(t:)', '$(/t)', '$(k:use)',
    ]);
  });

  it('ignores plain dollars and unclosed macros', () => {
    expect(extractGuideTokens('Costs $5 (cheap) $(item')).toEqual([]);
  });
});

describe('checkGuideFormat', () => {
  it('returns null for an empty target', () => {
    expect(checkGuideFormat('Use $(item)Wrench$()', '')).toBeNull();
  });

  it('reports missing Patchouli macros', () => {
    expect(checkGuideFormat('Use $(item)Wrench$()', '使用扳手')).toEqual({ missing: ['$(item)', '$()'], extra: [] });
  });

  it('also checks the regular format codes', () => {
    expect(checkGuideFormat('%s $(br)next', '%s 下一頁')).toEqual({ missing: ['$(br)'], extra: [] });
    expect(checkGuideFormat('Hi', '§a嗨')).toEqual({ missing: [], extra: ['§a'] });
  });

  it('accepts translated tooltip text and colour case differences', () => {
    expect(checkGuideFormat('$(t:Hover text)x$(/t) $(#FF0000)red$()', '$(t:提示)x$(/t) $(#ff0000)紅$()')).toBeNull();
  });

  it('requires link targets to stay identical', () => {
    expect(checkGuideFormat('$(l:basics/intro)Intro$(/l)', '$(l:basics/other)簡介$(/l)')).toEqual({
      missing: ['$(l:basics/intro)'], extra: ['$(l:basics/other)'],
    });
  });
});
```

在 `packages/core/src/validate/formatCodes.test.ts` 的 import 改為 `import { checkFormat, checkTokens, extractTokens } from './formatCodes';`，並在檔尾加入：

```ts
describe('checkTokens', () => {
  it('compares token multisets with a custom extractor', () => {
    const words = (text: string) => text.split(' ').filter((w) => w !== '');
    expect(checkTokens('a b b', 'b a', words)).toEqual({ missing: ['b'], extra: [] });
    expect(checkTokens('a b', '', words)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- formatCodes`
Expected: FAIL（`checkTokens`、`checkGuideFormat` 未匯出）

- [ ] **Step 3: Generalize the token comparison** — 把 `packages/core/src/validate/formatCodes.ts` 的 `checkFormat` 整段換成：

```ts
/** 以指定的擷取函式比對原文與譯文的格式碼多重集合；譯文為空或一致時回傳 null */
export function checkTokens(source: string, target: string, extract: (text: string) => string[]): FormatIssue | null {
  if (target === '') return null;
  const src = countTokens(extract(source));
  const tgt = countTokens(extract(target));
  const missing = difference(src, tgt);
  const extra = difference(tgt, src);
  return missing.length === 0 && extra.length === 0 ? null : { missing, extra };
}

/** 比對原文與譯文的格式碼多重集合；譯文為空或一致時回傳 null */
export function checkFormat(source: string, target: string): FormatIssue | null {
  return checkTokens(source, target, extractTokens);
}
```

`packages/core/src/validate/index.ts` 改為：

```ts
export { checkFormat, checkTokens, extractTokens, type FormatIssue } from './formatCodes';
```

- [ ] **Step 4: Create `packages/core/src/patchouli/formatCodes.ts`**

```ts
import { checkTokens, extractTokens, type FormatIssue } from '../validate/formatCodes';

/** Patchouli 格式碼 $(…)：括號內不可含括號或換行，例如 $(item)、$(l:path)、$(br)、$()、$(#ff0000)、$(t:提示) */
const GUIDE_TOKEN_PATTERN = /\$\([^()\n]*\)/g;
const TOOLTIP = /^\$\(t:/i;

function normalize(token: string): string {
  if (TOOLTIP.test(token)) return '$(t:)';
  return token.startsWith('$(#') ? token.toLowerCase() : token;
}

export function extractGuideTokens(text: string): string[] {
  return (text.match(GUIDE_TOKEN_PATTERN) ?? []).map(normalize);
}

function guideAndLangTokens(text: string): string[] {
  return [...extractTokens(text), ...extractGuideTokens(text)];
}

/** 手冊文字專用檢查：既有格式碼（%s、§a、\n…）加上 Patchouli 的 $(…) */
export function checkGuideFormat(source: string, target: string): FormatIssue | null {
  return checkTokens(source, target, guideAndLangTokens);
}
```

在 `packages/core/src/patchouli/index.ts` 加入：

```ts
export { checkGuideFormat, extractGuideTokens } from './formatCodes';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- formatCodes && npm run typecheck -w @mlf/core`
Expected: PASS（validate 10 tests、patchouli 7 tests），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validate packages/core/src/patchouli
git commit -m "feat(core): check Patchouli format codes in guide text"
```

---

### Task 3: 由 jar 找出手冊並放進 `DetectedMod.guide`

**Files:**
- Create: `packages/core/src/patchouli/findBooks.ts`
- Modify: `packages/core/src/patchouli/index.ts`
- Modify: `packages/core/src/jar/readJar.ts`
- Test: `packages/core/src/patchouli/findBooks.test.ts`
- Modify: `packages/core/src/jar/jar.test.ts`

**Interfaces:**
- Consumes: `isValidBookName`、`parseGuidePath`、`parseGuideJson`（Task 1）、`DetectedGuide`、`SkippedBook`（Task 1）
- Produces:
  - `type ReadText = (path: string) => Promise<string>`
  - `SKIP_REASONS: { i18n: string; data: string; noContent: string; invalidName: string; invalidJson: (path: string) => string }`
  - `findBooks(namespace: string, paths: readonly string[], read: ReadText): Promise<DetectedGuide | undefined>`（沒有任何手冊時 `undefined`）
  - `readJar` 回傳的 `DetectedMod` 在有手冊時帶 `guide`

- [ ] **Step 1: Write the failing tests** — `packages/core/src/patchouli/findBooks.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { findBooks, SKIP_REASONS } from './index';

const ENTRY = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Hi' }] });

function find(namespace: string, files: Record<string, string>) {
  const read = async (path: string): Promise<string> => {
    const text = files[path];
    if (text === undefined) throw new Error(`missing ${path}`);
    return text;
  };
  return findBooks(namespace, Object.keys(files), read);
}

describe('findBooks', () => {
  it('collects en_us content of resource-pack books, skipping templates, other locales and non-JSON files', async () => {
    const guide = await find('demo', {
      'data/demo/patchouli_books/guide/book.json': JSON.stringify({ name: 'demo.book', use_resource_pack: true }),
      'assets/demo/patchouli_books/guide/en_us/categories/basics.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/entries/basics/intro.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/templates/custom.json': ENTRY,
      'assets/demo/patchouli_books/guide/zh_tw/entries/basics/intro.json': ENTRY,
      'assets/demo/patchouli_books/guide/en_us/entries/basics/icon.png': 'x',
    });
    expect(guide).toEqual({
      files: { 'guide/en_us/categories/basics.json': ENTRY, 'guide/en_us/entries/basics/intro.json': ENTRY },
      skipped: [],
    });
  });

  it.each([['data/demo/patchouli_books/guide/book.json'], ['assets/demo/patchouli_books/guide/book.json']])(
    'skips books whose %s sets "i18n": true',
    async (bookJson) => {
      const guide = await find('demo', {
        [bookJson]: JSON.stringify({ name: 'demo.book', i18n: true }),
        'assets/demo/patchouli_books/guide/en_us/entries/a.json': ENTRY,
      });
      expect(guide).toEqual({ files: {}, skipped: [{ book: 'guide', reason: SKIP_REASONS.i18n }] });
    },
  );

  it('skips books whose content lives under data/', async () => {
    const guide = await find('demo', {
      'data/demo/patchouli_books/guide/book.json': '{}',
      'data/demo/patchouli_books/guide/en_us/entries/a.json': ENTRY,
    });
    expect(guide).toEqual({ files: {}, skipped: [{ book: 'guide', reason: SKIP_REASONS.data }] });
  });

  it('ignores books of other namespaces and returns undefined without books', async () => {
    expect(await find('demo', { 'assets/other/patchouli_books/guide/en_us/entries/a.json': ENTRY })).toBeUndefined();
    expect(await find('demo', { 'assets/demo/lang/en_us.json': '{}' })).toBeUndefined();
  });

  it('reports unsafe names, broken JSON and books without English content; accepts a BOM', async () => {
    const guide = await find('demo', {
      'assets/demo/patchouli_books/Bad Book/en_us/entries/a.json': ENTRY,
      'assets/demo/patchouli_books/broken/en_us/entries/a.json': '{"name":',
      'assets/demo/patchouli_books/empty/book.json': '{}',
      'assets/demo/patchouli_books/badmeta/book.json': '{',
      'assets/demo/patchouli_books/ok/en_us/entries/a.json': '\uFEFF' + ENTRY,
    });
    expect(guide?.files).toEqual({ 'ok/en_us/entries/a.json': '\uFEFF' + ENTRY });
    expect(guide?.skipped).toEqual([
      { book: 'Bad Book', reason: SKIP_REASONS.invalidName },
      { book: 'badmeta', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/badmeta/book.json') },
      { book: 'broken', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/broken/en_us/entries/a.json') },
      { book: 'empty', reason: SKIP_REASONS.noContent },
    ]);
  });
});
```

在 `packages/core/src/jar/jar.test.ts` 的 import 區加入 `import { SKIP_REASONS } from '../patchouli';`，並在檔尾加入：

```ts
describe('readJar Patchouli guides', () => {
  const lang = { 'assets/demo/lang/en_us.json': EN };
  const entry = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Hi' }] });

  it('attaches each namespace its own guide files', async () => {
    const jar = await makeJar({
      ...lang,
      'data/demo/patchouli_books/guide/book.json': JSON.stringify({ name: 'demo.book' }),
      'assets/demo/patchouli_books/guide/en_us/entries/intro.json': entry,
      'assets/other/lang/en_us.json': EN,
      'assets/other/patchouli_books/manual/en_us/entries/x.json': entry,
    });
    const [demo, other] = await readJar(jar, 'demo.jar');
    expect(demo?.guide).toEqual({ files: { 'guide/en_us/entries/intro.json': entry }, skipped: [] });
    expect(other?.guide).toEqual({ files: { 'manual/en_us/entries/x.json': entry }, skipped: [] });
  });

  it('keeps lang entries when a guide book is skipped', async () => {
    const jar = await makeJar({ ...lang, 'assets/demo/patchouli_books/guide/en_us/entries/a.json': '{"name":' });
    const [mod] = await readJar(jar, 'demo.jar');
    expect(mod?.order).toEqual(['item.demo.gem', 'item.demo.sword']);
    expect(mod?.guide).toEqual({
      files: {},
      skipped: [{ book: 'guide', reason: SKIP_REASONS.invalidJson('assets/demo/patchouli_books/guide/en_us/entries/a.json') }],
    });
  });

  it('omits guide when the jar has no books', async () => {
    const [mod] = await readJar(await makeJar(lang), 'demo.jar');
    expect(mod).not.toHaveProperty('guide');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- findBooks jar`
Expected: FAIL（`findBooks`、`SKIP_REASONS` 未匯出）

- [ ] **Step 3: Create `packages/core/src/patchouli/findBooks.ts`**

```ts
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
```

在 `packages/core/src/patchouli/index.ts` 加入：

```ts
export { findBooks, SKIP_REASONS, type ReadText } from './findBooks';
```

- [ ] **Step 4: Wire into `readJar`** — `packages/core/src/jar/readJar.ts` 改為：

```ts
import JSZip from 'jszip';
import type { DetectedMod, LangFormat } from '../types';
import { LangParseError, parseLangText } from '../lang';
import { findBooks } from '../patchouli/findBooks';
import { JarError, MAX_JAR_BYTES, MAX_UNCOMPRESSED_BYTES } from './errors';
import { findLangFiles, type LangFileRef } from './findLangFiles';
import { type ModMeta, readModMetadata } from './metadata';

type Locale = 'en_us' | 'zh_tw' | 'zh_cn';
const LOCALES: readonly Locale[] = ['en_us', 'zh_tw', 'zh_cn'];

interface ReadContext {
  readonly zip: JSZip;
  readonly jarName: string;
  readonly paths: readonly string[];
  totalBytes: number;
}

async function loadZip(data: Uint8Array, jarName: string): Promise<JSZip> {
  if (data.byteLength > MAX_JAR_BYTES) {
    throw new JarError('too-large', `${jarName} exceeds ${MAX_JAR_BYTES} bytes`);
  }
  try {
    return await JSZip.loadAsync(data);
  } catch (err) {
    throw new JarError('not-zip', err instanceof Error ? err.message : String(err));
  }
}

/** 讀取 jar 內的文字檔並累計解壓縮後大小（語言檔與手冊共用上限） */
async function readText(ctx: ReadContext, path: string): Promise<string> {
  const file = ctx.zip.file(path);
  if (!file) throw new JarError('parse', 'file vanished', path);
  const text = await file.async('string');
  ctx.totalBytes += text.length;
  if (ctx.totalBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new JarError('too-large', `${ctx.jarName} uncompressed content too large`);
  }
  return text;
}

async function readLang(ctx: ReadContext, ref: LangFileRef): Promise<{ entries: Record<string, string>; order: string[] }> {
  const text = await readText(ctx, ref.path);
  try {
    const parsed = parseLangText(text, ref.format);
    return { entries: { ...parsed.entries }, order: [...parsed.order] };
  } catch (err) {
    const reason = err instanceof LangParseError ? err.message : String(err);
    throw new JarError('parse', reason, ref.path);
  }
}

function pickRef(refs: readonly LangFileRef[], locale: Locale, format: LangFormat): LangFileRef | undefined {
  return refs.find((r) => r.locale === locale && r.format === format) ?? refs.find((r) => r.locale === locale);
}

async function buildDetected(ctx: ReadContext, namespace: string, refs: readonly LangFileRef[], meta: readonly ModMeta[]): Promise<DetectedMod | null> {
  const enRefs = refs.filter((r) => r.locale === 'en_us');
  if (enRefs.length === 0) return null;
  const format: LangFormat = enRefs.some((r) => r.format === 'json') ? 'json' : 'lang';
  const [en, tw, cn] = await Promise.all(
    LOCALES.map((loc) => {
      const ref = pickRef(refs, loc, format);
      return ref ? readLang(ctx, ref) : Promise.resolve(undefined);
    }),
  );
  if (!en) return null;
  const guide = await findBooks(namespace, ctx.paths, (path) => readText(ctx, path));
  const info = meta.find((m) => m.modId === namespace);
  return {
    modId: namespace,
    name: info?.name ?? namespace,
    version: info?.version ?? 'unknown',
    jarName: ctx.jarName,
    format,
    source: en.entries,
    order: en.order,
    ...(tw ? { zhTw: tw.entries } : {}),
    ...(cn ? { zhCn: cn.entries } : {}),
    ...(guide ? { guide } : {}),
  };
}

/** 讀取 jar，回傳其中每個含 en_us 語言檔的命名空間（含該命名空間的 Patchouli 手冊） */
export async function readJar(data: Uint8Array, jarName: string): Promise<DetectedMod[]> {
  const zip = await loadZip(data, jarName);
  const paths = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  const refs = findLangFiles(paths);
  const namespaces = [...new Set(refs.map((r) => r.namespace))];
  const meta = await readModMetadata(zip);
  const ctx: ReadContext = { zip, jarName, paths, totalBytes: 0 };
  const mods: DetectedMod[] = [];
  for (const ns of namespaces) {
    const mod = await buildDetected(ctx, ns, refs.filter((r) => r.namespace === ns), meta);
    if (mod) mods.push(mod);
  }
  if (mods.length === 0) throw new JarError('no-lang', `${jarName} has no en_us lang file`);
  return mods;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- findBooks jar && npm run typecheck -w @mlf/core`
Expected: PASS（findBooks 6 tests；jar 既有測試＋新增 3 tests），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/patchouli packages/core/src/jar
git commit -m "feat(core): detect Patchouli guide books in jars"
```

---

### Task 4: 專案手冊條目：建立、合併、編輯與統計

**Files:**
- Modify: `packages/core/src/merge/buildProject.ts`
- Modify: `packages/core/src/merge/mergeMod.ts`
- Modify: `packages/core/src/merge/updateEntry.ts`
- Modify: `packages/core/src/merge/stats.ts`
- Modify: `packages/core/src/merge/index.ts`
- Modify: `packages/core/src/catalog/toProject.ts`
- Modify: `packages/core/src/catalog/index.ts`
- Test: `packages/core/src/merge/guide.test.ts`

**Interfaces:**
- Consumes: `flatten`（Task 1）、`checkGuideFormat`（Task 2）、`DetectedGuide`、`ProjectGuide`、`EntrySection`、`GuideFiles`（Task 1）
- Produces:
  - `buildGuide(files: GuideFiles): ProjectGuide`
  - `buildProject(d: DetectedMod, now: number): ModProject`（`d.guide.files` 非空時帶 `guide`）
  - `interface IncomingTexts { source; order; zhTw?; zhCn? }`、`mergeEntries(existing: readonly TranslationEntry[], incoming: IncomingTexts): TranslationEntry[]`
  - `mergeProject(existing: ModProject, incoming: DetectedMod, now: number): ModProject`（手冊套用相同規則）
  - `updateEntry(p: ModProject, key: string, target: string, now: number, section: EntrySection = 'lang'): ModProject`
  - `hasGuideWarning(e: TranslationEntry): boolean`、`guideStats(p: ModProject): ProjectStats | null`
  - `interface CatalogGuide { files: GuideFiles; zh: Readonly<Record<string, string>> }`
  - `catalogToProject(meta: CatalogMod, en, zh, guide?: CatalogGuide): ModProject`

- [ ] **Step 1: Write the failing test** — `packages/core/src/merge/guide.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import { catalogToProject } from '../catalog/toProject';
import type { DetectedMod, GuideFiles } from '../types';
import { buildProject, guideStats, mergeProject, projectStats, updateEntry } from './index';

const PATH = 'guide/en_us/entries/intro.json';
const K = {
  name: 'guide/entries/intro.json#name',
  text: 'guide/entries/intro.json#pages/0/text',
  title: 'guide/entries/intro.json#pages/1/title',
  second: 'guide/entries/intro.json#pages/1/text',
};

function guideFiles(text: string, secondPage = true): GuideFiles {
  const pages = [{ type: 'patchouli:text', text }, ...(secondPage ? [{ type: 'patchouli:text', title: 'More', text: 'Second' }] : [])];
  return { [PATH]: JSON.stringify({ name: 'Intro', pages }) };
}

function detected(files?: GuideFiles): DetectedMod {
  return {
    modId: 'demo', name: 'Demo', version: '1.0', jarName: 'demo.jar', format: 'json',
    source: { a: 'Apple' }, order: ['a'],
    ...(files ? { guide: { files, skipped: [] } } : {}),
  };
}

const rows = (entries: readonly { key: string; target: string; status: string }[] | undefined) =>
  entries?.map((e) => [e.key, e.target, e.status]);

describe('buildProject guide', () => {
  it('creates untranslated guide entries in flatten order', () => {
    const p = buildProject(detected(guideFiles('Hello')), 1);
    expect(p.guide?.files).toEqual(guideFiles('Hello'));
    expect(rows(p.guide?.entries)).toEqual([
      [K.name, '', 'untranslated'], [K.text, '', 'untranslated'], [K.title, '', 'untranslated'], [K.second, '', 'untranslated'],
    ]);
    expect(p.entries.map((e) => e.key)).toEqual(['a']);
  });

  it('omits the guide when the jar has none or every book was skipped', () => {
    expect(buildProject(detected(), 1)).not.toHaveProperty('guide');
    const skippedOnly: DetectedMod = { ...detected(), guide: { files: {}, skipped: [{ book: 'guide', reason: 'x' }] } };
    expect(buildProject(skippedOnly, 1)).not.toHaveProperty('guide');
  });
});

describe('updateEntry sections', () => {
  const p = buildProject(detected(guideFiles('Hello')), 1);

  it('updates guide entries only when asked for the guide section', () => {
    const next = updateEntry(p, K.name, '簡介', 5, 'guide');
    expect(next.guide?.entries[0]).toMatchObject({ target: '簡介', status: 'translated' });
    expect(next.entries).toBe(p.entries);
    expect(next.updatedAt).toBe(5);
    expect(p.guide?.entries[0]?.target).toBe('');
  });

  it('keeps sections apart and leaves projects without a guide unchanged', () => {
    expect(updateEntry(p, K.name, '簡介', 5)).toBe(p);
    expect(updateEntry(p, 'a', '蘋果', 5, 'guide')).toBe(p);
    const plain = buildProject(detected(), 1);
    expect(updateEntry(plain, K.name, '簡介', 5, 'guide')).toBe(plain);
  });
});

describe('mergeProject guide', () => {
  const base = updateEntry(updateEntry(buildProject(detected(guideFiles('Hello')), 1), K.name, '簡介', 2, 'guide'), K.second, '第二頁', 2, 'guide');

  it('keeps unchanged text, clears changed text and marks removed pages obsolete', () => {
    const merged = mergeProject(base, detected(guideFiles('Hello world', false)), 3);
    expect(merged.guide?.files).toEqual(guideFiles('Hello world', false));
    expect(rows(merged.guide?.entries)).toEqual([
      [K.name, '簡介', 'translated'],
      [K.text, '', 'new'],
      [K.title, '', 'obsolete'],
      [K.second, '第二頁', 'obsolete'],
    ]);
  });

  it('marks every guide entry obsolete, keeping translations, when the new jar has no guide', () => {
    const merged = mergeProject(base, detected(), 3);
    expect(merged.guide?.files).toEqual({});
    expect(merged.guide?.entries.every((e) => e.status === 'obsolete')).toBe(true);
    expect(merged.guide?.entries.find((e) => e.key === K.name)?.target).toBe('簡介');
  });

  it('marks a newly added guide as new and leaves guide-less merges without a guide', () => {
    const merged = mergeProject(buildProject(detected(), 1), detected(guideFiles('Hello', false)), 3);
    expect(rows(merged.guide?.entries)).toEqual([[K.name, '', 'new'], [K.text, '', 'new']]);
    expect(mergeProject(buildProject(detected(), 1), detected(), 3)).not.toHaveProperty('guide');
  });

  it('does not mutate the existing project', () => {
    const snapshot = JSON.stringify(base);
    mergeProject(base, detected(guideFiles('Changed', false)), 3);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('guideStats', () => {
  it('returns null without a guide and counts Patchouli format warnings', () => {
    expect(guideStats(buildProject(detected(), 1))).toBeNull();
    let p = buildProject(detected(guideFiles('Use $(item)Wrench$()', false)), 1);
    p = updateEntry(p, K.text, '使用扳手', 2, 'guide');
    expect(guideStats(p)).toEqual({ total: 2, translated: 1, warnings: 1, percent: 50 });
    expect(projectStats(p)).toEqual({ total: 1, translated: 0, warnings: 0, percent: 0 });
  });
});

describe('catalogToProject guide', () => {
  const meta = catalogModSchema.parse({
    modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
    mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
  });

  it('builds guide entries from raw files and flattened translations', () => {
    const p = catalogToProject(meta, { a: 'Apple' }, {}, { files: guideFiles('Hello', false), zh: { [K.name]: '簡介' } });
    expect(rows(p.guide?.entries)).toEqual([[K.name, '簡介', 'translated'], [K.text, '', 'untranslated']]);
    expect(catalogToProject(meta, { a: 'Apple' }, {})).not.toHaveProperty('guide');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- merge/guide`
Expected: FAIL（`guideStats` 未匯出、`guide` 欄位不存在）

- [ ] **Step 3: Replace `packages/core/src/merge/buildProject.ts`**

```ts
import { flatten } from '../patchouli/flatten';
import type { DetectedMod, GuideFiles, ModProject, ProjectGuide, TranslationEntry } from '../types';

export function makeEntry(key: string, source: string, target: string, reference: string | undefined, untranslatedStatus: TranslationEntry['status'] = 'untranslated'): TranslationEntry {
  return {
    key,
    source,
    target,
    ...(reference !== undefined ? { reference } : {}),
    status: target !== '' ? 'translated' : untranslatedStatus,
  };
}

/** 由原樣檔建立手冊（條目全部未翻譯） */
export function buildGuide(files: GuideFiles): ProjectGuide {
  const { source, order } = flatten(files);
  return { files, entries: order.map((key) => makeEntry(key, source[key] ?? '', '', undefined)) };
}

export function buildProject(d: DetectedMod, now: number): ModProject {
  const guideFiles = d.guide?.files ?? {};
  return {
    id: d.modId,
    modId: d.modId,
    name: d.name,
    version: d.version,
    jarName: d.jarName,
    format: d.format,
    entries: d.order.map((key) => makeEntry(key, d.source[key] ?? '', d.zhTw?.[key] ?? '', d.zhCn?.[key])),
    updatedAt: now,
    ...(Object.keys(guideFiles).length > 0 ? { guide: buildGuide(guideFiles) } : {}),
  };
}
```

- [ ] **Step 4: Replace `packages/core/src/merge/mergeMod.ts`**

```ts
import { flatten } from '../patchouli/flatten';
import type { DetectedGuide, DetectedMod, ModProject, ProjectGuide, TranslationEntry } from '../types';
import { makeEntry } from './buildProject';

/** 合併所需的新版文字；DetectedMod 與攤平後的手冊（FlatGuide）都符合 */
export interface IncomingTexts {
  readonly source: Readonly<Record<string, string>>;
  readonly order: readonly string[];
  readonly zhTw?: Readonly<Record<string, string>>;
  readonly zhCn?: Readonly<Record<string, string>>;
}

function mergeEntry(old: TranslationEntry | undefined, key: string, incoming: IncomingTexts): TranslationEntry {
  const source = incoming.source[key] ?? '';
  const shipped = incoming.zhTw?.[key] ?? '';
  const reference = incoming.zhCn?.[key];
  if (!old) return makeEntry(key, source, shipped, reference, 'new');
  if (old.source !== source) return makeEntry(key, source, '', reference, 'new');
  const target = old.target !== '' ? old.target : shipped;
  const fallback = old.status === 'new' ? 'new' : 'untranslated';
  return makeEntry(key, source, target, reference, fallback);
}

/**
 * 原文相同保留譯文、原文變更清空並標記 new、新 key 標記 new、已不存在的 key 標記 obsolete 並移到最後。
 */
export function mergeEntries(existing: readonly TranslationEntry[], incoming: IncomingTexts): TranslationEntry[] {
  const oldByKey = new Map(existing.map((e) => [e.key, e]));
  const incomingKeys = new Set(incoming.order);
  const current = incoming.order.map((key) => mergeEntry(oldByKey.get(key), key, incoming));
  const obsolete = existing
    .filter((e) => !incomingKeys.has(e.key))
    .map((e): TranslationEntry => ({ ...e, status: 'obsolete' }));
  return [...current, ...obsolete];
}

/** 手冊套用與語言檔相同的規則；新 jar 沒有手冊時既有條目全部標記 obsolete（保留譯文） */
function mergeGuide(existing: ProjectGuide | undefined, incoming: DetectedGuide | undefined): ProjectGuide | undefined {
  const files = incoming?.files ?? {};
  if (!existing && Object.keys(files).length === 0) return undefined;
  return { files, entries: mergeEntries(existing?.entries ?? [], flatten(files)) };
}

/** 將新載入的同一模組合併進既有專案（語言檔與手冊分別合併） */
export function mergeProject(existing: ModProject, incoming: DetectedMod, now: number): ModProject {
  const { guide: _previous, ...rest } = existing;
  const guide = mergeGuide(existing.guide, incoming.guide);
  return {
    ...rest,
    name: incoming.name,
    version: incoming.version,
    jarName: incoming.jarName,
    format: incoming.format,
    entries: mergeEntries(existing.entries, incoming),
    updatedAt: now,
    ...(guide ? { guide } : {}),
  };
}
```

- [ ] **Step 5: Replace `packages/core/src/merge/updateEntry.ts`**

```ts
import type { EntrySection, EntryStatus, ModProject, TranslationEntry } from '../types';

/** 回傳更新後的新條目陣列；key 不存在或已 obsolete 時回傳 null */
function updateList(entries: readonly TranslationEntry[], key: string, target: string): TranslationEntry[] | null {
  const index = entries.findIndex((e) => e.key === key);
  const entry = entries[index];
  if (!entry || entry.status === 'obsolete') return null;
  const status: EntryStatus = target !== '' ? 'translated' : 'untranslated';
  return entries.map((e, i) => (i === index ? { ...e, target, status } : e));
}

/** section 指定更新語言檔或手冊條目；找不到可編輯的 key 時回傳原專案 */
export function updateEntry(p: ModProject, key: string, target: string, now: number, section: EntrySection = 'lang'): ModProject {
  if (section === 'guide') {
    const entries = p.guide ? updateList(p.guide.entries, key, target) : null;
    return p.guide && entries ? { ...p, guide: { ...p.guide, entries }, updatedAt: now } : p;
  }
  const entries = updateList(p.entries, key, target);
  return entries ? { ...p, entries, updatedAt: now } : p;
}
```

- [ ] **Step 6: Replace `packages/core/src/merge/stats.ts`**

```ts
import { checkGuideFormat } from '../patchouli/formatCodes';
import type { ModProject, TranslationEntry } from '../types';
import { checkFormat } from '../validate/formatCodes';

export interface ProjectStats {
  readonly total: number;
  readonly translated: number;
  readonly warnings: number;
  readonly percent: number;
}

export function hasWarning(e: TranslationEntry): boolean {
  return checkFormat(e.source, e.target) !== null;
}

/** 手冊條目的格式碼檢查（含 Patchouli $(…)） */
export function hasGuideWarning(e: TranslationEntry): boolean {
  return checkGuideFormat(e.source, e.target) !== null;
}

function computeStats(entries: readonly TranslationEntry[], warn: (e: TranslationEntry) => boolean): ProjectStats {
  const active = entries.filter((e) => e.status !== 'obsolete');
  const translated = active.filter((e) => e.target !== '').length;
  const warnings = active.filter(warn).length;
  const percent = active.length === 0 ? 0 : Math.round((translated / active.length) * 100);
  return { total: active.length, translated, warnings, percent };
}

/** 語言檔完成度（不含手冊） */
export function projectStats(p: ModProject): ProjectStats {
  return computeStats(p.entries, hasWarning);
}

/** 手冊完成度；沒有手冊時回傳 null */
export function guideStats(p: ModProject): ProjectStats | null {
  return p.guide ? computeStats(p.guide.entries, hasGuideWarning) : null;
}
```

`packages/core/src/merge/index.ts` 改為：

```ts
export { buildGuide, buildProject } from './buildProject';
export { mergeEntries, mergeProject, type IncomingTexts } from './mergeMod';
export { updateEntry } from './updateEntry';
export { guideStats, hasGuideWarning, hasWarning, projectStats, type ProjectStats } from './stats';
```

- [ ] **Step 7: Replace `packages/core/src/catalog/toProject.ts`**

```ts
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
```

`packages/core/src/catalog/index.ts` 的 `export { catalogToProject } from './toProject';` 改為：

```ts
export { catalogToProject, type CatalogGuide } from './toProject';
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core`
Expected: 全部 PASS（新增 guide.test 10 tests；既有 merge／catalog／export 測試不變），typecheck 無錯誤

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/merge packages/core/src/catalog
git commit -m "feat(core): keep guide entries in projects with merge, edit and stats"
```

---

### Task 5: 資源包輸出手冊

**Files:**
- Create: `packages/core/src/export/buildGuideFiles.ts`
- Modify: `packages/core/src/export/buildResourcePack.ts`
- Modify: `packages/core/src/export/index.ts`
- Test: `packages/core/src/export/guide.test.ts`

**Interfaces:**
- Consumes: `rebuild`、`parseGuidePath`、`guideFilePrefix`、`guidePackPath`（Task 1）、`buildProject`、`mergeProject`、`updateEntry(…, 'guide')`（Task 4）
- Produces:
  - `guideTranslations(p: ModProject): Record<string, string>`（非 obsolete 且有譯文）
  - `buildGuidePackFiles(p: ModProject, mode: UntranslatedMode): [string, string][]`（資源包路徑 → 內容）
  - `exportProjects` 的 `merged-pack`／`separate-packs` 含手冊；`lang-files` 不含

- [ ] **Step 1: Write the failing test** — `packages/core/src/export/guide.test.ts`

```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProject, mergeProject, updateEntry } from '../merge';
import type { DetectedMod, GuideFiles, ModProject } from '../types';
import { buildGuidePackFiles, exportProjects, guideTranslations, type ExportOptions } from './index';

const INTRO = 'guide/en_us/entries/intro.json';
const BASICS = 'guide/en_us/categories/basics.json';
const INTRO_TEXT = JSON.stringify({ name: 'Intro', icon: 'minecraft:book', pages: [{ type: 'patchouli:text', text: 'Hello' }] });
const BASICS_TEXT = JSON.stringify({ name: 'Basics', description: 'All basics' });
const FILES: GuideFiles = { [INTRO]: INTRO_TEXT, [BASICS]: BASICS_TEXT };
const PACK_INTRO = 'assets/demo/patchouli_books/guide/zh_tw/entries/intro.json';
const PACK_BASICS = 'assets/demo/patchouli_books/guide/zh_tw/categories/basics.json';

function detected(files: GuideFiles = FILES): DetectedMod {
  return { modId: 'demo', name: 'demo', version: '1', jarName: 'demo.jar', format: 'json', source: { a: 'Apple' }, order: ['a'], guide: { files, skipped: [] } };
}

const project = (): ModProject => updateEntry(buildProject(detected(), 1), 'guide/entries/intro.json#pages/0/text', '你好', 2, 'guide');

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.20.1', description: '測試', ...o,
});

const parsed = (pairs: [string, string][]) => Object.fromEntries(pairs.map(([path, text]) => [path, JSON.parse(text) as unknown]));

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('guideTranslations', () => {
  it('keeps translated, non-obsolete guide entries only', () => {
    expect(guideTranslations(project())).toEqual({ 'guide/entries/intro.json#pages/0/text': '你好' });
    expect(guideTranslations(mergeProject(project(), detected({ [BASICS]: BASICS_TEXT }), 3))).toEqual({});
  });
});

describe('buildGuidePackFiles', () => {
  it('rebuilds every file under zh_tw, keeping English where untranslated', () => {
    expect(parsed(buildGuidePackFiles(project(), 'keep-source'))).toEqual({
      [PACK_INTRO]: { name: 'Intro', icon: 'minecraft:book', pages: [{ type: 'patchouli:text', text: '你好' }] },
      [PACK_BASICS]: { name: 'Basics', description: 'All basics' },
    });
  });

  it('writes only files with at least one translation in skip mode', () => {
    expect(buildGuidePackFiles(project(), 'skip').map(([path]) => path)).toEqual([PACK_INTRO]);
  });

  it('returns nothing for projects without a guide', () => {
    const { guide: _g, ...plain } = detected();
    expect(buildGuidePackFiles(buildProject(plain, 1), 'keep-source')).toEqual([]);
  });
});

describe('exportProjects with guides', () => {
  it('adds guide files to merged and separate packs', async () => {
    const merged = await unzip((await exportProjects([project()], opts())).blob);
    expect(JSON.parse((await merged.file(PACK_INTRO)?.async('string')) ?? '{}').pages[0].text).toBe('你好');
    expect(merged.file('assets/demo/lang/zh_tw.json')).not.toBeNull();

    const outer = await unzip((await exportProjects([project()], opts({ kind: 'separate-packs' }))).blob);
    const inner = await JSZip.loadAsync((await outer.file('demo-zh_tw.zip')?.async('uint8array')) ?? new Uint8Array());
    expect(inner.file(PACK_INTRO)).not.toBeNull();
  });

  it('never puts guide files into lang-file exports', async () => {
    const single = await exportProjects([project()], opts({ kind: 'lang-files' }));
    expect(single.fileName).toBe('zh_tw.json');
    expect(await single.blob.text()).toBe('{\n  "a": "Apple"\n}\n');
    const other: ModProject = { ...project(), id: 'other', modId: 'other' };
    const zip = await unzip((await exportProjects([project(), other], opts({ kind: 'lang-files' }))).blob);
    expect(Object.keys(zip.files).filter((p) => p.includes('patchouli'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- export/guide`
Expected: FAIL（`buildGuidePackFiles` 未匯出）

- [ ] **Step 3: Create `packages/core/src/export/buildGuideFiles.ts`**

```ts
import { guideFilePrefix, guidePackPath, parseGuidePath } from '../patchouli/paths';
import { rebuild } from '../patchouli/rebuild';
import type { ModProject } from '../types';
import type { UntranslatedMode } from './types';

/** 手冊譯文 key→文字（不含已移除與未翻譯的條目） */
export function guideTranslations(p: ModProject): Record<string, string> {
  return Object.fromEntries(
    (p.guide?.entries ?? []).filter((e) => e.status !== 'obsolete' && e.target !== '').map((e) => [e.key, e.target]),
  );
}

const keyPrefix = (key: string): string => key.slice(0, key.indexOf('#'));

/** 資源包內的手冊譯文檔（路徑 → 內容）；skip 模式只輸出至少有一段已翻譯的檔案（其餘由遊戲退回英文） */
export function buildGuidePackFiles(p: ModProject, mode: UntranslatedMode): [string, string][] {
  if (!p.guide) return [];
  const translations = guideTranslations(p);
  const translatedFiles = new Set(Object.keys(translations).map(keyPrefix));
  return Object.entries(rebuild(p.guide.files, translations)).flatMap(([path, text]): [string, string][] => {
    const parsed = parseGuidePath(path);
    const out = guidePackPath(p.modId, path);
    if (!parsed || !out) return [];
    if (mode === 'skip' && !translatedFiles.has(guideFilePrefix(parsed))) return [];
    return [[out, text]];
  });
}
```

- [ ] **Step 4: Add guide files to packs** — `packages/core/src/export/buildResourcePack.ts`：import 區加入

```ts
import { buildGuidePackFiles } from './buildGuideFiles';
```

並把 `buildPackZip` 改為：

```ts
function buildPackZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  zip.file('pack.mcmeta', packMcmeta(opts));
  for (const p of projects) {
    zip.file(`assets/${p.modId}/lang/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
    for (const [path, text] of buildGuidePackFiles(p, opts.untranslated)) zip.file(path, text);
  }
  return zip;
}
```

`packages/core/src/export/index.ts` 加入：

```ts
export { buildGuidePackFiles, guideTranslations } from './buildGuideFiles';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- export && npm run typecheck -w @mlf/core`
Expected: PASS（既有 export 測試＋guide 6 tests），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/export
git commit -m "feat(core): write translated Patchouli guides into resource packs"
```

---

### Task 6: 資料驗證與載入

**Files:**
- Modify: `packages/core/src/catalog/validateMod.ts`
- Create: `packages/core/src/catalog/validateGuide.ts`
- Modify: `packages/core/src/catalog/index.ts`
- Create: `packages/core/src/node/loadGuide.ts`
- Modify: `packages/core/src/node/loadData.ts`
- Modify: `packages/core/src/node/index.ts`
- Test: `packages/core/src/catalog/validateGuide.test.ts`
- Modify: `packages/core/src/node/loadData.test.ts`

**Interfaces:**
- Consumes: `flatten`、`parseGuidePath`、`isPlainObject`（Task 1）、`checkGuideFormat`（Task 2）、`checkGlossary`
- Produces:
  - `ModIssue.file` 增加 `'patchouli_zh_tw.json' | \`patchouli/${string}\``
  - `langIssues(file: ModIssue['file'], value: unknown): ModIssue[]`、`formatIssueMessage(issue: FormatIssue): string`（validateMod 匯出）
  - `GUIDE_ZH_FILE = 'patchouli_zh_tw.json'`
  - `validateGuideData(files: GuideFiles, zh: unknown, terms?: readonly GlossaryTerm[]): ModIssue[]`
  - `interface LoadedGuide { files: GuideFiles; en: Readonly<Record<string, string>>; zh: Readonly<Record<string, string>> }`
  - `loadGuide(dir: string, terms: readonly GlossaryTerm[]): Promise<{ guide?: LoadedGuide; issues: readonly ModIssue[] }>`
  - `LoadedMod.guide?: LoadedGuide`

- [ ] **Step 1: Write the failing tests** — `packages/core/src/catalog/validateGuide.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { validateGuideData } from './index';

const PATH = 'guide/en_us/entries/intro.json';
const files = { [PATH]: JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Open $(br)the Wrench menu' }] }) };
const TEXT = 'guide/entries/intro.json#pages/0/text';

describe('validateGuideData', () => {
  it('accepts valid files and translations', () => {
    expect(validateGuideData(files, { 'guide/entries/intro.json#name': '簡介' })).toEqual([]);
  });

  it('reports broken, non-object and misplaced raw files as errors', () => {
    const issues = validateGuideData({
      [PATH]: '{"name":',
      'guide/en_us/entries/list.json': '[]',
      'guide/en_us/templates/custom.json': '{}',
    }, {});
    expect(issues).toEqual([
      { level: 'error', file: `patchouli/${PATH}`, message: expect.stringMatching(/^JSON 解析失敗：/) },
      { level: 'error', file: 'patchouli/guide/en_us/entries/list.json', message: '手冊檔頂層必須是物件' },
      { level: 'error', file: 'patchouli/guide/en_us/templates/custom.json', message: '手冊檔必須是 patchouli/<手冊>/en_us/ 下的 .json（templates/ 除外）' },
    ]);
  });

  it('reports malformed translation files as errors', () => {
    expect(validateGuideData(files, [])).toEqual([{ level: 'error', file: 'patchouli_zh_tw.json', message: '語言檔頂層必須是物件' }]);
    expect(validateGuideData(files, { [TEXT]: 1 })).toEqual([{ level: 'error', file: 'patchouli_zh_tw.json', key: TEXT, message: '值必須是字串' }]);
  });

  it('rejects unknown keys and warns about Patchouli format codes', () => {
    expect(validateGuideData(files, { 'guide/entries/missing.json#name': 'x', [TEXT]: '打開扳手選單' })).toEqual([
      { level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/missing.json#name', message: '手冊原文中沒有此 key' },
      { level: 'warning', file: 'patchouli_zh_tw.json', key: TEXT, message: '格式碼不一致：缺少 $(br)' },
    ]);
  });

  it('applies the glossary to guide text', () => {
    const terms: GlossaryTerm[] = [{ en: 'Wrench', zh: '扳手', level: 'error' }];
    expect(validateGuideData(files, { [TEXT]: '打開$(br)板手選單' }, terms)).toEqual([
      { level: 'error', file: 'patchouli_zh_tw.json', key: TEXT, message: '術語「Wrench」應譯為「扳手」' },
    ]);
  });
});
```

在 `packages/core/src/node/loadData.test.ts`：import 區把 `import { join } from 'node:path';` 改為 `import { dirname, join } from 'node:path';`，並在檔尾加入：

```ts
describe('patchouli guides', () => {
  const INTRO = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Open $(br)now' }] });
  const RAW = 'patchouli/guide/en_us/entries/intro.json';

  async function writeFiles(modId: string, files: Record<string, string>): Promise<void> {
    const modDir = join(dir, 'mods', modId);
    await Promise.all(Object.entries(files).map(async ([name, content]) => {
      const path = join(modDir, ...name.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
    }));
  }

  it('loads raw guide files, flattened English and translations', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#name': '簡介' }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(issues).toEqual([]);
    expect(mods[0]?.guide).toEqual({
      files: { 'guide/en_us/entries/intro.json': INTRO },
      en: { 'guide/entries/intro.json#name': 'Intro', 'guide/entries/intro.json#pages/0/text': 'Open $(br)now' },
      zh: { 'guide/entries/intro.json#name': '簡介' },
    });
  });

  it('treats a guide without translations as untranslated and mods without guides as before', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO });
    await writeMod('beta', validFiles('beta'));
    const { mods } = await loadAllMods(dir);
    expect(mods[0]?.guide?.zh).toEqual({});
    expect(mods[1]).not.toHaveProperty('guide');
  });

  it('rejects broken guide files and reports the path under patchouli/', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: '{"name":' });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods).toEqual([]);
    expect(formatIssues(issues, 'data')[0]).toMatch(/^::error file=data\/mods\/alpha\/patchouli\/guide\/en_us\/entries\/intro\.json::\[alpha\] JSON 解析失敗/);
  });

  it('rejects unknown keys, translations without raw files, and warns about format codes', async () => {
    await writeMod('bad', validFiles('bad'));
    await writeFiles('bad', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/missing.json#name': 'x' }) });
    await writeMod('orphan', validFiles('orphan'));
    await writeFiles('orphan', { 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#name': '簡介' }) });
    await writeMod('warn', validFiles('warn'));
    await writeFiles('warn', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#pages/0/text': '立即打開' }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods.map((m) => m.meta.modId)).toEqual(['warn']);
    expect(issues).toEqual([
      { modId: 'bad', level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/missing.json#name', message: '手冊原文中沒有此 key' },
      { modId: 'orphan', level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/intro.json#name', message: '手冊原文中沒有此 key' },
      { modId: 'warn', level: 'warning', file: 'patchouli_zh_tw.json', key: 'guide/entries/intro.json#pages/0/text', message: '格式碼不一致：缺少 $(br)' },
    ]);
  });

  it('reports a broken patchouli_zh_tw.json', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO, 'patchouli_zh_tw.json': '{' });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods).toEqual([]);
    expect(issues[0]).toMatchObject({ modId: 'alpha', level: 'error', file: 'patchouli_zh_tw.json' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- validateGuide loadData`
Expected: FAIL（`validateGuideData` 未匯出、`guide` 未載入）

- [ ] **Step 3: Extend `packages/core/src/catalog/validateMod.ts`**

import 區把 `import { checkFormat } from '../validate/formatCodes';` 改為：

```ts
import { checkFormat, type FormatIssue } from '../validate/formatCodes';
```

`ModIssue` 的 `file` 改為：

```ts
  readonly file: 'mod.json' | 'en_us.json' | 'zh_tw.json' | 'glossary.json' | 'patchouli_zh_tw.json' | `patchouli/${string}`;
```

`function langIssues(` 改為 `export function langIssues(`，並在 `crossIssues` 之前加入：

```ts
/** 格式碼不一致的說明文字 */
export function formatIssueMessage(issue: FormatIssue): string {
  const parts = [...issue.missing.map((t) => `缺少 ${t}`), ...issue.extra.map((t) => `多出 ${t}`)];
  return `格式碼不一致：${parts.join('、')}`;
}
```

`crossIssues` 內的以下兩行：

```ts
    const parts = [...issue.missing.map((t) => `缺少 ${t}`), ...issue.extra.map((t) => `多出 ${t}`)];
    return [{ level: 'warning', file: 'zh_tw.json', key, message: `格式碼不一致：${parts.join('、')}` }];
```

改為：

```ts
    return [{ level: 'warning', file: 'zh_tw.json', key, message: formatIssueMessage(issue) }];
```

- [ ] **Step 4: Create `packages/core/src/catalog/validateGuide.ts`**

```ts
import { checkGlossary } from '../glossary/check';
import type { GlossaryTerm } from '../glossary/schema';
import { stripBom } from '../lang/types';
import { isPlainObject } from '../patchouli/fields';
import { flatten } from '../patchouli/flatten';
import { checkGuideFormat } from '../patchouli/formatCodes';
import { parseGuidePath } from '../patchouli/paths';
import type { GuideFiles } from '../types';
import { formatIssueMessage, langIssues, type ModIssue } from './validateMod';

/** 手冊譯文檔名（相對模組資料夾） */
export const GUIDE_ZH_FILE = 'patchouli_zh_tw.json';

function fileIssue(path: string, message: string): ModIssue {
  const file: ModIssue['file'] = `patchouli/${path}`;
  return { level: 'error', file, message };
}

function rawFileIssues(path: string, text: string): ModIssue[] {
  if (!parseGuidePath(path)) return [fileIssue(path, '手冊檔必須是 patchouli/<手冊>/en_us/ 下的 .json（templates/ 除外）')];
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (err) {
    return [fileIssue(path, `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`)];
  }
  return isPlainObject(data) ? [] : [fileIssue(path, '手冊檔頂層必須是物件')];
}

function translationIssues(source: Readonly<Record<string, string>>, zh: Record<string, string>, terms: readonly GlossaryTerm[]): ModIssue[] {
  return Object.entries(zh).flatMap(([key, target]): ModIssue[] => {
    const original = Object.hasOwn(source, key) ? source[key] : undefined;
    if (original === undefined) return [{ level: 'error', file: GUIDE_ZH_FILE, key, message: '手冊原文中沒有此 key' }];
    const format = checkGuideFormat(original, target);
    const formatIssues: ModIssue[] = format ? [{ level: 'warning', file: GUIDE_ZH_FILE, key, message: formatIssueMessage(format) }] : [];
    const termIssues = checkGlossary(original, target, terms).map(({ term, level }): ModIssue => ({
      level, file: GUIDE_ZH_FILE, key, message: `術語「${term.en}」應譯為「${term.zh}」`,
    }));
    return [...formatIssues, ...termIssues];
  });
}

/** 驗證手冊原樣檔與譯文；zh 為 patchouli_zh_tw.json 的內容（不存在時傳 {}）；回傳空陣列代表完全合法 */
export function validateGuideData(files: GuideFiles, zh: unknown, terms: readonly GlossaryTerm[] = []): ModIssue[] {
  const base = [...Object.entries(files).flatMap(([path, text]) => rawFileIssues(path, text)), ...langIssues(GUIDE_ZH_FILE, zh)];
  if (base.some((i) => i.level === 'error')) return base;
  return translationIssues(flatten(files).source, zh as Record<string, string>, terms);
}
```

`packages/core/src/catalog/index.ts` 加入：

```ts
export { GUIDE_ZH_FILE, validateGuideData } from './validateGuide';
```

- [ ] **Step 5: Create `packages/core/src/node/loadGuide.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { GUIDE_ZH_FILE, validateGuideData } from '../catalog/validateGuide';
import type { ModIssue } from '../catalog/validateMod';
import type { GlossaryTerm } from '../glossary/schema';
import { stripBom } from '../lang/types';
import { flatten } from '../patchouli/flatten';
import type { GuideFiles } from '../types';

/** 原樣手冊檔所在的子資料夾 */
export const GUIDE_DIR = 'patchouli';

export interface LoadedGuide {
  readonly files: GuideFiles;
  /** 由 files 即時攤平的英文原文 */
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

export interface GuideLoad {
  readonly guide?: LoadedGuide;
  readonly issues: readonly ModIssue[];
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** 列出 root 底下所有檔案（以 / 分隔的相對路徑，排序）；資料夾不存在時回傳 null */
async function listFiles(root: string): Promise<string[] | null> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
      .sort();
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

type ZhRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ModIssue };

async function readZh(dir: string): Promise<ZhRead | null> {
  let text: string;
  try {
    text = await readFile(join(dir, GUIDE_ZH_FILE), 'utf8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  try {
    return { ok: true, value: JSON.parse(stripBom(text)) as unknown };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, issue: { level: 'error', file: GUIDE_ZH_FILE, message: `JSON 解析失敗：${reason}` } };
  }
}

/** 讀取模組資料夾的 patchouli/** 與 patchouli_zh_tw.json；兩者皆不存在時沒有手冊 */
export async function loadGuide(dir: string, terms: readonly GlossaryTerm[]): Promise<GuideLoad> {
  const root = join(dir, GUIDE_DIR);
  const [paths, zh] = await Promise.all([listFiles(root), readZh(dir)]);
  if ((paths === null || paths.length === 0) && zh === null) return { issues: [] };
  if (zh !== null && !zh.ok) return { issues: [zh.issue] };
  const list = paths ?? [];
  const texts = await Promise.all(list.map((p) => readFile(join(root, ...p.split('/')), 'utf8')));
  const files: GuideFiles = Object.fromEntries(list.map((p, i) => [p, texts[i] ?? '']));
  const zhValue = zh?.value ?? {};
  const issues = validateGuideData(files, zhValue, terms);
  if (issues.some((i) => i.level === 'error')) return { issues };
  return { guide: { files, en: flatten(files).source, zh: zhValue as Record<string, string> }, issues };
}
```

- [ ] **Step 6: Load guides in `packages/core/src/node/loadData.ts`**

import 區加入：

```ts
import { type LoadedGuide, loadGuide } from './loadGuide';
```

`LoadedMod` 的 `glossary` 之後加入：

```ts
  /** Patchouli 手冊；沒有手冊時省略 */
  readonly guide?: LoadedGuide;
```

`loadOne` 整段改為：

```ts
async function loadOne(
  modsDir: string,
  modId: string,
  globalTerms: readonly GlossaryTerm[] | null,
): Promise<{ mod?: LoadedMod; issues: DataIssue[] }> {
  const dir = join(modsDir, modId);
  const [meta, en, zh, glossary] = await Promise.all([
    readJson(dir, 'mod.json'),
    readJson(dir, 'en_us.json'),
    readJson(dir, 'zh_tw.json', {}),
    readGlossary(dir),
  ]);
  const modTerms = glossary.terms ?? [];
  const terms = globalTerms === null ? [] : mergeGlossaries(globalTerms, modTerms);
  const guideLoad = await loadGuide(dir, terms);
  const readIssues = [meta, en, zh].flatMap((r) => (r.ok ? [] : [r.issue]));
  const issues = readIssues.length > 0 || !meta.ok || !en.ok || !zh.ok
    ? readIssues
    : validateModData(modId, meta.value, en.value, zh.value, terms);
  const tagged = [...issues, ...glossary.issues, ...guideLoad.issues].map((i) => ({ ...i, modId }));
  if (tagged.some((i) => i.level === 'error') || !meta.ok || !en.ok || !zh.ok) return { issues: tagged };
  const mod: LoadedMod = {
    meta: catalogModSchema.parse(meta.value),
    en: en.value as Record<string, string>,
    zh: zh.value as Record<string, string>,
    glossary: modTerms,
    ...(guideLoad.guide ? { guide: guideLoad.guide } : {}),
  };
  return { mod, issues: tagged };
}
```

`packages/core/src/node/index.ts` 改為：

```ts
export { formatIssues, GLOBAL_GLOSSARY_ID, loadAllMods, type DataIssue, type LoadedMod, type LoadResult } from './loadData';
export { GUIDE_DIR, loadGuide, type GuideLoad, type LoadedGuide } from './loadGuide';
export { type FileWrite, writeFilesTogether } from './writeFiles';
```

- [ ] **Step 7: Run tests and data validation**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core && npm run validate:data`
Expected: 全部 PASS（validateGuide 5 tests、loadData 新增 5 tests）；typecheck 無錯誤；`validate:data` 印出「…：0 個錯誤…」（現有資料沒有手冊，結果與修改前相同）

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/catalog packages/core/src/node
git commit -m "feat(core): load and validate Patchouli guide data"
```

---

### Task 7: 網站：「含手冊」標示、手冊進度與 API

**Files:**
- Modify: `apps/site/src/lib/summary.ts`
- Modify: `apps/site/src/islands/catalogIndex.ts`
- Modify: `apps/site/src/lib/data.ts`
- Create: `apps/site/src/lib/modPayload.ts`
- Modify: `apps/site/src/pages/api/v1/mods/[modId].json.ts`
- Create: `apps/site/src/components/GuideProgress.tsx`
- Modify: `apps/site/src/components/ModCard.tsx`
- Modify: `apps/site/src/pages/mods/[modId].astro`
- Modify: `apps/site/src/i18n/zh-TW.ts`
- Modify: `apps/site/src/islands/catalogIndex.test.ts`、`apps/site/src/islands/filterMods.test.ts`、`apps/site/src/islands/ModsBrowser.test.tsx`、`apps/site/src/islands/useCatalogIndex.test.tsx`（fixture 加 `hasGuide: false`）
- Test: `apps/site/src/lib/siteData.test.ts`、`apps/site/src/lib/modPayload.test.ts`、`apps/site/src/components/GuideProgress.test.tsx`、`apps/site/src/components/ModCard.test.tsx`

**Interfaces:**
- Consumes: `catalogToProject(meta, en, zh, guide?)`、`guideStats`、`ProjectStats`（Task 4）、`LoadedMod.guide`、`LoadedGuide`（Task 6）、`GuideFiles`（Task 1）
- Produces:
  - `ModSummary.hasGuide: boolean`；`modSummarySchema.hasGuide` 預設 `false`
  - `SiteMod.guideStats: ProjectStats | null`、`toSiteMod(m: LoadedMod): SiteMod`
  - `interface ModApiBody { version: 1; meta; en_us; zh_tw; guide?: { files: GuideFiles; zh_tw: Record<string, string> } }`、`toModApiBody(mod: Pick<LoadedMod, 'meta' | 'en' | 'zh' | 'guide'>): ModApiBody`
  - `GuideProgress({ stats }: { stats: ProjectStats })`
  - i18n：`t.common.hasGuide`、`t.modPage.guideProgress(done, total)`、`t.modPage.guideWarnings(n)`

- [ ] **Step 1: Write the failing tests**

`apps/site/src/lib/siteData.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '@mlf/core/catalog';
import type { LoadedMod } from '@mlf/core/node';
import { toSiteMod, toSummary } from './data';

const meta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
});
const plain: LoadedMod = { meta, en: { a: 'Apple' }, zh: {}, glossary: [] };
const guided: LoadedMod = {
  ...plain,
  guide: {
    files: { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A', pages: [{ type: 'patchouli:text', text: 'Hello' }] }) },
    en: { 'guide/entries/a.json#name': 'A', 'guide/entries/a.json#pages/0/text': 'Hello' },
    zh: { 'guide/entries/a.json#name': '甲' },
  },
};

describe('toSiteMod', () => {
  it('computes separate lang and guide stats', () => {
    const site = toSiteMod(guided);
    expect(site.stats).toEqual({ total: 1, translated: 0, warnings: 0, percent: 0 });
    expect(site.guideStats).toEqual({ total: 2, translated: 1, warnings: 0, percent: 50 });
    expect(toSiteMod(plain).guideStats).toBeNull();
  });
});

describe('toSummary', () => {
  it('flags mods that have a guide, keeping lang-based percent', () => {
    expect(toSummary(toSiteMod(guided))).toMatchObject({ hasGuide: true, percent: 0, total: 1 });
    expect(toSummary(toSiteMod(plain)).hasGuide).toBe(false);
  });
});
```

`apps/site/src/lib/modPayload.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '@mlf/core/catalog';
import { toModApiBody } from './modPayload';

const meta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
});

describe('toModApiBody', () => {
  it('keeps the version 1 shape for mods without a guide', () => {
    expect(toModApiBody({ meta, en: { a: 'A' }, zh: { a: '甲' } })).toEqual({ version: 1, meta, en_us: { a: 'A' }, zh_tw: { a: '甲' } });
  });

  it('adds raw guide files and flattened translations, not the flattened English', () => {
    const files = { 'guide/en_us/entries/a.json': '{"name":"A"}' };
    const body = toModApiBody({ meta, en: {}, zh: {}, guide: { files, en: { 'guide/entries/a.json#name': 'A' }, zh: { 'guide/entries/a.json#name': '甲' } } });
    expect(body.version).toBe(1);
    expect(body.guide).toEqual({ files, zh_tw: { 'guide/entries/a.json#name': '甲' } });
  });
});
```

`apps/site/src/components/GuideProgress.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuideProgress } from './GuideProgress';

describe('GuideProgress', () => {
  it('shows guide progress with an accessible progress bar', () => {
    render(<GuideProgress stats={{ total: 4, translated: 3, warnings: 0, percent: 75 }} />);
    expect(screen.getByText('手冊已翻譯 3 / 4 段')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '手冊已翻譯 3 / 4 段' })).toHaveAttribute('aria-valuenow', '75');
    expect(screen.queryByText(/特殊符號/)).not.toBeInTheDocument();
  });

  it('mentions guide symbol warnings', () => {
    render(<GuideProgress stats={{ total: 4, translated: 3, warnings: 1, percent: 75 }} />);
    expect(screen.getByText('手冊有 1 段譯文的特殊符號（例如 $(item)）可能少打或多打')).toBeInTheDocument();
  });
});
```

`apps/site/src/components/ModCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ModCard } from './ModCard';

const mod = (hasGuide: boolean): ModSummary => ({
  modId: 'demo', name: 'Demo', nameZh: null, summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-15', icon: null, hasGuide,
});

describe('ModCard', () => {
  it('labels mods that include a guide book', () => {
    render(<ModCard mod={mod(true)} />);
    expect(screen.getByText('含手冊')).toBeInTheDocument();
  });

  it('shows no guide label otherwise', () => {
    render(<ModCard mod={mod(false)} />);
    expect(screen.queryByText('含手冊')).not.toBeInTheDocument();
  });
});
```

在 `apps/site/src/islands/catalogIndex.test.ts`：`summary` fixture 的 `icon: null,` 之後加入 `hasGuide: false,`，並在 describe 內最後加入：

```ts
  it('defaults a missing hasGuide to false and rejects non-boolean values', async () => {
    const { hasGuide: _omit, ...old } = summary;
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [old] }))).resolves.toEqual([summary]);
    const withGuide = { ...summary, hasGuide: true };
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [withGuide] }))).resolves.toEqual([withGuide]);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, hasGuide: 'yes' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });
```

在 `apps/site/src/islands/filterMods.test.ts` 與 `apps/site/src/islands/ModsBrowser.test.tsx` 的 `mod()` fixture，把 `updatedAt: '2026-10-01', icon: null, ...over,` 改為 `updatedAt: '2026-10-01', icon: null, hasGuide: false, ...over,`；在 `apps/site/src/islands/useCatalogIndex.test.tsx` 的 fixture，把 `updatedAt: '2026-10-15', icon: null,` 改為 `updatedAt: '2026-10-15', icon: null, hasGuide: false,`。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/site -- siteData modPayload GuideProgress ModCard catalogIndex`
Expected: FAIL（`toSiteMod`、`toModApiBody`、`GuideProgress` 不存在；`hasGuide` 未定義）

- [ ] **Step 3: Add `hasGuide` to the summary and schema**

`apps/site/src/lib/summary.ts` 的 `icon` 之後加入：

```ts
  /** 是否含 Patchouli 手冊（排序與篩選仍以語言檔為準） */
  readonly hasGuide: boolean;
```

`apps/site/src/islands/catalogIndex.ts` 的 `icon: …` 那一行之後加入：

```ts
  // 舊版 index 沒有此欄位，視為無手冊
  hasGuide: z.boolean().default(false),
```

- [ ] **Step 4: Compute guide stats in `apps/site/src/lib/data.ts`**

`import { projectStats, type ProjectStats } from '@mlf/core/merge';` 改為：

```ts
import { guideStats, projectStats, type ProjectStats } from '@mlf/core/merge';
```

`SiteMod` 改為：

```ts
export interface SiteMod extends LoadedMod {
  readonly stats: ProjectStats;
  /** 手冊完成度；沒有手冊時為 null */
  readonly guideStats: ProjectStats | null;
}

/** 語言檔與手冊分別統計 */
export function toSiteMod(m: LoadedMod): SiteMod {
  const project = catalogToProject(m.meta, m.en, m.zh, m.guide);
  return { ...m, stats: projectStats(project), guideStats: guideStats(project) };
}
```

`load()` 的 return 改為：

```ts
  return { mods: mods.map(toSiteMod), glossary };
```

`toSummary` 的 `icon: modIcon(m.meta.modId),` 之後加入：

```ts
    hasGuide: m.guide !== undefined,
```

- [ ] **Step 5: Create `apps/site/src/lib/modPayload.ts`**

```ts
import type { GuideFiles } from '@mlf/core';
import type { CatalogMod } from '@mlf/core/catalog';
import type { LoadedMod } from '@mlf/core/node';

/** /api/v1/mods/<id>.json 的內容；guide 為選填，version 維持 1 */
export interface ModApiBody {
  readonly version: 1;
  readonly meta: CatalogMod;
  readonly en_us: Readonly<Record<string, string>>;
  readonly zh_tw: Readonly<Record<string, string>>;
  readonly guide?: { readonly files: GuideFiles; readonly zh_tw: Readonly<Record<string, string>> };
}

/** 手冊只輸出原樣檔與譯文；英文由使用端自行攤平 */
export function toModApiBody(mod: Pick<LoadedMod, 'meta' | 'en' | 'zh' | 'guide'>): ModApiBody {
  return {
    version: 1,
    meta: mod.meta,
    en_us: mod.en,
    zh_tw: mod.zh,
    ...(mod.guide ? { guide: { files: mod.guide.files, zh_tw: mod.guide.zh } } : {}),
  };
}
```

`apps/site/src/pages/api/v1/mods/[modId].json.ts` 改為：

```ts
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCatalog, type SiteMod } from '../../../../lib/data';
import { toModApiBody } from '../../../../lib/modPayload';

export const getStaticPaths = (async () => {
  const catalog = await getCatalog();
  return catalog.map((mod) => ({ params: { modId: mod.meta.modId }, props: { mod } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ mod: SiteMod }> = ({ props }) =>
  new Response(JSON.stringify(toModApiBody(props.mod)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
```

- [ ] **Step 6: Add strings, the progress component and the card label**

`apps/site/src/i18n/zh-TW.ts`：`common` 的 `cartCount` 之後加入

```ts
    hasGuide: '含手冊',
```

`modPage` 的 `warnings` 之後加入：

```ts
    guideProgress: (done: number, total: number) => `手冊已翻譯 ${done} / ${total} 段`,
    guideWarnings: (n: number) => `手冊有 ${n} 段譯文的特殊符號（例如 $(item)）可能少打或多打`,
```

`apps/site/src/components/GuideProgress.tsx`

```tsx
import type { ProjectStats } from '@mlf/core/merge';
import { t } from '../i18n/zh-TW';
import { ProgressBar } from './ProgressBar';

/** 模組頁語言檔進度下方的手冊進度 */
export function GuideProgress({ stats }: { readonly stats: ProjectStats }) {
  const label = t.modPage.guideProgress(stats.translated, stats.total);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <ProgressBar percent={stats.percent} label={label} />
      {stats.warnings > 0 && <p className="mt-2 text-xs text-warn">{t.modPage.guideWarnings(stats.warnings)}</p>}
    </div>
  );
}
```

`apps/site/src/components/ModCard.tsx`：import 區加入 `import { t } from '../i18n/zh-TW';`，並把

```tsx
          <span>{mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')}</span>
        </p>
```

改為：

```tsx
          <span>{mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')}</span>
          {mod.hasGuide && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t.common.hasGuide}</span>
            </>
          )}
        </p>
```

- [ ] **Step 7: Show guide progress on the mod page** — `apps/site/src/pages/mods/[modId].astro`

frontmatter 的 `import { ProgressBar } from '../../components/ProgressBar';` 之後加入：

```ts
import { GuideProgress } from '../../components/GuideProgress';
```

把下載卡片中的

```astro
          {stats.warnings > 0 && <p class="mt-2 text-xs text-warn">{t.modPage.warnings(stats.warnings)}</p>}
        </div>
```

改為：

```astro
          {stats.warnings > 0 && <p class="mt-2 text-xs text-warn">{t.modPage.warnings(stats.warnings)}</p>}
        </div>
        {mod.guideStats && <GuideProgress stats={mod.guideStats} />}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site`
Expected: 全部 PASS（新增 siteData 2、modPayload 2、GuideProgress 2、ModCard 2、catalogIndex 1 tests），`astro check` 0 errors

- [ ] **Step 9: Commit**

```bash
git add apps/site/src
git commit -m "feat(site): show guide progress, guide label and guide API payload"
```

---

### Task 8: 網站下載資源包含手冊

**Files:**
- Modify: `apps/site/src/islands/downloadPack.ts`
- Modify: `apps/site/src/islands/pack.test.tsx`

**Interfaces:**
- Consumes: `catalogToProject(meta, en, zh, guide?)`（Task 4）、`exportProjects` 含手冊（Task 5）、API `guide: { files, zh_tw }`（Task 7）
- Produces:
  - `interface GuidePayload { files: GuideFiles; zh_tw: Readonly<Record<string, string>> }`
  - `ModPayload.guide?: GuidePayload`；`fetchModData` 以 zod 驗證 `guide`，格式錯誤時丟出
  - `buildPack(payloads, mcVersion)` 寫入 `assets/<modId>/patchouli_books/<book>/zh_tw/**`

- [ ] **Step 1: Write the failing test** — 在 `apps/site/src/islands/pack.test.tsx` 的 `describe('downloadPack', …)` 內最後加入：

```ts
  it('includes translated guide files and rejects malformed guide payloads', async () => {
    const guide = {
      files: { 'guide/en_us/entries/intro.json': JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Hello' }] }) },
      zh_tw: { 'guide/entries/intro.json#pages/0/text': '你好' },
    };
    const f = fakeFetch({
      create: { ...body('create', ['1.20.1']), guide },
      broken: { ...body('broken', ['1.20.1']), guide: { files: 'x', zh_tw: {} } },
    });
    const payload = await fetchModData('create', f);
    expect(payload?.guide).toEqual(guide);
    const zip = await JSZip.loadAsync(await (await buildPack([payload as ModPayload], '1.20.1')).blob.arrayBuffer());
    const page = JSON.parse((await zip.file('assets/create/patchouli_books/guide/zh_tw/entries/intro.json')?.async('string')) ?? '{}');
    expect(page).toEqual({ name: 'Intro', pages: [{ type: 'patchouli:text', text: '你好' }] });
    await expect(fetchModData('broken', f)).rejects.toThrow('Invalid guide payload for broken');
  });

  it('treats payloads without a guide as having none', async () => {
    const payload = await fetchModData('create', fakeFetch({ create: body('create', ['1.20.1']) }));
    expect(payload).not.toHaveProperty('guide');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- pack`
Expected: FAIL（`payload.guide` 為 undefined、zip 內沒有手冊檔）

- [ ] **Step 3: Replace `apps/site/src/islands/downloadPack.ts`**

```ts
import { z } from 'zod';
import type { GuideFiles } from '@mlf/core';
import { catalogModSchema, catalogToProject, type CatalogMod } from '@mlf/core/catalog';
import { exportProjects, type ExportResult } from '@mlf/core/export';
import { modApiUrl } from '../lib/config';
export { saveBlob } from '../lib/saveBlob';

export interface GuidePayload {
  readonly files: GuideFiles;
  readonly zh_tw: Readonly<Record<string, string>>;
}

export interface ModPayload {
  readonly meta: CatalogMod;
  readonly en_us: Readonly<Record<string, string>>;
  readonly zh_tw: Readonly<Record<string, string>>;
  readonly guide?: GuidePayload;
}

type FetchLike = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const guidePayloadSchema = z
  .object({ files: z.record(z.string(), z.string()), zh_tw: z.record(z.string(), z.string()) })
  .optional();

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((v) => typeof v === 'string');
}

/** 取得單一模組資料；404 回傳 null（模組已下架），其他錯誤丟出 */
export async function fetchModData(modId: string, fetchImpl: FetchLike = fetch): Promise<ModPayload | null> {
  const res = await fetchImpl(modApiUrl(modId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${modId}`);
  const body = (await res.json()) as Record<string, unknown>;
  if (!isStringRecord(body.en_us) || !isStringRecord(body.zh_tw)) throw new Error(`Invalid payload for ${modId}`);
  const guide = guidePayloadSchema.safeParse(body.guide);
  if (!guide.success) throw new Error(`Invalid guide payload for ${modId}`);
  return {
    meta: catalogModSchema.parse(body.meta),
    en_us: body.en_us,
    zh_tw: body.zh_tw,
    ...(guide.data ? { guide: guide.data } : {}),
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function packFileName(modIds: readonly string[], mcVersion: string): string {
  const [only] = modIds;
  return modIds.length === 1 && only ? `${only}-zh_tw-${mcVersion}.zip` : `ModLangForge-zh_tw-${mcVersion}.zip`;
}

/** 在瀏覽器內把一或多個模組（含手冊）打包成單一資源包 */
export async function buildPack(payloads: readonly ModPayload[], mcVersion: string): Promise<ExportResult> {
  const projects = payloads.map((p) =>
    catalogToProject(p.meta, p.en_us, p.zh_tw, p.guide ? { files: p.guide.files, zh: p.guide.zh_tw } : undefined),
  );
  const result = await exportProjects(projects, {
    kind: 'merged-pack',
    untranslated: 'keep-source',
    mcVersion,
    description: `ModLangForge 繁中翻譯 · ${today()}`,
  });
  return { ...result, fileName: packFileName(payloads.map((p) => p.meta.modId), mcVersion) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/site -- pack && npm run typecheck -w @mlf/site`
Expected: PASS（新增 2 tests），`astro check` 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/islands
git commit -m "feat(site): include guide translations in downloaded packs"
```

---

### Task 9: 翻譯工具：語言檔／手冊切換與手冊格式碼檢查

**Files:**
- Modify: `apps/site/src/translator/store/workspaceStore.ts`
- Modify: `apps/site/src/translator/ui/filterEntries.ts`
- Modify: `apps/site/src/translator/ui/filterState.ts`
- Modify: `apps/site/src/translator/ui/FilterBar.tsx`
- Modify: `apps/site/src/translator/ui/TranslationRow.tsx`
- Modify: `apps/site/src/translator/ui/TranslationTable.tsx`
- Modify: `apps/site/src/translator/ui/Editor.tsx`
- Modify: `apps/site/src/translator/i18n/zh-TW.ts`
- Modify: `apps/site/src/translator/store/store.test.ts`
- Modify: `apps/site/src/translator/ui/filterEntries.test.ts`
- Modify: `apps/site/src/translator/ui/TranslationRow.test.tsx`
- Modify: `apps/site/src/translator/ui/TranslationTable.test.tsx`

**Interfaces:**
- Consumes: `readJar` 帶 `guide`（Task 3）、`buildProject`／`mergeProject`／`updateEntry(…, section)`／`hasGuideWarning`（Task 4）、`checkGuideFormat`（Task 2）、`EntrySection`（Task 1）
- Produces:
  - `editEntry(modId: string, key: string, target: string, section?: EntrySection): void`（預設 `'lang'`）
  - `FilterOptions.section: EntrySection`；`FilterState.section: EntrySection`（初始 `'lang'`）
  - `FilterBar` 新增 prop `showSection: boolean`；select `aria-label="內容"`，選項 `lang`「語言檔」、`guide`「手冊」
  - `type FormatCheck = (source: string, target: string) => FormatIssue | null`；`TranslationRow`／`TranslationTable` 新增選填 prop `check`（預設 `checkFormat`）

- [ ] **Step 1: Write the failing tests**

在 `apps/site/src/translator/store/store.test.ts` 的 `describe('workspace store', …)` 之前加入：

```ts
const GUIDE_PATH = 'assets/alpha/patchouli_books/guide/en_us/entries/intro.json';
const G_NAME = 'guide/entries/intro.json#name';
const G_TEXT = 'guide/entries/intro.json#pages/0/text';

async function guideJarFile(name: string, text: string): Promise<File> {
  return makeJarFile(name, await makeJar({
    'assets/alpha/lang/en_us.json': JSON.stringify({ k: 'v' }),
    [GUIDE_PATH]: JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text }] }),
  }));
}
```

並在該 describe 內最後加入：

```ts
  it('builds guide entries, edits them separately and keeps them across merge and reload', async () => {
    await ws().addJars([await guideJarFile('a.jar', 'Hello')]);
    expect(ws().mods[0]?.guide?.entries.map((e) => e.key)).toEqual([G_NAME, G_TEXT]);
    ws().editEntry('alpha', G_NAME, '簡介', 'guide');
    expect(ws().mods[0]?.entries[0]?.target).toBe('');
    await ws().addJars([await guideJarFile('a2.jar', 'Hello again')]);
    await ws().resolveConflict('alpha', 'merge');
    expect(ws().mods[0]?.guide?.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      [G_NAME, '簡介', 'translated'],
      [G_TEXT, '', 'new'],
    ]);
    await flushPendingSaves();
    useWorkspace.setState(initialWorkspaceState);
    await ws().init();
    expect(ws().mods[0]?.guide?.entries[0]?.target).toBe('簡介');
  });
```

在 `apps/site/src/translator/ui/filterEntries.test.ts`：`describe('filterEntries', …)` 內的 `base` 改為 `const base = { scope: 'current' as const, activeModId: 'alpha', query: '', status: 'all' as const, section: 'lang' as const };`，並在檔尾加入：

```ts
const GUIDE_FILES = {
  'guide/en_us/entries/a.json': JSON.stringify({ name: 'Guide Apple', pages: [{ type: 'patchouli:text', text: 'Use $(item)it$()' }] }),
};
const gamma = updateEntry(
  buildProject({ ...d('gamma', { g: 'Gamma' }), guide: { files: GUIDE_FILES, skipped: [] } }, 1),
  'guide/entries/a.json#pages/0/text', '使用', 2, 'guide',
);
const guideKeys = (opts: Parameters<typeof filterEntries>[1]) => filterEntries([alpha, gamma], opts).map((h) => `${h.modId}:${h.entry.key}`);

describe('filterEntries guide section', () => {
  const base = { scope: 'current' as const, activeModId: 'gamma', query: '', status: 'all' as const, section: 'guide' as const };

  it('lists guide entries of the active mod and keeps lang entries in the lang section', () => {
    expect(guideKeys(base)).toEqual(['gamma:guide/entries/a.json#name', 'gamma:guide/entries/a.json#pages/0/text']);
    expect(guideKeys({ ...base, section: 'lang' })).toEqual(['gamma:g']);
  });

  it('uses Patchouli format checks for the warning filter and searches guide text', () => {
    expect(guideKeys({ ...base, status: 'warning' })).toEqual(['gamma:guide/entries/a.json#pages/0/text']);
    expect(guideKeys({ ...base, query: 'guide apple' })).toEqual(['gamma:guide/entries/a.json#name']);
  });

  it('returns nothing for projects without a guide (e.g. restored from older IndexedDB data)', () => {
    expect(guideKeys({ ...base, activeModId: 'alpha' })).toEqual([]);
    expect(guideKeys({ ...base, scope: 'all' })).toEqual(['gamma:guide/entries/a.json#name', 'gamma:guide/entries/a.json#pages/0/text']);
  });
});
```

在 `apps/site/src/translator/ui/TranslationRow.test.tsx` 的 import 區加入 `import { checkGuideFormat } from '@mlf/core/patchouli';`，並在檔尾加入：

```tsx
describe('TranslationRow format check', () => {
  const guideEntry: TranslationEntry = { key: 'g', source: 'Use $(item)it$()', target: '使用', status: 'translated' };

  it('uses the provided checker for warnings', () => {
    render(<TranslationRow index={0} modId="alpha" entry={guideEntry} showModId={false} showReference={false} check={checkGuideFormat} onCommit={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('缺少 $(item) $()')).toBeInTheDocument();
  });

  it('defaults to the lang checker, which ignores Patchouli codes', () => {
    render(<TranslationRow index={0} modId="alpha" entry={guideEntry} showModId={false} showReference={false} onCommit={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.queryByText(/缺少/)).not.toBeInTheDocument();
  });
});
```

在 `apps/site/src/translator/ui/TranslationTable.test.tsx` 檔尾加入：

```tsx
describe('Editor guide section', () => {
  const guideFiles = {
    'guide/en_us/entries/intro.json': JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Use $(item)Wrench$()' }] }),
  };
  const TEXT_KEY = 'guide/entries/intro.json#pages/0/text';

  beforeEach(() => {
    const project = buildProject({ ...detected, guide: { files: guideFiles, skipped: [] } }, 1);
    useWorkspace.setState({ ...initialWorkspaceState, mods: [project], activeModId: 'alpha', editEntry });
  });

  it('switches to guide entries and commits them to the guide section', async () => {
    render(<Editor />);
    await userEvent.selectOptions(screen.getByLabelText('內容'), 'guide');
    expect(screen.getByText('Use $(item)Wrench$()')).toBeInTheDocument();
    expect(textareas()).toHaveLength(2);
    await userEvent.type(textareas()[1]!, '使用扳手{Enter}');
    expect(editEntry).toHaveBeenCalledWith('alpha', TEXT_KEY, '使用扳手', 'guide');
  });

  it('checks Patchouli format codes on guide rows', async () => {
    const mod = useWorkspace.getState().mods[0]!;
    const guide = {
      ...mod.guide!,
      entries: mod.guide!.entries.map((e) => (e.key === TEXT_KEY ? { ...e, target: '使用扳手', status: 'translated' as const } : e)),
    };
    useWorkspace.setState({ mods: [{ ...mod, guide }] });
    render(<Editor />);
    await userEvent.selectOptions(screen.getByLabelText('內容'), 'guide');
    expect(screen.getByText('缺少 $(item) $()')).toBeInTheDocument();
  });

  it('hides the section switch when no mod has a guide', () => {
    useWorkspace.setState({ mods: [buildProject(detected, 1)] });
    render(<Editor />);
    expect(screen.queryByLabelText('內容')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/site -- translator`
Expected: FAIL（`editEntry` 不接受 section、`section` 篩選與「內容」切換不存在、`check` prop 不存在）

- [ ] **Step 3: Store accepts a section** — `apps/site/src/translator/store/workspaceStore.ts`

`import type { DetectedMod, ModProject } from '@mlf/core';` 改為：

```ts
import type { DetectedMod, EntrySection, ModProject } from '@mlf/core';
```

`WorkspaceActions` 的 `editEntry` 改為：

```ts
  /** section 預設為語言檔；手冊條目傳 'guide' */
  editEntry: (modId: string, key: string, target: string, section?: EntrySection) => void;
```

實作的 `editEntry` 改為：

```ts
    editEntry: (modId, key, target, section = 'lang') => {
      const mod = get().mods.find((m) => m.id === modId);
      if (!mod) return;
      const next = updateEntry(mod, key, target, Date.now(), section);
      if (next === mod) return;
      set({ mods: replaceMod(get().mods, next) });
      saveNow(modId);
    },
```

- [ ] **Step 4: Replace `apps/site/src/translator/ui/filterEntries.ts`**

```ts
import { hasGuideWarning, hasWarning } from '@mlf/core/merge';
import type { EntrySection, ModProject, TranslationEntry } from '@mlf/core';

export type StatusFilter = 'all' | 'untranslated' | 'translated' | 'warning' | 'new';
export type SearchScope = 'current' | 'all';

export interface SearchHit {
  readonly modId: string;
  readonly entry: TranslationEntry;
}

export interface FilterOptions {
  readonly scope: SearchScope;
  readonly activeModId: string | null;
  readonly query: string;
  readonly status: StatusFilter;
  /** 語言檔或手冊條目 */
  readonly section: EntrySection;
}

type EntryTest = (e: TranslationEntry) => boolean;

const STATUS_TESTS: Readonly<Record<Exclude<StatusFilter, 'warning'>, EntryTest>> = {
  all: () => true,
  untranslated: (e) => e.target === '',
  translated: (e) => e.target !== '',
  new: (e) => e.status === 'new',
};

function statusTest(status: StatusFilter, section: EntrySection): EntryTest {
  if (status === 'warning') return section === 'guide' ? hasGuideWarning : hasWarning;
  return STATUS_TESTS[status];
}

/** 沒有手冊的專案（含 IndexedDB 舊資料）在手冊區塊沒有條目 */
function sectionEntries(m: ModProject, section: EntrySection): readonly TranslationEntry[] {
  return section === 'guide' ? (m.guide?.entries ?? []) : m.entries;
}

function matchesQuery(e: TranslationEntry, q: string): boolean {
  return q === '' || [e.key, e.source, e.target].some((s) => s.toLowerCase().includes(q));
}

export function filterEntries(mods: readonly ModProject[], opts: FilterOptions): SearchHit[] {
  const q = opts.query.trim().toLowerCase();
  const scoped = opts.scope === 'all' ? mods : mods.filter((m) => m.id === opts.activeModId);
  const test = statusTest(opts.status, opts.section);
  return scoped.flatMap((m) =>
    sectionEntries(m, opts.section)
      .filter((e) => e.status !== 'obsolete' && test(e) && matchesQuery(e, q))
      .map((entry) => ({ modId: m.id, entry })),
  );
}
```

`apps/site/src/translator/ui/filterState.ts` 改為：

```ts
import type { EntrySection } from '@mlf/core';
import type { SearchScope, StatusFilter } from './filterEntries';

export interface FilterState {
  readonly query: string;
  readonly status: StatusFilter;
  readonly scope: SearchScope;
  readonly showReference: boolean;
  readonly section: EntrySection;
}

export const initialFilter: FilterState = { query: '', status: 'all', scope: 'current', showReference: false, section: 'lang' };
```

- [ ] **Step 5: Add the section switch** — `apps/site/src/translator/i18n/zh-TW.ts` 的 `filter` 內 `scopeAll` 之後加入：

```ts
    sectionLabel: '內容',
    sectionLang: '語言檔',
    sectionGuide: '手冊',
```

`apps/site/src/translator/ui/FilterBar.tsx` 改為：

```tsx
import type { EntrySection } from '@mlf/core';
import { t } from '../i18n/zh-TW';
import type { SearchScope, StatusFilter } from './filterEntries';
import type { FilterState } from './filterState';

const STATUS_OPTIONS: readonly StatusFilter[] = ['all', 'untranslated', 'translated', 'warning', 'new'];
const STATUS_TEXT: Readonly<Record<StatusFilter, string>> = {
  all: t.status.all,
  untranslated: t.status.untranslated,
  translated: t.status.translated,
  warning: t.status.warning,
  new: t.status.new,
};

interface FilterBarProps {
  readonly value: FilterState;
  readonly count: number;
  /** 有模組含手冊時才顯示「語言檔／手冊」切換 */
  readonly showSection: boolean;
  readonly onChange: (next: FilterState) => void;
}

export function FilterBar({ value, count, showSection, onChange }: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-line p-3 text-sm">
      <input
        type="search"
        className="input min-w-48 flex-1"
        aria-label={t.filter.search}
        placeholder={t.filter.search}
        value={value.query}
        onChange={(e) => set('query', e.target.value)}
      />
      {showSection && (
        <label className="flex items-center gap-1">
          <span className="text-muted">{t.filter.sectionLabel}</span>
          <select className="input" aria-label={t.filter.sectionLabel} value={value.section} onChange={(e) => set('section', e.target.value as EntrySection)}>
            <option value="lang">{t.filter.sectionLang}</option>
            <option value="guide">{t.filter.sectionGuide}</option>
          </select>
        </label>
      )}
      <label className="flex items-center gap-1">
        <span className="text-muted">{t.filter.statusLabel}</span>
        <select className="input" value={value.status} onChange={(e) => set('status', e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted">{t.filter.scopeLabel}</span>
        <select className="input" value={value.scope} onChange={(e) => set('scope', e.target.value as SearchScope)}>
          <option value="current">{t.filter.scopeCurrent}</option>
          <option value="all">{t.filter.scopeAll}</option>
        </select>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-primary" checked={value.showReference} onChange={(e) => set('showReference', e.target.checked)} />
        {t.table.showReference}
      </label>
      <span className="ml-auto text-muted">{t.filter.count(count)}</span>
    </div>
  );
}
```

- [ ] **Step 6: Rows take a format checker** — `apps/site/src/translator/ui/TranslationRow.tsx`

`import { checkFormat } from '@mlf/core/validate';` 改為：

```ts
import { checkFormat, type FormatIssue } from '@mlf/core/validate';
```

在 `interface TranslationRowProps` 之前加入：

```ts
/** 格式碼檢查；手冊條目傳 checkGuideFormat */
export type FormatCheck = (source: string, target: string) => FormatIssue | null;
```

`TranslationRowProps` 的 `autoCommit?` 之後加入：

```ts
  readonly check?: FormatCheck;
```

`WarningText` 改為：

```tsx
function WarningText({ source, target, check }: { readonly source: string; readonly target: string; readonly check: FormatCheck }) {
  const issue = check(source, target);
  if (!issue) return null;
  const parts = [
    ...(issue.missing.length > 0 ? [t.table.missing(issue.missing.join(' '))] : []),
    ...(issue.extra.length > 0 ? [t.table.extra(issue.extra.join(' '))] : []),
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs text-warn">
      {parts.map((p) => <span key={p}>{p}</span>)}
    </div>
  );
}
```

`TranslationRow` 的參數解構改為：

```tsx
export function TranslationRow({ index, modId, entry, showModId, showReference, terms = NO_TERMS, onCommit, onNavigate, autoCommit = true, check = checkFormat }: TranslationRowProps) {
```

並把 `<WarningText source={entry.source} target={value} />` 改為：

```tsx
          <WarningText source={entry.source} target={value} check={check} />
```

`apps/site/src/translator/ui/TranslationTable.tsx`：`import { TranslationRow } from './TranslationRow';` 改為

```ts
import { type FormatCheck, TranslationRow } from './TranslationRow';
```

`TranslationTableProps` 的 `autoCommit?` 之後加入：

```ts
  /** 傳給每一列的格式碼檢查；省略時用語言檔檢查 */
  readonly check?: FormatCheck;
```

參數解構改為 `export function TranslationTable({ hits, showModId, showReference, onCommit, termsFor, autoCommit = true, check }: TranslationTableProps) {`，並在 `<TranslationRow` 的 `autoCommit={autoCommit}` 之後加入 `check={check}`。

- [ ] **Step 7: Replace `apps/site/src/translator/ui/Editor.tsx`**

```tsx
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { checkGuideFormat } from '@mlf/core/patchouli';
import { checkFormat } from '@mlf/core/validate';
import { useWorkspace } from '../store/workspaceStore';
import { t } from '../i18n/zh-TW';
import { filterEntries } from './filterEntries';
import { FilterBar } from './FilterBar';
import { type FilterState, initialFilter } from './filterState';
import { TranslationTable } from './TranslationTable';
import { useGlossary } from '../glossary/useGlossary';

export function Editor() {
  const mods = useWorkspace((s) => s.mods);
  const activeModId = useWorkspace((s) => s.activeModId);
  const editEntry = useWorkspace((s) => s.editEntry);
  const [filter, setFilter] = useState<FilterState>(initialFilter);
  const query = useDeferredValue(filter.query);
  const termsFor = useGlossary();
  const showSection = mods.some((m) => m.guide !== undefined);
  const section = showSection ? filter.section : 'lang';

  const hits = useMemo(
    () => filterEntries(mods, { scope: filter.scope, activeModId, query, status: filter.status, section }),
    [mods, filter.scope, filter.status, activeModId, query, section],
  );

  const editGuide = useCallback(
    (modId: string, key: string, target: string) => editEntry(modId, key, target, 'guide'),
    [editEntry],
  );

  if (filter.scope === 'current' && activeModId === null) {
    return <p className="p-10 text-center text-muted">{t.app.selectMod}</p>;
  }

  const isGuide = section === 'guide';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar value={filter} count={hits.length} showSection={showSection} onChange={setFilter} />
      <TranslationTable
        hits={hits}
        showModId={filter.scope === 'all'}
        showReference={filter.showReference}
        onCommit={isGuide ? editGuide : editEntry}
        check={isGuide ? checkGuideFormat : checkFormat}
        termsFor={termsFor}
      />
    </div>
  );
}
```

- [ ] **Step 8: Run tests, typecheck and lint**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site && npm run lint`
Expected: 全部 PASS（store 1、filterEntries 3、TranslationRow 2、Editor guide 3 新 tests；既有 Editor 測試的 `editEntry` 仍以 3 個參數呼叫），`astro check` 0 errors，lint 無錯誤

- [ ] **Step 9: Commit**

```bash
git add apps/site/src/translator
git commit -m "feat(translator): translate guide entries with a lang/guide switch"
```

---

### Task 10: 翻譯工具匯出：貢獻檔含手冊、警告數含手冊

**Files:**
- Modify: `apps/site/src/translator/ui/contribution.ts`
- Modify: `apps/site/src/translator/ui/ExportDialog.tsx`
- Modify: `apps/site/src/translator/ui/ExportDialog.test.tsx`

**Interfaces:**
- Consumes: `guideTranslations(p)`（Task 5）、`guideStats(p)`（Task 4）、`updateEntry(…, 'guide')`（Task 4）
- Produces:
  - `buildContribution(projects, today)` 對含手冊的專案多寫 `<modId>/patchouli/<book>/en_us/**.json`（原樣）與 `<modId>/patchouli_zh_tw.json`
  - `ExportDialog` 的警告數 = 語言檔警告＋手冊警告

- [ ] **Step 1: Write the failing tests** — 在 `apps/site/src/translator/ui/ExportDialog.test.tsx`：

`import { buildProject, updateEntry } from '@mlf/core/merge';` 保持不變；在 `let alpha: ModProject;` 之前加入：

```ts
const GUIDE_PATH = 'guide/en_us/entries/intro.json';
const GUIDE_TEXT = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Use $(item)it$()' }] });
const guided = (key: string, target: string): ModProject =>
  updateEntry(buildProject({ ...d('gamma'), guide: { files: { [GUIDE_PATH]: GUIDE_TEXT }, skipped: [] } }, 1), key, target, 2, 'guide');
```

在 `describe('buildContribution', …)` 內最後加入：

```ts
  it('adds raw guide files and flattened guide translations for mods with a guide', async () => {
    const result = await buildContribution([guided('guide/entries/intro.json#name', '簡介'), alpha], '2026-10-17');
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(await zip.file(`gamma/patchouli/${GUIDE_PATH}`)?.async('string')).toBe(GUIDE_TEXT);
    expect(JSON.parse((await zip.file('gamma/patchouli_zh_tw.json')?.async('string')) ?? '{}')).toEqual({ 'guide/entries/intro.json#name': '簡介' });
    expect(zip.file('alpha/patchouli_zh_tw.json')).toBeNull();
    expect(await zip.file('README.txt')?.async('string')).toContain('patchouli');
  });
```

在 `describe('ExportDialog', …)` 內最後加入：

```ts
  it('counts guide format warnings together with lang warnings', () => {
    useWorkspace.setState({ mods: [alpha, guided('guide/entries/intro.json#pages/0/text', '使用')] });
    render(<ExportDialog onClose={vi.fn()} exportFn={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText('有 2 處特殊符號待確認，仍可下載。')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/site -- ExportDialog`
Expected: FAIL（貢獻檔沒有手冊檔；警告數仍為 1）

- [ ] **Step 3: Add guide files to the contribution** — `apps/site/src/translator/ui/contribution.ts`

`import { DEFAULT_MC_VERSION, type ExportResult } from '@mlf/core/export';` 改為：

```ts
import { DEFAULT_MC_VERSION, type ExportResult, guideTranslations } from '@mlf/core/export';
```

`readme` 陣列中 `'2. 把每個資料夾放到 data/mods/ 底下（資料夾名稱即 modId）。',` 之後加入：

```ts
    '   含手冊的模組另有 patchouli/ 資料夾與 patchouli_zh_tw.json，請整個資料夾一起放入。',
```

在 `buildContribution` 之前加入：

```ts
/** 原樣手冊檔與攤平後的手冊譯文；沒有手冊時回傳空陣列 */
function guideContributionFiles(p: ModProject): [string, string][] {
  if (!p.guide || Object.keys(p.guide.files).length === 0) return [];
  const raw = Object.entries(p.guide.files).map(([path, text]): [string, string] => [`patchouli/${path}`, text]);
  return [...raw, ['patchouli_zh_tw.json', toJson(guideTranslations(p))]];
}
```

並在 `buildContribution` 迴圈內 `zh_tw.json` 那一行之後加入：

```ts
    for (const [path, text] of guideContributionFiles(p)) zip.file(`${p.modId}/${path}`, text);
```

- [ ] **Step 4: Count guide warnings** — `apps/site/src/translator/ui/ExportDialog.tsx`

`import { projectStats } from '@mlf/core/merge';` 改為 `import { guideStats, projectStats } from '@mlf/core/merge';`，並把

```ts
  const warnings = chosen.reduce((sum, m) => sum + projectStats(m).warnings, 0);
```

改為：

```ts
  const warnings = chosen.reduce((sum, m) => sum + projectStats(m).warnings + (guideStats(m)?.warnings ?? 0), 0);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/site -- ExportDialog && npm run typecheck -w @mlf/site`
Expected: PASS（新增 2 tests），`astro check` 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/translator/ui
git commit -m "feat(translator): include guides in contribution packages and warnings"
```

---

### Task 11: E2E 與文件

**Files:**
- Modify: `e2e/site.spec.ts`
- Modify: `data/README.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: 既有 helper `gotoHydrated`、`unzipDownload`、`makeJar`；翻譯工具「內容」切換（Task 9）；資源包含手冊（Task 5）；ExportDialog 標題「下載翻譯」、按鈕「下載」

- [ ] **Step 1: Write the E2E test** — 在 `e2e/site.spec.ts` 的 `test('translator shows glossary hints and flags unused terms', …)` 之後加入：

```ts
test('translator translates a Patchouli guide and exports it in the resource pack', async ({ page }) => {
  const jar = await makeJar({
    'assets/guidemod/lang/en_us.json': JSON.stringify({ 'item.guidemod.book': 'Guide Book' }),
    'data/guidemod/patchouli_books/guide/book.json': JSON.stringify({ name: 'item.guidemod.book', use_resource_pack: true }),
    'assets/guidemod/patchouli_books/guide/en_us/entries/intro.json': JSON.stringify({
      name: 'Introduction', category: 'guidemod:basics',
      pages: [{ type: 'patchouli:text', text: 'Welcome to $(item)Guide Mod$().' }],
    }),
    'fabric.mod.json': JSON.stringify({ id: 'guidemod', name: 'Guide Mod', version: '1.0.0' }),
  });
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('把模組 .jar 檔拖到這裡，或點一下選擇檔案').setInputFiles({
    name: 'guidemod.jar', mimeType: 'application/java-archive', buffer: Buffer.from(jar),
  });
  await expect(page.getByText('Guide Book')).toBeVisible();
  await page.getByLabel('內容', { exact: true }).selectOption('guide');
  await expect(page.getByText('Welcome to $(item)Guide Mod$().')).toBeVisible();
  await page.getByRole('textbox', { name: /guide\/entries\/intro\.json#pages\/0\/text/ }).fill('歡迎使用$(item)指南模組$()。');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下載翻譯' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '下載', exact: true }).click(),
  ]);
  const zip = await unzipDownload(download);
  const entry = JSON.parse((await zip.file('assets/guidemod/patchouli_books/guide/zh_tw/entries/intro.json')?.async('string')) ?? '{}');
  expect(entry.pages[0].text).toBe('歡迎使用$(item)指南模組$()。');
  expect(entry.name).toBe('Introduction');
  expect(entry.category).toBe('guidemod:basics');
  expect(zip.file('assets/guidemod/lang/zh_tw.json')).not.toBeNull();
});
```

- [ ] **Step 2: Run E2E**

Run: `PUBLIC_SUGGEST_ENABLED=true npm run build && npm run test:e2e`
Expected: 全部 PASS（含新測試）。需要 `.dev.vars`（本 worktree 已有）；若其他 worktree 同時跑 e2e，加上 `E2E_PORT=8791`。

- [ ] **Step 3: Document the data format** — `data/README.md` 的表格在 `zh_tw.json` 那一列之後加入：

```markdown
| `patchouli/<手冊>/en_us/**.json` | 選填。Patchouli 手冊的英文原樣檔（分類、條目），直接從 jar 的 `assets/<modId>/patchouli_books/` 複製，不要改動 |
| `patchouli_zh_tw.json` | 選填。手冊譯文，key 為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；每個 key 都必須存在於原樣檔 |
```

- [ ] **Step 4: Document guide translation** — 在 `CONTRIBUTING.md` 的「## 術語表」段落之後、「## Pull Request 規範」之前加入：

```markdown
## Patchouli 手冊

- 上傳 jar 翻譯時會一併讀出 `assets/<modId>/patchouli_books/<手冊>/en_us/` 的手冊；在篩選列把「內容」切到「手冊」就能翻譯，下載資源包時會寫入 `zh_tw` 手冊檔。
- 收錄位置：`data/mods/<modId>/patchouli/<手冊>/en_us/**.json`（英文原樣檔，不要改動）與 `patchouli_zh_tw.json`（譯文）。用「分享給本站」下載的貢獻檔已經是這個結構。
- 譯文 key 格式：`<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`，例如 `guide/entries/basics/intro.json#pages/0/text`。只翻分類與條目的 `name`、`description`，以及每頁的 `title`、`text`、`link_text`。
- 保留 Patchouli 格式碼，例如 `$(item)`、`$(l:路徑)`、`$(br)`、`$()`、`$(#ff0000)`；`$(t:提示)` 裡的提示文字可以翻譯。
- 不支援：`book.json` 設定 `"i18n": true` 的手冊（文字已在語言檔）、內容放在 `data/` 的舊式手冊、自訂模板（`templates/`）文字。
```

- [ ] **Step 5: Run the full verification**

Run: `npm run lint && npm run typecheck -w @mlf/core && npm run typecheck -w @mlf/site && npm test && npm run test:coverage -w @mlf/core && npm run validate:data`
Expected: 全部 PASS；core 覆蓋率 ≥ 80%（lines／functions／branches／statements）；`validate:data` 0 個錯誤

- [ ] **Step 6: Commit**

```bash
git add e2e/site.spec.ts data/README.md CONTRIBUTING.md
git commit -m "test: cover guide translation end to end and document guide data"
```
