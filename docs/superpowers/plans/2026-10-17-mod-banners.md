# 模組橫幅、下載量與目錄顯示切換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 模組卡片與模組頁加上 Modrinth 橫幅與下載量，翻譯進度改成小標籤／一行文字加細線，模組目錄可在卡片與條列之間切換。

**Architecture:** 橫幅與下載量都在建置前由 `scripts/` 的工具從 Modrinth 抓下來存進 repo（橫幅 → `apps/site/public/mod-banners/`，下載量 → `data/modrinth-stats.json`），網站建置時讀取並放進 `ModSummary`；純邏輯（挑橫幅、下載量資料檔的驗證與合併）放在 `packages/core`。網站端新增進度標籤、細進度線、橫幅、條列列與切換元件，取代現有的 `ProgressBar`。

**Tech Stack:** Astro 6 + React 18 island、Tailwind 4、Zod、Vitest + Testing Library、`sharp`（WebP 轉檔）、tsx 腳本、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-17-mod-banners-design.md`

## Global Constraints

- 網頁在瀏覽時不得連到 Modrinth；橫幅只能是本站路徑 `/mod-banners/<modId>.webp`，CSP 不放寬。
- 抓圖只接受 `https://cdn.modrinth.com/` 開頭的網址，原圖大小上限比照圖示工具（2 MiB → 橫幅放寬為 8 MiB）。
- 橫幅挑選順序：`featured` 為 true 的展示圖 → 依 `ordering` 最小的展示圖 → 沒有橫幅；停用清單內的模組一律沒有橫幅。
- 網站文字用玩家用語（見 `apps/site/src/i18n/zh-TW.ts` 既有寫法）；新文字全部放在 i18n 檔，元件內不寫死中文。
- 完整翻譯的判斷是「已翻譯條數 = 總條數且總條數 > 0」，不可用四捨五入後的百分比判斷；未完整時顯示的百分比最多 99%。
- 下載量寫法：< 10,000 顯示完整數字（`9,999`）；< 1 億顯示「`N` 萬」（N 取整數、千分位，例 `9,840 萬`）；≥ 1 億顯示「`X.Y` 億」（一位小數、去掉 `.0`，例 `3.1 億`、`1 億`）。
- 沒有 Modrinth 下載量的模組（只上架 CurseForge 或資料檔沒有項目）不顯示下載量，不顯示 0。
- 顯示方式預設為卡片；記住的值存在 `localStorage` 的 `mlf:mods-view`（`'card' | 'list'`），讀寫失敗時退回卡片且不報錯。
- 下載量抓取失敗只警告、保留舊數字，工具結束碼為 0；只有寫檔或資料格式錯誤才非 0。
- 進度標籤分級（沿用既有色彩變數）：完整 → `primary`（`bg-primary-soft text-link`）；≥ 70% → `info`；< 70% → `warn`。
- commit 訊息用英文 Conventional Commits，不加任何 session 或 attribution 行。

## Review Focus

1. 已翻譯 1339 / 1340 條（四捨五入成 100%）的模組：必須顯示「翻譯 99%」，不能顯示「✓ 完整翻譯」。→ Task 4 的 `progressTag` 測試。
2. 總條數為 0 的模組：顯示「翻譯 0%」，不是完整翻譯。→ Task 4。
3. 舊版 `/api/v1/index.json`（沒有 `banner`、`downloads`、`translated` 欄位）或被竄改成外部圖片網址：目錄仍可載入，外部網址被拒。→ Task 3 的 `catalogIndex` 測試。
4. `localStorage` 被停用或存了奇怪的值（例如 `"grid"`）：顯示卡片模式且不丟例外。→ Task 5 的 `useViewMode` 測試。
5. 依下載量排序時，沒有下載量的模組排在最後，並依名稱排序。→ Task 3 的 `sortMods` 測試。

---

### Task 1: 核心邏輯：橫幅挑選與下載量資料檔

**Files:**
- Modify: `packages/core/src/pipeline/modrinth.ts`（新增型別與 `pickBannerUrl`）
- Modify: `packages/core/src/pipeline/index.ts`（匯出）
- Create: `packages/core/src/catalog/modStats.ts`
- Modify: `packages/core/src/catalog/index.ts`（匯出）
- Test: `packages/core/src/pipeline/modrinth.test.ts`（若不存在則新增 `pickBanner.test.ts`）、`packages/core/src/catalog/modStats.test.ts`

