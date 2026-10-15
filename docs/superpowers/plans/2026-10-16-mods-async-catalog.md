# 模組目錄非同步載入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/mods` 只 SSR 前 24 筆，hydrate 後從 `/api/v1/index.json` 載入完整目錄，並加上狀態篩選、排序與漸進渲染。

**Architecture:** 純函式（篩選／排序）與 client-safe 型別抽到不含 node 匯入的模組；`catalogIndex.ts` 負責 fetch＋zod 驗證；兩個 hook（`useCatalogIndex`、`useIncrementalList`）各管一件事；`ModsBrowser` 只做組合與畫面。

**Tech Stack:** Astro 7、React 18、zod 4、Vitest＋Testing Library（jsdom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-16-mods-async-catalog-design.md`

## Global Constraints

- 首屏 SSR 筆數：24（`INITIAL_COUNT`）。
- 漸進渲染每批：48（`PAGE_SIZE`）。
- 完整清單來源：`/api/v1/index.json`，回應 `{ version: 1, generatedAt, mods: ModSummary[] }`，不新增資料契約。
- 排序鍵：`name`（預設）、`updated`（`byUpdatedDesc`）、`percent`（高到低，同分依名稱）。
- 狀態篩選值：`TRANSLATION_STATUSES`（`machine`／`partial`／`reviewed`），標籤用 `STATUS_LABELS`。
- `/api/v1/*` 回應標頭：`Cache-Control: public, max-age=300`。
- 所有 UI 文字放 `apps/site/src/i18n/zh-TW.ts` 的 `mods` 區塊。
- 不可變：排序／篩選回傳新陣列，不修改輸入。
- client island 不可（直接或間接）匯入 `apps/site/src/lib/data.ts`（它匯入 `node:path` 與 `@mlf/core/node`）的值；只能 `import type`。

## Review Focus

1. API 回應格式不符（`version` 不是 1、欄位缺漏、HTTP 非 2xx）→ 視為載入失敗，保留 SSR 清單並顯示錯誤。（Task 2 測試）
2. 載入中元件卸載或按重試 → 舊請求被 abort，不在卸載後 setState、不以舊結果覆蓋新結果。（Task 3 測試）
3. 目錄為空（0 個模組）→ 顯示「沒有符合條件的模組」，不崩潰。（Task 5 測試）
4. 清單筆數 ≤ 每批筆數 → 不渲染哨兵、不建立 observer。（Task 4 測試）
5. 排序不改動原陣列（SSR 的 `initial` 與載入的 `mods` 會被重複使用）。（Task 1 測試）

---

### Task 1: 抽出 client-safe 摘要模組，擴充篩選與排序

**Files:**
- Create: `apps/site/src/lib/summary.ts`
- Modify: `apps/site/src/lib/data.ts`（移出 `ModSummary`、`byUpdatedDesc`，改為 re-export）
- Modify: `apps/site/src/islands/filterMods.ts`
- Modify: `apps/site/src/islands/ModsBrowser.tsx`（只改 `filterMods` 呼叫與型別匯入，維持可編譯）
- Create: `apps/site/src/islands/filterMods.test.ts`
- Modify: `apps/site/src/islands/ModsBrowser.test.tsx`（移除 `filterMods` describe）

**Interfaces:**
- Produces:
  - `lib/summary.ts`：`interface ModSummary`（欄位同現有）、`byUpdatedDesc(a, b): number`、`INITIAL_COUNT = 24`
  - `islands/filterMods.ts`：`ALL = ''`、`interface ModFilter { loader: string; version: string; status: string }`、`filterMods(mods: readonly ModSummary[], filter: ModFilter): ModSummary[]`、`SORT_KEYS = ['name','updated','percent'] as const`、`type SortKey`、`sortMods(mods: readonly ModSummary[], key: SortKey): ModSummary[]`

- [ ] **Step 1: Write the failing test** — `apps/site/src/islands/filterMods.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ALL, filterMods, sortMods } from './filterMods';

const mod = (modId: string, over: Partial<ModSummary> = {}): ModSummary => ({
  modId, name: modId, nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-01', ...over,
});

const NONE = { loader: ALL, version: ALL, status: ALL };

describe('filterMods', () => {
  const mods = [
    mod('alpha', { loaders: ['fabric'], status: 'reviewed' }),
    mod('beta', { mcVersions: ['1.21.1', '1.20.1'] }),
    mod('gamma', { mcVersions: ['1.12.2'], status: 'machine' }),
  ];

  it('returns all mods with no filter', () => {
    expect(filterMods(mods, NONE).map((m) => m.modId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('filters by loader and version', () => {
    expect(filterMods(mods, { ...NONE, loader: 'forge' }).map((m) => m.modId)).toEqual(['beta', 'gamma']);
    expect(filterMods(mods, { ...NONE, loader: 'forge', version: '1.20.1' }).map((m) => m.modId)).toEqual(['beta']);
  });

  it('filters by status', () => {
    expect(filterMods(mods, { ...NONE, status: 'machine' }).map((m) => m.modId)).toEqual(['gamma']);
  });
});

describe('sortMods', () => {
  const mods = [
    mod('beta', { percent: 80, updatedAt: '2026-10-03' }),
    mod('alpha', { percent: 80, updatedAt: '2026-10-01' }),
    mod('gamma', { percent: 100, updatedAt: '2026-10-02' }),
  ];

  it('sorts by name', () => {
    expect(sortMods(mods, 'name').map((m) => m.modId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('sorts by most recently updated', () => {
    expect(sortMods(mods, 'updated').map((m) => m.modId)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts by percent descending, ties by name', () => {
    expect(sortMods(mods, 'percent').map((m) => m.modId)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('does not mutate the input', () => {
    const before = mods.map((m) => m.modId);
    sortMods(mods, 'name');
    expect(mods.map((m) => m.modId)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- filterMods`
Expected: FAIL（`../lib/summary` 不存在、`sortMods` 未匯出）

- [ ] **Step 3: Create `apps/site/src/lib/summary.ts`**

```ts
import type { CatalogMod } from '@mlf/core/catalog';

/** /mods 首屏 SSR 的筆數 */
export const INITIAL_COUNT = 24;

