# 繁中模組翻譯站 第一階段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有翻譯工具重組為 monorepo，建立以模組目錄、搜尋、下載為主的 Astro 靜態翻譯站，並保留翻譯工具於 `/translate`。

**Architecture:** `packages/core` 為共用純 TS 函式庫（既有 core + 新 catalog）；`data/mods/*` 為 Git 資料庫；`apps/site` 為 Astro 靜態站，建置時以 Node fs 讀取 data，產生頁面、靜態 API 與 Pagefind 索引；互動以 React islands 實作。

**Tech Stack:** npm workspaces、TypeScript strict、Astro 7 + @astrojs/react + @astrojs/sitemap、React 18、Zustand、JSZip、zod、Pagefind、Tailwind v4、Vitest、Playwright、tsx。

**Spec:** `docs/superpowers/specs/2026-10-15-translation-site-phase1-design.md`

## Global Constraints

- 介面字串集中於各 app 的 i18n 檔；資料格式與欄位規則以 spec §3.1 表格為準。
- 所有資料型別欄位 `readonly`，更新回傳新物件。
- `packages/core` 不得 import React、DOM、Astro。
- 外部連結 `rel="noopener noreferrer"`；不使用 `set:html` / `dangerouslySetInnerHTML`。
- localStorage 讀寫必須 try/catch。
- 檔案 ≤ 400 行；函式 ≤ 50 行；`packages/core` 覆蓋率 ≥ 80%。
- 不 push、不部署（使用者未授權對外操作）。

## Review Focus

1. 合併包所選模組沒有共同 MC 版本 → 使用 `DEFAULT_MC_VERSION` 並顯示提示（Task 6 測試）。
2. 購物車 localStorage 內有已不存在的 modId 或格式錯誤的值 → 不崩潰、顯示「已下架」（Task 6 測試）。
3. `zh_tw.json` 含 `en_us.json` 沒有的 key → validate 失敗；建置也失敗（Task 2、3 測試）。
4. 搜尋中文名／別名／modId 都要命中（Task 5 測試以 searchIndex 函式驗證）。
5. 舊 `.lang` 格式模組下載後檔名為 `zh_TW.lang`（Task 6 測試）。

---

### Task 1: 重組為 npm workspaces monorepo

**Files:**
- Move: `src/core/**` → `packages/core/src/**`；`src/types.ts` → `packages/core/src/types.ts`；`src/test/makeJar.ts` → `packages/core/src/test/makeJar.ts`
- Move: `src/store`, `src/ui`, `src/i18n`, `src/App*.tsx`, `src/test/setup.ts`, `src/index.css`, `src/main.tsx` → `apps/translator-legacy` 暫存，Task 7 併入 site
- Create: `packages/core/package.json`（name `@mlf/core`，exports `./src/index.ts` 與子路徑）、`packages/core/tsconfig.json`、`packages/core/vitest.config.ts`、`packages/core/src/index.ts`
- Modify: 根 `package.json`（workspaces、scripts），根 `tsconfig.base.json`

**Interfaces:**
- Produces: `@mlf/core` 匯出 `types`、`jar`、`lang`、`validate`、`merge`、`export` 全部公開 API（子路徑 `@mlf/core/jar` 等亦可）。

- [ ] 搬移檔案（`git mv`）、修正相對 import。
- [ ] `npm test -w @mlf/core` → 既有 core 測試 59 個全部通過。
- [ ] commit `refactor: move core into @mlf/core workspace package`。

### Task 2: Catalog schema 與轉換（`packages/core/src/catalog`）

**Files:** `schema.ts`, `toProject.ts`, `validateMod.ts`, `index.ts`, `catalog.test.ts`；新增相依 `zod`。

**Interfaces:**
- Produces:
  - `catalogModSchema`（zod，spec §3.1 每條規則）與 `type CatalogMod = z.infer<...>`
  - `catalogToProject(meta: CatalogMod, en: Record<string,string>, zh: Record<string,string>): ModProject`
  - `interface ModIssue { level: 'error'|'warning'; file: string; key?: string; message: string }`
  - `validateModData(dirName: string, metaRaw: unknown, en: unknown, zh: unknown): ModIssue[]`

測試：合法 mod.json 通過；modId 不合法、links 非 https、mcVersions 不在 PACK_FORMATS、summary 過長、status 非列舉 → 失敗；資料夾名 ≠ modId → error；zh 含多餘 key → error；zh 值非字串 → error；格式碼不一致 → warning；`catalogToProject` 依 en 順序、缺譯為 untranslated、format 帶入。

- [ ] 測試 → 失敗 → 實作 → 通過 → commit `feat: add catalog schema, validation and project conversion`。

### Task 3: 資料目錄、示範資料、validate-data 腳本

**Files:** `data/LICENSE`、`data/README.md`、`data/mods/{create,jei,examplelegacy}/{mod.json,en_us.json,zh_tw.json}`、`scripts/loadData.ts`、`scripts/validate-data.ts`、`scripts/validate-data.test.ts`

**Interfaces:**
- Produces:
  - `interface LoadedMod { meta: CatalogMod; en: Record<string,string>; zh: Record<string,string> }`
  - `loadAllMods(dataDir: string): Promise<{ mods: LoadedMod[]; issues: ModIssue[] }>`（讀每個資料夾，呼叫 `validateModData`；有 error 的模組不放入 mods）
  - CLI：`npm run validate:data` → 有 error exit 1；warning 以 `::warning file=...::` 輸出。