**Interfaces:**
- Produces:
  - `interface ModrinthGalleryImage { readonly url: string; readonly featured: boolean; readonly ordering: number }`
  - `interface ModrinthProjectInfo { readonly downloads: number; readonly icon_url: string | null; readonly gallery: readonly ModrinthGalleryImage[] }`
  - `pickBannerUrl(gallery: readonly ModrinthGalleryImage[]): string | null`
  - `MODRINTH_CDN_PREFIX = 'https://cdn.modrinth.com/'`
  - `modStatsSchema`（Zod）與 `type ModStats = { readonly version: 1; readonly mods: Readonly<Record<string, { readonly downloads: number; readonly fetchedAt: string }>> }`
  - `checkModStats(raw: unknown, knownModIds: ReadonlySet<string>): readonly string[]`（回傳錯誤訊息，空陣列代表通過）
  - `mergeModStats(prev: ModStats, fetched: Readonly<Record<string, number>>, today: string): ModStats`（回傳新物件，不修改 `prev`）

- [ ] **Step 1: Write the failing tests**

```ts
describe('pickBannerUrl', () => {
  const img = (url: string, featured: boolean, ordering: number) => ({ url, featured, ordering });
  it('prefers the featured image', () => {
    expect(pickBannerUrl([img('https://cdn.modrinth.com/a.png', false, 0), img('https://cdn.modrinth.com/b.png', true, 5)])).toBe('https://cdn.modrinth.com/b.png');
  });
  it('falls back to the lowest ordering', () => {
    expect(pickBannerUrl([img('https://cdn.modrinth.com/a.png', false, 3), img('https://cdn.modrinth.com/b.png', false, 1)])).toBe('https://cdn.modrinth.com/b.png');
  });
  it('returns null for an empty gallery', () => expect(pickBannerUrl([])).toBeNull());
  it('skips images outside the Modrinth CDN', () => {
    expect(pickBannerUrl([img('https://evil.example/x.png', true, 0)])).toBeNull();
  });
});

describe('modStats', () => {
  const ok = { version: 1, mods: { create: { downloads: 98400000, fetchedAt: '2026-10-17' } } };
  it('accepts valid data for known mods', () => expect(checkModStats(ok, new Set(['create']))).toEqual([]));
  it('rejects unknown modIds', () => expect(checkModStats(ok, new Set(['jei']))[0]).toContain('create'));
  it('rejects negative or fractional downloads', () => {
    expect(checkModStats({ version: 1, mods: { create: { downloads: -1, fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
    expect(checkModStats({ version: 1, mods: { create: { downloads: 1.5, fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
  });
  it('merges new numbers and keeps mods that were not fetched', () => {
    const prev = { version: 1 as const, mods: { create: { downloads: 1, fetchedAt: '2026-10-10' }, jei: { downloads: 2, fetchedAt: '2026-10-10' } } };
    const next = mergeModStats(prev, { create: 5 }, '2026-10-17');
    expect(next.mods).toEqual({ create: { downloads: 5, fetchedAt: '2026-10-17' }, jei: { downloads: 2, fetchedAt: '2026-10-10' } });
    expect(prev.mods.create.downloads).toBe(1);
  });
  it('sorts mod keys so the file diff stays stable', () => {
    expect(Object.keys(mergeModStats({ version: 1, mods: {} }, { zeta: 1, alpha: 2 }, '2026-10-17').mods)).toEqual(['alpha', 'zeta']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/src/catalog/modStats.test.ts packages/core/src/pipeline`
Expected: FAIL（函式未定義）