/** 目錄摘要（首頁、列表頁、API index 共用）；本檔不可匯入 node 模組，供 client island 使用 */
export interface ModSummary {
  readonly modId: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly summary: string;
  readonly mcVersions: readonly string[];
  readonly loaders: readonly CatalogMod['loaders'][number][];
  readonly status: CatalogMod['translation']['status'];
  readonly percent: number;
  readonly total: number;
  readonly updatedAt: string;
}

export function byUpdatedDesc(a: ModSummary, b: ModSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}
```

- [ ] **Step 4: Update `apps/site/src/lib/data.ts`**

刪除檔案中的 `ModSummary` interface 與 `byUpdatedDesc` 函式定義，在檔案頂部匯入區之後加入：

```ts
import type { ModSummary } from './summary';

export type { ModSummary } from './summary';
export { byUpdatedDesc } from './summary';
```

`toSummary` 保持原樣（回傳型別仍為 `ModSummary`）。

- [ ] **Step 5: Rewrite `apps/site/src/islands/filterMods.ts`**

```ts
import { byUpdatedDesc, type ModSummary } from '../lib/summary';

export const ALL = '';

export interface ModFilter {
  readonly loader: string;
  readonly version: string;
  readonly status: string;
}

export function filterMods(mods: readonly ModSummary[], filter: ModFilter): ModSummary[] {
  const { loader, version, status } = filter;
  return mods.filter(
    (m) =>
      (loader === ALL || m.loaders.some((l) => l === loader)) &&
      (version === ALL || m.mcVersions.includes(version)) &&
      (status === ALL || m.status === status),
  );
}