測試（暫存資料夾）：三個示範模組無 error；缺 mod.json、JSON 損壞、多餘 key 各回報 error；格式碼不一致回報 warning。

- [ ] 測試 → 實作 → 通過 → commit `feat: add data directory, demo mods and validator`。

### Task 4: Astro 站骨架、版面、模組頁、靜態 API

**Files:** `apps/site/{package.json,astro.config.mjs,tsconfig.json}`、`src/lib/{config.ts,data.ts,format.ts}`、`src/layouts/BaseLayout.astro`、`src/components/{Header,Footer,ModCard,ProgressBar,StatusBadge}.astro`、`src/pages/{index,about,404}.astro`、`src/pages/mods/index.astro`、`src/pages/mods/[modId].astro`、`src/pages/api/v1/index.json.ts`、`src/pages/api/v1/mods/[modId].json.ts`、`src/i18n/zh-TW.ts`、`src/styles/global.css`、`public/{robots.txt,_headers,favicon.svg}`

**Interfaces:**
- Consumes: `loadAllMods`（data 載入在 site 的 `lib/data.ts` 以 `node:fs` 讀 `../../data`；有 error 時 throw 讓建置失敗）、`catalogToProject`、`projectStats`
- Produces:
  - `config.ts`：`SITE_URL`、`REPO`（預設 `OWNER/ModLangForge`，待使用者設定）、`githubEditUrl(modId)`、`githubIssueUrl(modId)`
  - `data.ts`：`getCatalog(): Promise<SiteMod[]>`，`SiteMod = LoadedMod & { stats: ProjectStats }`（快取）
  - API JSON 形狀依 spec §5

- [ ] 建置 `npm run build -w apps/site` 成功；dist 中有三個模組頁、`api/v1/index.json`、`api/v1/mods/create.json`、`sitemap-index.xml`。
- [ ] `lib/format.ts` 單元測試（日期、百分比、標題組合）。
- [ ] commit `feat: add astro site with catalog pages and static api`。

### Task 5: 搜尋（Pagefind）

**Files:** `apps/site/src/islands/SearchBox.tsx`、`src/islands/searchClient.ts`、`src/islands/SearchBox.test.tsx`；模組頁加 `data-pagefind-body`、`data-pagefind-meta`；build script 加 `pagefind --site dist`。

**Interfaces:**
- Produces: `interface SearchResult { modId; name; nameZh?; url; percent }`；`searchClient.search(q): Promise<SearchResult[]>`（Pagefind 載入失敗 throw `SearchUnavailableError`）

測試：輸入後顯示結果；無結果顯示 `/translate` 入口；不可用時顯示連到 `/mods/` 的連結。另以建置後 E2E 驗證「Create」「機械動力」「create」皆命中（Task 8）。

- [ ] commit `feat: add pagefind search island`。

### Task 6: 下載與合併包購物車

**Files:** `apps/site/src/islands/{DownloadButton.tsx,AddToPackButton.tsx,PackPage.tsx,CartBadge.tsx,cartStore.ts,downloadPack.ts,pickVersion.ts}` 與測試；`src/pages/pack.astro`

**Interfaces:**
- Produces:
  - `cartStore`（zustand）：`items: string[]`、`add/remove/clear/has`；localStorage key `mlf.cart.v1`，讀到非字串陣列時忽略
  - `pickCommonVersion(lists: readonly (readonly string[])[]): { version: string; fallback: boolean }`（依 PACK_FORMATS 順序取最新共同版本）
  - `fetchModData(modId): Promise<{ meta; en_us; zh_tw }>`、`downloadPack(modIds, mcVersion): Promise<void>`（單一模組檔名 `<modId>-zh_tw-<ver>.zip`，多個 `ModLangForge-zh_tw-<ver>.zip`）

測試：pickCommonVersion 有共同／無共同；cart 壞資料不崩潰、持久化；PackPage 顯示已下架項目可移除；downloadPack 產生正確檔名與 zip 內容（含 `.lang` → `zh_TW.lang`）。

- [ ] commit `feat: add download and merged pack cart`。

### Task 7: `/translate` 翻譯工具併入

**Files:** `apps/translator-legacy/*` → `apps/site/src/translator/*`；`src/pages/translate.astro`（`client:only="react"`）；新增 `translator/ContributionExport.ts`（產生貢獻 zip：`<modId>/mod.json`（預填，status `partial`）＋`en_us.json`＋`zh_tw.json`）；完成原計畫剩餘的 TranslationTable、FilterBar、ExportDialog（依舊 plan Task 9–10 規格）。

測試：搬移後既有 store/ui 測試全通過；filterEntries；TranslationTable 編輯；ExportDialog；ContributionExport 產生的 mod.json 能通過 `catalogModSchema`（未知欄位以安全預設填入）。

- [ ] commit `feat: integrate translator at /translate with contribution export`。

### Task 8: E2E、CI、文件

**Files:** `playwright.config.ts`（webServer: `npm run preview -w apps/site`）、`e2e/site.spec.ts`、`.github/workflows/ci.yml`、`README.md`、`CONTRIBUTING.md`

E2E：搜尋三種關鍵字命中 Create；模組頁下載 zip 驗證內容；加入兩個模組 → `/pack` 下載合併包驗證；搜尋不存在 → `/translate` 入口；`/translate` 上傳 fixture jar 可見表格。

- [ ] commit `test: add site e2e; ci: add validation workflow; docs: readme and contributing`。