- [ ] **Step 3: Implement** the interfaces above. `fetchedAt` 用 `YYYY-MM-DD` regex（同 `mod.json` 的 `updatedAt`）；`downloads` 為 `z.number().int().min(0)`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core` → 全部 PASS；`npm run typecheck -w @mlf/core` 無錯誤。

- [ ] **Step 5: Commit** — `feat: add banner selection and Modrinth stats schema`

---

### Task 2: 抓取工具、資料檢查與每週更新

**Files:**
- Create: `scripts/fetch-mod-stats.ts`、`scripts/fetch-mod-banners.ts`、`data/banners-disabled.json`（內容 `[]`）
- Modify: `package.json`（scripts：`"stats:fetch": "tsx scripts/fetch-mod-stats.ts"`、`"banners:fetch": "tsx scripts/fetch-mod-banners.ts"`）
- Modify: `scripts/validate-data.ts`（讀 `data/modrinth-stats.json`，檔案不存在視為通過；`data/banners-disabled.json` 必須是 modId 字串陣列且都是已收錄模組）
- Modify: `.github/workflows/track-versions.yml`（在「Track versions」之後、「Validate translation data」之前加 `- name: Refresh Modrinth downloads` / `run: npm run stats:fetch`）
- Modify: `docs/development.md`（「資料維護工具」區塊加兩行指令與一句說明：下載量每週自動更新、橫幅手動執行；停用清單的用法）

**Interfaces:**
- Consumes: Task 1 的 `ModrinthProjectInfo`、`pickBannerUrl`、`MODRINTH_CDN_PREFIX`、`modStatsSchema`、`mergeModStats`、`checkModStats`；`scripts/lib/modrinth.ts` 的 `API`、`getJson`、`MODS_DIR`、`USER_AGENT`、`toJson`；`modrinthSlug`。
- Produces: `data/modrinth-stats.json`（`ModStats` 格式）、`apps/site/public/mod-banners/<modId>.webp`。

- [ ] **Step 1: `fetch-mod-stats.ts`** — 逐一讀 `data/mods/*/mod.json`，有 `links.modrinth` 的呼叫 `GET ${API}/project/<slug>` 取 `downloads`；單一模組失敗印 `console.warn` 後跳過；最後用 `mergeModStats` 合併舊檔並以 `toJson` 寫回 `data/modrinth-stats.json`。只在寫檔失敗時 `process.exitCode = 1`。

- [ ] **Step 2: `fetch-mod-banners.ts`** — 結構比照 `scripts/fetch-mod-icons.ts`（`--force`、`--only` 參數、`skip: exists` 等輸出）。用 `pickBannerUrl(project.gallery)` 挑圖；停用清單內的模組跳過並刪除已存在的檔案（輸出 `removed: disabled`）。轉檔：`sharp(bytes, { animated: false }).resize(960, 320, { fit: 'cover', position: 'attention' }).webp({ quality: 78 })`，輸出到 `apps/site/public/mod-banners/<modId>.webp`。原圖超過 8 MiB 丟錯。

- [ ] **Step 3: 資料檢查** — `validate-data.ts` 加上 stats 與停用清單檢查，錯誤以既有格式輸出並計入錯誤數。

Run: `npm run validate:data`
Expected: `0 個錯誤`（stats 檔尚不存在時也通過）

- [ ] **Step 4: 實際抓取一次**（需要能連 Modrinth；本機連不到時在 PR 合併前請維護者執行，或於 Actions 手動觸發）

Run: `npm run stats:fetch && npm run banners:fetch && npm run validate:data`
Expected: `data/modrinth-stats.json` 有各模組的下載量；`apps/site/public/mod-banners/` 有 WebP；`0 個錯誤`

- [ ] **Step 5: Commit** — `feat: fetch Modrinth banners and download counts`（抓到的資料另一個 commit：`chore(data): add Modrinth banners and download counts`）

---

### Task 3: 目錄資料：ModSummary 帶上橫幅、下載量與已翻譯條數

**Files:**
- Create: `apps/site/src/lib/modBanner.ts`
- Modify: `apps/site/src/lib/summary.ts`、`apps/site/src/lib/data.ts`、`apps/site/src/islands/catalogIndex.ts`、`apps/site/src/islands/filterMods.ts`、`apps/site/src/i18n/zh-TW.ts`
- Modify（補欄位）：所有建立 `ModSummary` 的測試檔（`ModCard.test.tsx`、`siteData.test.ts`、`modPayload.test.ts` 等，以 `npm run typecheck -w @mlf/site` 找出）
- Test: `apps/site/src/islands/catalogIndex.test.ts`、`apps/site/src/islands/filterMods.test.ts`、`apps/site/src/lib/modBanner.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `modStatsSchema`。
- Produces:
  - `ModSummary` 新增 `readonly translated: number`、`readonly banner: string | null`、`readonly downloads: number | null`
  - `MOD_BANNER_PATTERN = /^\/mod-banners\/[a-z0-9_.-]+\.webp$/`、`modBannerUrl(modId: string, available: ReadonlySet<string>): string | null`（`lib/modBanner.ts`，不可匯入 node 模組）
  - `data.ts`：`modBanner(modId: string): string | null`、`modDownloads(modId: string): number | null`（讀 `DATA_DIR/modrinth-stats.json`，不存在時全部為 null；格式錯誤時建置失敗）
  - `SORT_KEYS = ['name', 'updated', 'percent', 'downloads']`；`t.mods.sortLabels.downloads = '下載量'`

- [ ] **Step 1: Write the failing tests**

```ts
// catalogIndex.test.ts
it('defaults banner, downloads and translated for an older index', async () => {
  // 回傳一筆不含 banner/downloads/translated 的 summary
  expect(mods[0]).toMatchObject({ banner: null, downloads: null, translated: 0 });
});
it('rejects a banner outside this site', async () => {
  // banner: 'https://evil.example/x.webp' → fetchCatalogIndex rejects with CatalogIndexError
});

// filterMods.test.ts
it('sorts by downloads, mods without downloads last by name', () => {
  const sorted = sortMods([m('b', null), m('a', null), m('c', 10), m('d', 500)], 'downloads');
  expect(sorted.map((x) => x.modId)).toEqual(['d', 'c', 'a', 'b']);
});

// modBanner.test.ts
it('returns a local URL only when the banner exists', () => {
  expect(modBannerUrl('create', new Set(['create']))).toBe('/mod-banners/create.webp');
  expect(modBannerUrl('jei', new Set(['create']))).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test -w @mlf/site`，新測試 FAIL。

- [ ] **Step 3: Implement** — 型別與 schema 依上方 Interfaces；`catalogIndex` 的 `banner` 以 `MOD_BANNER_PATTERN` 驗證並 `.nullable().default(null)`，`downloads` 為 `z.number().int().min(0).nullable().default(null)`，`translated` 為 `z.number().int().min(0).default(0)`；`toSummary` 填入 `m.stats.translated`、`modBanner`、`modDownloads`。

- [ ] **Step 4: Verify** — `npm test -w @mlf/site` 全部 PASS；`npm run typecheck -w @mlf/site` 無錯誤。

- [ ] **Step 5: Commit** — `feat: add banners, downloads and translated count to mod summaries`

---

### Task 4: 進度標籤、細進度線與下載量格式

**Files:**
- Create: `apps/site/src/lib/progress.ts`、`apps/site/src/components/TranslationTag.tsx`、`apps/site/src/components/ProgressLine.tsx`
- Modify: `apps/site/src/lib/format.ts`（新增 `formatDownloads`）、`apps/site/src/i18n/zh-TW.ts`
- Modify: `apps/site/src/components/GuideProgress.tsx`、`apps/site/src/pages/modpacks/[modpackId].astro`（改用 `ProgressLine`）
- Delete: `apps/site/src/components/ProgressBar.tsx`（Task 6 改完模組頁後才刪；本 task 先保留給模組頁使用）
- Test: `apps/site/src/lib/progress.test.ts`、`apps/site/src/lib/format.test.ts`、`apps/site/src/components/TranslationTag.test.tsx`、`apps/site/src/components/ProgressLine.test.tsx`、既有 `GuideProgress.test.tsx`（更新斷言）

**Interfaces:**
- Produces:
  - `type ProgressTier = 'complete' | 'most' | 'low'`；`progressTier(translated: number, total: number, percent: number): ProgressTier`（complete：`total > 0 && translated >= total`；most：`percent >= 70`；其餘 low）
  - `progressTagText(translated: number, total: number, percent: number): string` → complete 時 `t.common.complete`（`'✓ 完整翻譯'`），否則 `t.common.translatedPercent(Math.min(99, percent))`（`` `翻譯 ${p}%` ``）
  - `formatDownloads(n: number): string`（規則見 Global Constraints）
  - `downloadsLabel(n: number): string`（`format.ts`）：`formatDownloads` 結果以「萬／億」結尾時直接接「次下載」，否則中間加空白，前面加 `⬇ `；例 `⬇ 9,840 萬次下載`、`⬇ 9,999 次下載`
  - `<TranslationTag translated total percent className? />`：小標籤，依 tier 套 `bg-primary-soft text-link` / `bg-info-soft text-info` / `bg-warn-soft text-warn`
  - `<ProgressLine translated total percent detail label />`：一行文字（標籤文字 + `· ${detail}`）＋ 3px 細線（`role="progressbar"`、`aria-valuenow={percent}`、`aria-label={label}`）
  - i18n：`t.common.complete`、`t.common.translatedPercent(p)`、`t.common.guidePercent(p)`（`` `手冊 ${p}%` ``）；`t.modPage.progress` 改為 `` `已翻譯 ${done} / ${total} 條` ``（不變）、`t.modPage.guideProgress` 改為 `` `${done} / ${total} 段` ``

- [ ] **Step 1: Write the failing tests**

```ts
// progress.test.ts
it('is complete only when every entry is translated', () => {
  expect(progressTagText(1340, 1340, 100)).toBe('✓ 完整翻譯');
  expect(progressTagText(1339, 1340, 100)).toBe('翻譯 99%');
  expect(progressTagText(0, 0, 0)).toBe('翻譯 0%');
  expect(progressTier(0, 0, 0)).toBe('low');
});
it('splits tiers at 70%', () => {
  expect(progressTier(70, 100, 70)).toBe('most');
  expect(progressTier(69, 100, 69)).toBe('low');
});

// format.test.ts
it.each([
  [0, '0'], [9999, '9,999'], [10000, '1 萬'], [98_400_000, '9,840 萬'], [99_999_999, '9,999 萬'],
  [100_000_000, '1 億'], [310_000_000, '3.1 億'], [1_250_000_000, '12.5 億'],
])('formatDownloads(%i) → %s', (n, text) => expect(formatDownloads(n)).toBe(text));
it('labels download counts', () => {
  expect(downloadsLabel(98_400_000)).toBe('⬇ 9,840 萬次下載');
  expect(downloadsLabel(9999)).toBe('⬇ 9,999 次下載');
});

// ProgressLine.test.tsx
it('shows one line of text and an accessible thin bar', () => {
  render(<ProgressLine translated={1234} total={1340} percent={92} detail="已翻譯 1,234 / 1,340 條" label="翻譯完成度" />);
  expect(screen.getByText('翻譯 92%')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: '翻譯完成度' })).toHaveAttribute('aria-valuenow', '92');
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test -w @mlf/site`

- [ ] **Step 3: Implement** — 元件與函式依 Interfaces；`GuideProgress` 改用 `ProgressLine`（標籤文字用 `t.common.guidePercent`，完整時同樣顯示 `✓ 完整翻譯`），整合包頁的 KubeJS 與任務進度改用 `ProgressLine`。

- [ ] **Step 4: Verify** — `npm test -w @mlf/site`、`npm run typecheck -w @mlf/site` 全部通過。

- [ ] **Step 5: Commit** — `feat: replace progress bars with tags and thin progress lines`

---

### Task 5: 模組目錄：橫幅卡片、條列與切換

**Files:**
- Create: `apps/site/src/components/ModBanner.tsx`、`apps/site/src/components/ModRow.tsx`、`apps/site/src/islands/ViewToggle.tsx`、`apps/site/src/islands/useViewMode.ts`
- Modify: `apps/site/src/components/ModCard.tsx`、`apps/site/src/islands/ModsBrowser.tsx`、`apps/site/src/i18n/zh-TW.ts`、`apps/site/src/styles/`（沒有橫幅時的花紋 class，例如 `.banner-fallback`）
- Test: `ModCard.test.tsx`（更新）、`apps/site/src/components/ModRow.test.tsx`、`apps/site/src/islands/useViewMode.test.ts`、`apps/site/src/islands/ModsBrowser.test.tsx`（若存在則更新，否則新增）

**Interfaces:**
- Consumes: Task 3 的 `ModSummary`（`banner`、`downloads`、`translated`）；Task 4 的 `TranslationTag`、`downloadsLabel`。
- Produces:
  - `<ModBanner src name fallback="pattern" | "none" className? />`：有 `src` 時 `<img alt="" loading="lazy" decoding="async">` 以 `object-cover` 填滿；沒有時 `fallback="pattern"` 輸出花紋區塊，`"none"` 輸出 `null`
  - `type ViewMode = 'card' | 'list'`；`VIEW_STORAGE_KEY = 'mlf:mods-view'`；`useViewMode(storage?: Storage | null): readonly [ViewMode, (mode: ViewMode) => void]`
  - `<ViewToggle mode onChange />`：兩個按鈕（`aria-pressed`），文字 `t.mods.view.card`（`卡片`）、`t.mods.view.list`（`條列`），群組標籤 `t.mods.view.label`（`顯示方式`）
  - `<ModRow mod />`：條列的一列

- [ ] **Step 1: Write the failing tests**

```ts
// ModCard.test.tsx
it('shows the translation tag on the banner and the download count', () => {
  render(<ModCard mod={{ ...mod(false), banner: '/mod-banners/demo.webp', downloads: 98_400_000, translated: 1, total: 2, percent: 50 }} />);
  expect(screen.getByText('翻譯 50%')).toBeInTheDocument();
  expect(screen.getByText('⬇ 9,840 萬次下載')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
it('hides the download line when there is no Modrinth count', () => {
  render(<ModCard mod={{ ...mod(false), downloads: null }} />);
  expect(screen.queryByText(/次下載/)).not.toBeInTheDocument();
});

// useViewMode.test.ts
it('defaults to card and ignores unknown or unreadable values', () => {
  // storage.getItem 回傳 'grid' → 'card'；getItem 丟例外 → 'card'；storage 為 null → 'card'
});
it('remembers the chosen mode', () => {
  // setMode('list') 後 storage.getItem(VIEW_STORAGE_KEY) === 'list'；setItem 丟例外時狀態仍切換
});

// ModRow.test.tsx
it('shows icon, names, summary, tag and downloads without a banner', () => {
  // 斷言 '✓ 完整翻譯'（translated === total）與下載量文字存在，且沒有 img[src^="/mod-banners/"]
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npm test -w @mlf/site`

- [ ] **Step 3: Implement**
  - `ModCard`：上方 `ModBanner fallback="pattern"`（固定高度，讓所有卡片一致），`TranslationTag` 絕對定位在橫幅右上角；圖示疊在橫幅左下；名稱、中文名、`StatusBadge`（改小字樣式）、簡介、下載量一行、版本與載入器一行；移除 `ProgressBar`。
  - `ModRow`：設計文件「條列模式」的排列，右側 `TranslationTag` 與下載量。
  - `ModsBrowser`：篩選列加 `ViewToggle`（hydrate 後才顯示，與現有 `hydrated` 判斷一致）；`card` 用現有 grid，`list` 用單欄 `ModRow` 清單。
  - `useViewMode`：初始值一律 `'card'`（與伺服器輸出一致，避免 hydration 不符），掛載後讀 storage 再切換。

- [ ] **Step 4: Verify** — `npm test -w @mlf/site`、`npm run typecheck -w @mlf/site`；`PUBLIC_SUGGEST_ENABLED=true npm run build` 後 `npm run test:e2e` 全部通過（e2e 中斷言進度條的測試依新文字更新）。

- [ ] **Step 5: Commit** — `feat: add banner cards, list view and view toggle to the mod catalog`

---

### Task 6: 模組頁：橫幅、進度一行文字、下載量

**Files:**
- Modify: `apps/site/src/pages/mods/[modId].astro`、`apps/site/src/i18n/zh-TW.ts`
- Delete: `apps/site/src/components/ProgressBar.tsx`（確認已無引用）
- Test: `e2e/site.spec.ts`（模組頁斷言）

**Interfaces:**
- Consumes: Task 3 的 `modBanner`、`modDownloads`；Task 4 的 `ProgressLine`、`formatDownloads`；Task 5 的 `ModBanner`。
- Produces: i18n `t.modPage.downloads = 'Modrinth 下載量'`；值用 `formatDownloads(n)` 加上「次」（萬／億結尾不加空白，例 `9,840 萬次`、`9,999 次`）。

- [ ] **Step 1: Write the failing e2e assertions** — 在既有模組頁測試加上：下載區塊出現 `翻譯 N%` 或 `✓ 完整翻譯` 文字、`role="progressbar"` 仍存在且有 `aria-valuenow`；有下載量的測試模組在資訊欄出現「Modrinth 下載量」。

- [ ] **Step 2: Run** — `PUBLIC_SUGGEST_ENABLED=true npm run build && npm run test:e2e`，新斷言 FAIL。

- [ ] **Step 3: Implement**
  - 頁首最上方 `ModBanner fallback="none"`（有橫幅才顯示，`loading="eager"` 因為在首屏）；有橫幅時圖示疊在橫幅左下，沒有時版面維持現狀。
  - 下載區塊：`ProgressLine`（`detail` = `t.modPage.progress(translated, total)`）＋手冊 `GuideProgress`。
  - 資訊欄 `dl` 在「作者」後加入「Modrinth 下載量」（`downloads === null` 時整行不輸出）。
  - 刪除 `ProgressBar.tsx`。

- [ ] **Step 4: Verify** — `npm test -w @mlf/site`、`npm run typecheck -w @mlf/site`、`npm run lint`、`npm run build && npm run check:dist`、`npm run test:e2e` 全部通過。

- [ ] **Step 5: Commit** — `feat: show banner, download count and compact progress on mod pages`