export const SORT_KEYS = ['name', 'updated', 'percent'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const byName = (a: ModSummary, b: ModSummary): number => a.name.localeCompare(b.name);

const COMPARATORS: Readonly<Record<SortKey, (a: ModSummary, b: ModSummary) => number>> = {
  name: byName,
  updated: byUpdatedDesc,
  percent: (a, b) => b.percent - a.percent || byName(a, b),
};

/** 回傳排序後的新陣列，不修改輸入 */
export function sortMods(mods: readonly ModSummary[], key: SortKey): ModSummary[] {
  return [...mods].sort(COMPARATORS[key]);
}
```

- [ ] **Step 6: Keep `ModsBrowser.tsx` compiling**

在 `apps/site/src/islands/ModsBrowser.tsx`：
- `import type { ModSummary } from '../lib/data';` 改為 `import type { ModSummary } from '../lib/summary';`
- `const shown = filterMods(mods, loader, version);` 改為 `const shown = filterMods(mods, { loader, version, status: ALL });`

在 `apps/site/src/islands/ModsBrowser.test.tsx`：刪除 `describe('filterMods', …)` 區塊與 `import { filterMods } from './filterMods';`，`ModSummary` 型別改從 `'../lib/summary'` 匯入。

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site`
Expected: 全部 PASS，typecheck 0 errors

- [ ] **Step 8: Commit**

```bash
git add apps/site/src/lib/summary.ts apps/site/src/lib/data.ts apps/site/src/islands/filterMods.ts apps/site/src/islands/filterMods.test.ts apps/site/src/islands/ModsBrowser.tsx apps/site/src/islands/ModsBrowser.test.tsx
git commit -m "refactor: move mod summary to client-safe module and add status filter and sorting"
```

---

### Task 2: 目錄 index 的 fetch 與驗證

**Files:**
- Modify: `apps/site/package.json`（加入 `zod` 相依）
- Create: `apps/site/src/islands/catalogIndex.ts`
- Create: `apps/site/src/islands/catalogIndex.test.ts`

**Interfaces:**
- Consumes: `ModSummary`（`lib/summary.ts`）、`LOADERS`、`TRANSLATION_STATUSES`（`@mlf/core/catalog`）
- Produces:
  - `CATALOG_INDEX_URL = '/api/v1/index.json'`
  - `modSummarySchema`（zod，`satisfies z.ZodType<ModSummary>`）
  - `class CatalogIndexError extends Error`
  - `fetchCatalogIndex(signal?: AbortSignal, fetchImpl?: typeof fetch): Promise<ModSummary[]>`

- [ ] **Step 1: Add zod to the site workspace**

Run: `npm install zod@^4.6.7 -w @mlf/site`
Expected: `apps/site/package.json` dependencies 出現 `"zod": "^4.6.7"`

- [ ] **Step 2: Write the failing test** — `apps/site/src/islands/catalogIndex.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { CATALOG_INDEX_URL, CatalogIndexError, fetchCatalogIndex } from './catalogIndex';

const summary: ModSummary = {
  modId: 'create', name: 'Create', nameZh: '機械動力', summary: 's', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 10, updatedAt: '2026-10-15',
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);
}

describe('fetchCatalogIndex', () => {
  it('returns validated mods', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [summary] });
    await expect(fetchCatalogIndex(undefined, f)).resolves.toEqual([summary]);
    expect(f).toHaveBeenCalledWith(CATALOG_INDEX_URL, expect.objectContaining({ signal: undefined }));
  });

  it('passes the abort signal through', async () => {
    const f = fakeFetch({ version: 1, generatedAt: 'x', mods: [] });
    const controller = new AbortController();
    await fetchCatalogIndex(controller.signal, f);
    expect(f).toHaveBeenCalledWith(CATALOG_INDEX_URL, { signal: controller.signal });
  });

  it('rejects non-2xx responses', async () => {
    await expect(fetchCatalogIndex(undefined, fakeFetch({}, 503))).rejects.toThrow(CatalogIndexError);
  });

  it('rejects an unknown API version', async () => {
    const f = fakeFetch({ version: 2, generatedAt: 'x', mods: [summary] });
    await expect(fetchCatalogIndex(undefined, f)).rejects.toThrow(CatalogIndexError);
  });

  it('rejects mods with missing or invalid fields', async () => {
    const { percent: _omit, ...broken } = summary;
    await expect(fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [broken] }))).rejects.toThrow(CatalogIndexError);
    await expect(
      fetchCatalogIndex(undefined, fakeFetch({ version: 1, generatedAt: 'x', mods: [{ ...summary, status: 'done' }] })),
    ).rejects.toThrow(CatalogIndexError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @mlf/site -- catalogIndex`
Expected: FAIL（`./catalogIndex` 不存在）

- [ ] **Step 4: Implement `apps/site/src/islands/catalogIndex.ts`**

```ts
import { z } from 'zod';
import { LOADERS, TRANSLATION_STATUSES } from '@mlf/core/catalog';
import type { ModSummary } from '../lib/summary';

export const CATALOG_INDEX_URL = '/api/v1/index.json';

export const modSummarySchema = z.object({
  modId: z.string().min(1),
  name: z.string().min(1),
  nameZh: z.string().nullable(),
  summary: z.string(),
  mcVersions: z.array(z.string()),
  loaders: z.array(z.enum(LOADERS)),
  status: z.enum(TRANSLATION_STATUSES),
  percent: z.number().min(0).max(100),
  total: z.number().int().min(0),
  updatedAt: z.string(),
}) satisfies z.ZodType<ModSummary>;

const indexSchema = z.object({
  version: z.literal(1),
  mods: z.array(modSummarySchema),
});

export class CatalogIndexError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogIndexError';
  }
}

/** 抓取並驗證完整目錄；HTTP 非 2xx 或格式不符時丟出 CatalogIndexError */
export async function fetchCatalogIndex(signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ModSummary[]> {
  const res = await fetchImpl(CATALOG_INDEX_URL, { signal });
  if (!res.ok) throw new CatalogIndexError(`HTTP ${res.status}`);
  const parsed = indexSchema.safeParse(await res.json());
  if (!parsed.success) throw new CatalogIndexError('Invalid catalog index', { cause: parsed.error });
  return parsed.data.mods;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mlf/site -- catalogIndex && npm run typecheck -w @mlf/site`
Expected: PASS，typecheck 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/site/package.json package-lock.json apps/site/src/islands/catalogIndex.ts apps/site/src/islands/catalogIndex.test.ts
git commit -m "feat: fetch and validate catalog index on the client"
```

---

### Task 3: `useCatalogIndex` hook

**Files:**
- Create: `apps/site/src/islands/useCatalogIndex.ts`
- Create: `apps/site/src/islands/useCatalogIndex.test.tsx`

**Interfaces:**
- Consumes: `fetchCatalogIndex(signal?)`（Task 2）、`ModSummary`
- Produces:
  - `type CatalogIndexLoader = (signal: AbortSignal) => Promise<readonly ModSummary[]>`
  - `type CatalogIndexState = { kind: 'loading' } | { kind: 'ready'; mods: readonly ModSummary[] } | { kind: 'error' }`
  - `useCatalogIndex(load?: CatalogIndexLoader): { state: CatalogIndexState; retry: () => void }`（`load` 預設 `fetchCatalogIndex`，必須是穩定參考）

- [ ] **Step 1: Write the failing test** — `apps/site/src/islands/useCatalogIndex.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ModSummary } from '../lib/summary';
import { useCatalogIndex } from './useCatalogIndex';

const mods: ModSummary[] = [{
  modId: 'create', name: 'Create', nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'reviewed', percent: 100, total: 1, updatedAt: '2026-10-15',
}];

afterEach(() => vi.restoreAllMocks());

describe('useCatalogIndex', () => {
  it('starts loading then becomes ready', async () => {
    const load = vi.fn(async () => mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
  });

  it('reports errors and logs them, then recovers on retry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'error' }));
    expect(error).toHaveBeenCalled();
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight request on unmount', () => {
    let seen: AbortSignal | undefined;
    const load = vi.fn((signal: AbortSignal) => {
      seen = signal;
      return new Promise<readonly ModSummary[]>(() => {});
    });
    const { unmount } = renderHook(() => useCatalogIndex(load));
    unmount();
    expect(seen?.aborted).toBe(true);
  });

  it('ignores a stale result after retry', async () => {
    let resolveFirst: (m: readonly ModSummary[]) => void = () => {};
    const load = vi
      .fn()
      .mockImplementationOnce(() => new Promise<readonly ModSummary[]>((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(mods);
    const { result } = renderHook(() => useCatalogIndex(load));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'ready', mods }));
    await act(async () => resolveFirst([]));
    expect(result.current.state).toEqual({ kind: 'ready', mods });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- useCatalogIndex`
Expected: FAIL（`./useCatalogIndex` 不存在）

- [ ] **Step 3: Implement `apps/site/src/islands/useCatalogIndex.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import type { ModSummary } from '../lib/summary';
import { fetchCatalogIndex } from './catalogIndex';

export type CatalogIndexLoader = (signal: AbortSignal) => Promise<readonly ModSummary[]>;

export type CatalogIndexState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly mods: readonly ModSummary[] }
  | { readonly kind: 'error' };

const LOADING: CatalogIndexState = { kind: 'loading' };

/** 載入完整目錄；load 必須是穩定參考（模組層級函式或 useCallback） */
export function useCatalogIndex(load: CatalogIndexLoader = fetchCatalogIndex): {
  readonly state: CatalogIndexState;
  readonly retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogIndexState>(LOADING);

  useEffect(() => {
    const controller = new AbortController();
    setState(LOADING);
    load(controller.signal).then(
      (mods) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', mods });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[ModsBrowser] 目錄載入失敗', err);
        setState({ kind: 'error' });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @mlf/site -- useCatalogIndex`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/islands/useCatalogIndex.ts apps/site/src/islands/useCatalogIndex.test.tsx
git commit -m "feat: add useCatalogIndex hook with abort and retry"
```

---

### Task 4: `useIncrementalList` hook

**Files:**
- Create: `apps/site/src/islands/useIncrementalList.ts`
- Create: `apps/site/src/islands/useIncrementalList.test.tsx`

**Interfaces:**
- Produces:
  - `PAGE_SIZE = 48`
  - `useIncrementalList<T>(items: readonly T[], resetKey: string, pageSize?: number): { visible: readonly T[]; hasMore: boolean; sentinelRef: RefObject<HTMLDivElement> }`
  - 呼叫端在清單後渲染 `{hasMore && <div ref={sentinelRef} aria-hidden="true" />}`

- [ ] **Step 1: Write the failing test** — `apps/site/src/islands/useIncrementalList.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useIncrementalList } from './useIncrementalList';

class MockObserver {
  static instances: MockObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    MockObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() {}
  takeRecords() { return []; }
  fire(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const live = () => MockObserver.instances.filter((o) => !o.disconnected);

function Harness({ items, resetKey }: { items: readonly number[]; resetKey: string }) {
  const { visible, hasMore, sentinelRef } = useIncrementalList(items, resetKey, 2);
  return (
    <div>
      <span data-testid="count">{visible.length}</span>
      {hasMore && <div ref={sentinelRef} data-testid="sentinel" />}
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

afterEach(() => {
  MockObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useIncrementalList', () => {
  it('reveals one more page each time the sentinel intersects', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    render(<Harness items={range(5)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    act(() => live()[0]!.fire(false));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('5');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    expect(live()).toHaveLength(0);
  });

  it('renders no sentinel and no observer when items fit in one page', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    render(<Harness items={range(2)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
    expect(MockObserver.instances).toHaveLength(0);
  });

  it('resets to the first page when resetKey changes', () => {
    vi.stubGlobal('IntersectionObserver', MockObserver);
    const { rerender } = render(<Harness items={range(5)} resetKey="a" />);
    act(() => live()[0]!.fire(true));
    expect(screen.getByTestId('count')).toHaveTextContent('4');
    rerender(<Harness items={range(5)} resetKey="b" />);
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('renders everything when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Harness items={range(5)} resetKey="k" />);
    expect(screen.getByTestId('count')).toHaveTextContent('5');
    expect(screen.queryByTestId('sentinel')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- useIncrementalList`
Expected: FAIL（`./useIncrementalList` 不存在）

- [ ] **Step 3: Implement `apps/site/src/islands/useIncrementalList.ts`**

```ts
import { type RefObject, useEffect, useRef, useState } from 'react';

export const PAGE_SIZE = 48;

/** 先顯示一批，哨兵進入視窗時再加一批；resetKey 改變時回到第一批。不支援 IntersectionObserver 時一次顯示全部 */
export function useIncrementalList<T>(
  items: readonly T[],
  resetKey: string,
  pageSize: number = PAGE_SIZE,
): { readonly visible: readonly T[]; readonly hasMore: boolean; readonly sentinelRef: RefObject<HTMLDivElement> } {
  const supported = typeof IntersectionObserver !== 'undefined';
  const [limit, setLimit] = useState(pageSize);
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setLimit(pageSize);
  }
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = supported && limit < items.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + pageSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pageSize, limit]);

  return { visible: supported ? items.slice(0, limit) : items, hasMore, sentinelRef };
}
```

（`limit` 放進依賴：每次加一批後重新 observe，若哨兵仍在視窗內，新 observer 的初始回呼會再加一批。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @mlf/site -- useIncrementalList && npm run typecheck -w @mlf/site`
Expected: PASS（4 tests），typecheck 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/islands/useIncrementalList.ts apps/site/src/islands/useIncrementalList.test.tsx
git commit -m "feat: add useIncrementalList hook for progressive rendering"
```

---

### Task 5: 組合 `ModsBrowser`、頁面、文案與快取標頭

**Files:**
- Modify: `apps/site/src/i18n/zh-TW.ts`（`mods` 區塊）
- Modify: `apps/site/src/islands/ModsBrowser.tsx`（重寫）
- Modify: `apps/site/src/islands/ModsBrowser.test.tsx`（重寫）
- Modify: `apps/site/src/pages/mods/index.astro`
- Modify: `apps/site/public/_headers`

**Interfaces:**
- Consumes: `filterMods`、`sortMods`、`SORT_KEYS`、`SortKey`、`ALL`（Task 1）、`INITIAL_COUNT`、`ModSummary`（Task 1）、`useCatalogIndex`（Task 3）、`useIncrementalList`（Task 4）
- Produces: `ModsBrowser` default export，props `{ initial: readonly ModSummary[]; total: number }`；清單 `<ul aria-label="模組清單">`

- [ ] **Step 1: Extend i18n** — 把 `apps/site/src/i18n/zh-TW.ts` 的 `mods` 區塊改為：

```ts
  mods: {
    title: '模組目錄',
    description: '所有已收錄繁體中文翻譯的 Minecraft 模組。',
    filterLoader: '載入器',
    filterVersion: 'Minecraft 版本',
    filterStatus: '翻譯狀態',
    sort: '排序',
    sortLabels: { name: '名稱', updated: '最近更新', percent: '完成度' },
    all: '全部',
    count: (n: number) => `共 ${n} 個模組`,
    none: '沒有符合條件的模組',
    listLabel: '模組清單',
    loading: '載入中…',
    loadFailed: '目錄載入失敗。',
    retry: '重試',
    useSearch: '改用搜尋',
    noscript: '需啟用 JavaScript 才能瀏覽完整目錄，以下僅列出部分模組。',
  },
```

- [ ] **Step 2: Write the failing test** — 以下列內容取代 `apps/site/src/islands/ModsBrowser.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModSummary } from '../lib/summary';
import ModsBrowser from './ModsBrowser';

const mod = (modId: string, over: Partial<ModSummary> = {}): ModSummary => ({
  modId, name: modId, nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-01', ...over,
});

const mods = [
  mod('alpha', { loaders: ['fabric'], status: 'reviewed', percent: 90 }),
  mod('beta', { mcVersions: ['1.21.1', '1.20.1'], percent: 100 }),
  mod('gamma', { mcVersions: ['1.12.2'], status: 'reviewed', percent: 100 }),
];

const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

function stubIndex(list: readonly ModSummary[]) {
  const f = vi.fn(async () => response({ version: 1, generatedAt: 'x', mods: list }));
  vi.stubGlobal('fetch', f);
  return f;
}

const names = () =>
  within(screen.getByRole('list', { name: '模組清單' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.font-semibold')?.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ModsBrowser', () => {
  it('shows the SSR slice with disabled controls while loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(names()).toEqual(['alpha']);
    expect(screen.getByText('共 3 個模組')).toBeInTheDocument();
    expect(screen.getByText('載入中…')).toBeInTheDocument();
    expect(screen.getByLabelText('翻譯狀態')).toBeDisabled();
    expect(screen.getByLabelText('排序')).toBeDisabled();
  });

  it('replaces the SSR slice with the full catalog once loaded', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(await screen.findByText('gamma')).toBeInTheDocument();
    expect(names()).toEqual(['alpha', 'beta', 'gamma']);
    expect(screen.getByLabelText('翻譯狀態')).toBeEnabled();
    expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
  });

  it('filters by status and sorts by percent', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    await userEvent.selectOptions(screen.getByLabelText('翻譯狀態'), 'reviewed');
    expect(names()).toEqual(['alpha', 'gamma']);
    await userEvent.selectOptions(screen.getByLabelText('排序'), 'percent');
    expect(names()).toEqual(['gamma', 'alpha']);
    expect(screen.getByText('共 2 個模組')).toBeInTheDocument();
  });

  it('shows count and empty state after filtering', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    await userEvent.selectOptions(screen.getByLabelText('載入器'), 'quilt');
    expect(screen.getByText('沒有符合條件的模組')).toBeInTheDocument();
  });

  it('handles an empty catalog', async () => {
    stubIndex([]);
    render(<ModsBrowser initial={[]} total={0} />);
    expect(await screen.findByText('沒有符合條件的模組')).toBeInTheDocument();
    expect(screen.getByText('共 0 個模組')).toBeInTheDocument();
  });

  it('lists versions newest first', async () => {
    stubIndex(mods);
    render(<ModsBrowser initial={[]} total={3} />);
    await screen.findByText('gamma');
    const options = Array.from((screen.getByLabelText('Minecraft 版本') as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(['', '1.21.1', '1.20.1', '1.12.2']);
  });

  it('keeps the SSR slice on failure and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({ version: 1, generatedAt: 'x', mods }));
    vi.stubGlobal('fetch', f);
    render(<ModsBrowser initial={mods.slice(0, 1)} total={3} />);
    expect(await screen.findByText('目錄載入失敗。')).toBeInTheDocument();
    expect(names()).toEqual(['alpha']);
    expect(screen.getByRole('link', { name: '改用搜尋' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByText('gamma')).toBeInTheDocument();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @mlf/site -- ModsBrowser`
Expected: FAIL（props `initial`／`total` 尚未支援、找不到「翻譯狀態」）

- [ ] **Step 4: Rewrite `apps/site/src/islands/ModsBrowser.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { LOADERS, TRANSLATION_STATUSES } from '@mlf/core/catalog';
import { t } from '../i18n/zh-TW';
import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { formatPercent, LOADER_LABELS, STATUS_LABELS } from '../lib/format';
import { ALL, filterMods, SORT_KEYS, type SortKey, sortMods } from './filterMods';
import { sortVersions } from './pickVersion';
import { useCatalogIndex } from './useCatalogIndex';
import { useIncrementalList } from './useIncrementalList';

function ModRow({ mod }: { readonly mod: ModSummary }) {
  return (
    <li>
      <a href={modUrl(mod.modId)} className="card flex flex-col gap-1 hover:shadow-md">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{mod.name}</span>
          <span className="text-xs text-slate-500">{STATUS_LABELS[mod.status]}</span>
        </div>
        {mod.nameZh && <span className="text-sm text-slate-500">{mod.nameZh}</span>}
        <span className="text-xs text-slate-500">
          {mod.mcVersions.join(' / ')} · {mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')} · {formatPercent(mod.percent)}
        </span>
      </a>
    </li>
  );
}

interface Option {
  readonly value: string;
  readonly label: string;
}

function SelectField(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-slate-500">{props.label}</span>
      <select className="input" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const withAll = (options: readonly Option[]): Option[] => [{ value: ALL, label: t.mods.all }, ...options];
const LOADER_OPTIONS = withAll(LOADERS.map((l) => ({ value: l, label: LOADER_LABELS[l] })));
const STATUS_OPTIONS = withAll(TRANSLATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })));
const SORT_OPTIONS: Option[] = SORT_KEYS.map((k) => ({ value: k, label: t.mods.sortLabels[k] }));

function LoadState({ kind, onRetry }: { readonly kind: 'loading' | 'error'; readonly onRetry: () => void }) {
  if (kind === 'loading') return <span role="status" className="text-slate-500">{t.mods.loading}</span>;
  return (
    <span role="alert" className="flex items-center gap-2 text-red-600">
      {t.mods.loadFailed}
      <button type="button" className="underline" onClick={onRetry}>{t.mods.retry}</button>
      <a href="/" className="underline">{t.mods.useSearch}</a>
    </span>
  );
}

export default function ModsBrowser({ initial, total }: { readonly initial: readonly ModSummary[]; readonly total: number }) {
  const { state, retry } = useCatalogIndex();
  const [loader, setLoader] = useState(ALL);
  const [version, setVersion] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('name');
  const ready = state.kind === 'ready';
  const all = ready ? state.mods : initial;
  const versionOptions = useMemo(() => withAll(sortVersions(all.flatMap((m) => m.mcVersions)).map((v) => ({ value: v, label: v }))), [all]);
  const shown = useMemo(
    () => (ready ? sortMods(filterMods(all, { loader, version, status }), sort) : all),
    [ready, all, loader, version, status, sort],
  );
  const { visible, hasMore, sentinelRef } = useIncrementalList(shown, `${loader}|${version}|${status}|${sort}|${state.kind}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
        <SelectField label={t.mods.filterLoader} value={loader} options={LOADER_OPTIONS} disabled={!ready} onChange={setLoader} />
        <SelectField label={t.mods.filterVersion} value={version} options={versionOptions} disabled={!ready} onChange={setVersion} />
        <SelectField label={t.mods.filterStatus} value={status} options={STATUS_OPTIONS} disabled={!ready} onChange={setStatus} />
        <SelectField label={t.mods.sort} value={sort} options={SORT_OPTIONS} disabled={!ready} onChange={(v) => setSort(v as SortKey)} />
        {state.kind !== 'ready' && <LoadState kind={state.kind} onRetry={retry} />}
        <span className="ml-auto text-slate-500">{t.mods.count(ready ? shown.length : total)}</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t.mods.none}</p>
      ) : (
        <ul aria-label={t.mods.listLabel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => <ModRow key={m.modId} mod={m} />)}
        </ul>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </div>
  );
}
```

注意：`shown.length === 0` 在 loading 且 `initial` 為空時也會顯示「沒有符合條件的模組」——只會發生在目錄真的為空時（SSR 傳入 0 筆代表 total 為 0），可接受。

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mlf/site -- ModsBrowser`
Expected: PASS（7 tests）

- [ ] **Step 6: Update `apps/site/src/pages/mods/index.astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ModsBrowser from '../../islands/ModsBrowser';
import { sortMods } from '../../islands/filterMods';
import { getCatalog, toSummary } from '../../lib/data';
import { INITIAL_COUNT } from '../../lib/summary';
import { SITE_SHORT_NAME } from '../../lib/config';
import { t } from '../../i18n/zh-TW';

const all = sortMods((await getCatalog()).map(toSummary), 'name');
const initial = all.slice(0, INITIAL_COUNT);
---

<BaseLayout title={`${t.mods.title} | ${SITE_SHORT_NAME}`} description={t.mods.description}>
  <h1 class="mb-4 text-2xl font-bold">{t.mods.title}</h1>
  <noscript><p class="mb-4 text-sm text-slate-500">{t.mods.noscript}</p></noscript>
  <ModsBrowser client:load initial={initial} total={all.length} />
</BaseLayout>
```

- [ ] **Step 7: Add cache header** — 在 `apps/site/public/_headers` 檔尾加上：

```
/api/v1/*
  Cache-Control: public, max-age=300
```

- [ ] **Step 8: Full verification**

Run: `npm test && npm run lint && npm run typecheck -w @mlf/site && npm run build`
Expected: 全部 PASS；build 成功。再執行：

Run: `grep -o 'modId' apps/site/dist/mods/index.html | wc -l`
Expected: 數字 ≤ 24（Astro 把 props 序列化在 `props` 屬性中，每筆摘要出現一次 `modId`；目前資料 18 筆，故為 18）

- [ ] **Step 9: Commit**

```bash
git add apps/site/src/i18n/zh-TW.ts apps/site/src/islands/ModsBrowser.tsx apps/site/src/islands/ModsBrowser.test.tsx apps/site/src/pages/mods/index.astro apps/site/public/_headers
git commit -m "feat: load full mod catalog asynchronously with status filter and sorting"
```

---

### Task 6: E2E 驗證

**Files:**
- Modify: `e2e/site.spec.ts`

**Interfaces:**
- Consumes: `/mods/` 頁面（Task 5）、既有 helper `gotoHydrated(page, url)`；資料：`create` 是唯一 `reviewed` 模組，`examplelegacy`（Example Legacy Mod）的 `updatedAt` 最舊（2026-10-13）

- [ ] **Step 1: Write the test** — 在 `e2e/site.spec.ts` 的 `test.describe('search', …)` 之後加入：

```ts
test.describe('mods catalog', () => {
  test('filters by status and sorts by recent update', async ({ page }) => {
    await gotoHydrated(page, '/mods/');
    const status = page.getByLabel('翻譯狀態');
    await expect(status).toBeEnabled();
    const items = page.getByRole('list', { name: '模組清單' }).getByRole('listitem');

    await status.selectOption('reviewed');
    await expect(page.getByText('共 1 個模組')).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Create');

    await status.selectOption('');
    await page.getByLabel('排序').selectOption('updated');
    await expect(items.last()).toContainText('Example Legacy Mod');
  });
});
```

- [ ] **Step 2: Run E2E**

Run: `npm run build && npm run test:e2e`
Expected: 全部 PASS（含新的 `mods catalog` 測試）

- [ ] **Step 3: Commit**

```bash
git add e2e/site.spec.ts
git commit -m "test: cover mods catalog status filter and sorting end to end"
```
