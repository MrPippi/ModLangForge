# 只在 CurseForge 上架的模組：實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓只在 CurseForge 上架的模組能收錄、追蹤版本、通過資料檢查，並在網站上有圖示、橫幅與下載量。

**Architecture:** 新增平台中立的 `PlatformBuild` 型別，Modrinth 版本與 CurseForge 檔案各有一個轉換函式；版本挑選、追蹤規劃、套用版本只認 `PlatformBuild`。`trackingPlatform(links)` 決定每個模組用哪個平台（有 Modrinth 就用 Modrinth）。CurseForge API 呼叫集中在新的 core 模組 `curseforgeMods/`，以 `fakeFetch` 測試。

**Tech Stack:** TypeScript、zod、vitest、tsx 腳本、Astro 網站、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-10-20-curseforge-only-mods-design.md`

## Global Constraints

- 同時在兩個平台的模組一律以 Modrinth 為準；既有 81 個模組與 17 個內建條目的追蹤、圖示、橫幅、下載量結果不得改變。
- `downloadUrl` 為 `null` → 略過並說明「作者不允許第三方下載」；不得自組 CDN 網址或改用其他來源。
- 金鑰只送往 `https://api.curseforge.com`（用 `apiInit`：`x-api-key`、`redirect: 'error'`）；下載 CDN 不帶金鑰；錯誤訊息先 `redact`。
- 沒有 `CURSEFORGE_API_KEY` 時，Modrinth 模組照常處理，CurseForge 專有模組列為「略過：沒有 CurseForge 金鑰」，不以錯誤結束（`fetch:curseforge` 例外：直接以清楚訊息結束）。
- CurseForge jar 只接受 `https://edge.forgecdn.net/`、`https://mediafilez.forgecdn.net/`；圖片只接受 `https://media.forgecdn.net/`；`redirect: 'error'`；大小上限 `MAX_JAR_BYTES`；有 sha1（`hashes` 中 `algo === 1`）就比對。
- CurseForge `modVersion` = 檔名去掉結尾 `.jar`。alpha／beta 檔案照常列入。略過 `isServerPack`、非 `.jar`、`isAvailable === false`、`fileStatus !== 4`。
- MC 版本與載入器只用既有的 `PACK_FORMATS`（`packFormat >= JSON_LANG_MIN_PACK_FORMAT`）與 `LOADERS`；不另建清單。
- 程式碼註解與使用者可見文字用繁體中文（台灣用語），風格與周邊程式一致；不可變更新（回傳新物件）。
- 每個任務結束時 `npm run lint`、`npm test` 通過；Task 4 起 `npm run validate:data` 也要通過。
- Commit 訊息用 conventional commits（英文），不加任何 session 連結或 trailer。

## Review Focus

1. CurseForge 檔案 `gameVersions` 同時標 `Forge` 與 `NeoForge`、或只有 `Client`／`Server` 等非版本值 → 轉換只保留合法值；沒有任何支援 MC 版本或載入器的檔案回傳 `null`（Task 2 測試 `fromCurseforgeFile drops files without supported versions`）。
2. slug 搜尋回傳多筆或回傳整合包（`classId !== 6`）→ 只接受 slug 完全相同且 `classId === 6` 的那筆，否則視為找不到（Task 2 測試 `findCurseforgeProject ignores non-mod and partial matches`）。
3. 沒有金鑰卻跑每週追蹤 → CurseForge 專有模組進摘要的「略過」，Modrinth 模組照常（Task 3 測試 `listBuilds skips curseforge mods without a key`）。
4. 沒有金鑰時跑 `stats:fetch` → 既有 CurseForge 下載量保留不刪（Task 5 測試 `mergeModStats keeps entries that were not fetched`）。
5. 下載網址轉址到其他主機或 sha1 不符 → 視為錯誤，不寫入任何資料（Task 2 測試 `downloadCurseforgeJar rejects hash mismatch` 與 `rejects foreign hosts`）。

---

### Task 1: 平台中立的版本型別

**Files:**
- Create: `packages/core/src/pipeline/build.ts`、`packages/core/src/pipeline/build.test.ts`
- Modify: `packages/core/src/pipeline/modrinth.ts`（`pickVersion`、`pickVersionFor`、`resolveSourceRef`、`loaderPreference` 改為委派給 build.ts）、`packages/core/src/pipeline/index.ts`

**Interfaces:**
- Produces（從 `@mlf/core/pipeline` 匯出）:
  - `type Platform = 'modrinth' | 'curseforge'`
  - `interface PlatformBuild { platform: Platform; id: string; modVersion: string; mcVersions: readonly string[]; loaders: readonly Loader[]; publishedAt: string; file: { name: string; url: string | null; sha1?: string } }`（全部 `readonly`；`Loader` 來自 `trackPlan.ts`，若造成循環匯入就改從 `catalog/schema` 的 `LOADERS` 推導）
  - `fromModrinthVersion(v: ModrinthVersion): PlatformBuild`：`file` 取 `primaryFile(v)`；沒有檔案時 `file = { name: '', url: null }`；`loaders` 只保留 `LOADERS` 內的值。
  - `pickBuildFor(builds: readonly PlatformBuild[], mcVersion: string, loader: string): PlatformBuild | null`：條件為含 mc、含 loader、`file.name !== ''`，取 `publishedAt` 最新。
  - `pickBuild(builds: readonly PlatformBuild[]): PlatformBuild | null`：依 `PREFERRED_MC_VERSIONS` 順序。
  - `buildSourceRef(b: PlatformBuild): SourceRef | null`：與現在 `resolveSourceRef` 規則相同（含 NeoForge 優先規則）。

- [ ] **Step 1: 寫失敗測試** `build.test.ts`：`fromModrinthVersion` 映射欄位（`version_number`→`modVersion`、未知 loader 被丟掉、`primary` 檔優先）；`pickBuildFor`／`pickBuild`／`buildSourceRef` 各至少一個案例，值與 `addSourceVersion.test.ts` 中 `resolveSourceRef` 的案例一致（例如 `game_versions: ['1.21', '1.21.1'], loaders: ['quilt', 'fabric']` → `{ modVersion: '1.0', mcVersion: '1.21.1', loader: 'fabric' }`）。
- [ ] **Step 2:** `npx vitest run packages/core/src/pipeline/build.test.ts`，預期 FAIL（找不到模組）。
- [ ] **Step 3:** 實作 build.ts；`modrinth.ts` 的 `pickVersion`／`pickVersionFor`／`resolveSourceRef` 保留原簽章，內部轉成 `PlatformBuild` 後呼叫新函式，再映射回原本的 `ModrinthVersion`（以索引或 id 對回）。
- [ ] **Step 4:** `npm test -w @mlf/core`，預期全部 PASS（既有測試不改）。
- [ ] **Step 5: Commit** `refactor(pipeline): add platform-neutral build type`

### Task 2: CurseForge 模組 API（core）

**Files:**
- Create: `packages/core/src/curseforgeMods/{index.ts,files.ts,project.ts,download.ts,ranking.ts}` 與對應 `*.test.ts`
- Modify: `packages/core/src/modpackImport/curseforge.ts`（`filesSchema` 加 `gameVersions: z.array(z.string()).default([])`、`isAvailable: z.boolean().nullish()`、`fileStatus: z.number().int().nullish()`、`hashes: z.array(z.object({ value: z.string(), algo: z.number().int() })).default([])`；`listCurseforgeFiles` 加上 `export`）、`packages/core/package.json` 不需改（`./*` 已涵蓋）

**Interfaces:**
- Consumes: Task 1 的 `PlatformBuild`；既有 `apiInit`、`searchCurseforge`、`listCurseforgeFiles`、`CURSEFORGE_*` 常數、`fetchBytes`、`FetchLike`。
- Produces（從 `@mlf/core/curseforgeMods` 匯出）:
  - `interface CurseforgeProject { id: number; name: string; slug: string; authors: readonly string[]; downloadCount: number; logoUrl: string | null; screenshotUrls: readonly string[] }`
  - `findCurseforgeProject(fetchImpl: FetchLike, apiKey: string, slug: string): Promise<CurseforgeProject | null>`：`/mods/search?gameId=432&classId=6&slug=<slug>`，只接受 slug 完全相同、`classId === 6`；`logoUrl` 取 `logo.url ?? logo.thumbnailUrl`；`screenshotUrls` 依回傳順序取 `url`。需要一個專用 zod schema（`downloadCount`、`logo`、`screenshots` 為 nullish）。
  - `fromCurseforgeFile(file: CurseforgeFile): PlatformBuild | null`：規則見 Global Constraints；`id = String(file.id)`、`publishedAt = file.fileDate`、`file.sha1` 取 `algo === 1`；沒有任何支援 MC 版本或載入器時回傳 `null`。
  - `listCurseforgeBuilds(fetchImpl: FetchLike, apiKey: string, projectId: number): Promise<PlatformBuild[]>`
  - `downloadCurseforgeJar(fetchImpl: FetchLike, build: PlatformBuild): Promise<Uint8Array>`：`url === null` 丟 `CurseforgeDownloadBlocked`（自訂 Error 子類別，訊息「作者不允許第三方下載」）；主機不在允許清單丟錯；以 `redirect: 'error'`、不帶金鑰下載；sha1 不符丟錯（用 Web Crypto `crypto.subtle.digest('SHA-1', …)`，Node 與瀏覽器都可用，core 不必依賴 `node:crypto`）。
  - `curseforgeRankingPage(fetchImpl: FetchLike, apiKey: string, index: number): Promise<readonly CurseforgeProject[]>`：`sortField=6&sortOrder=desc&pageSize=50&index=<index>`。
  - `CURSEFORGE_JAR_HOSTS`、`CURSEFORGE_IMAGE_PREFIX = 'https://media.forgecdn.net/'` 常數。

- [ ] **Step 1: 寫失敗測試**（`fakeFetch`）：
  - `fromCurseforgeFile maps gameVersions`：`gameVersions: ['1.21.1', 'NeoForge', 'Client']`、`fileName: 'ae2-19.2.17.jar'` → `{ platform: 'curseforge', modVersion: 'ae2-19.2.17', mcVersions: ['1.21.1'], loaders: ['neoforge'] }`。
  - `fromCurseforgeFile drops files without supported versions`（只有 `['Client', 'Java 21']`）、`drops server packs`、`drops unavailable or unapproved files`（`isAvailable: false`、`fileStatus: 3`）、`keeps beta files`。
  - `findCurseforgeProject ignores non-mod and partial matches`：搜尋回傳 `slug: 'ae2-addon'` 與 `classId: 4471` 兩筆 → `null`；完全相同那筆 → 回傳物件。也斷言請求帶 `x-api-key`。
  - `downloadCurseforgeJar rejects hash mismatch`、`rejects foreign hosts`（`https://evil.example/x.jar`）、`throws CurseforgeDownloadBlocked for null url`、`does not send the api key`（檢查 `fakeFetch.calls` 的 init 沒有 `x-api-key`）。
  - `curseforgeRankingPage builds the ranking query`：斷言網址為 `${CURSEFORGE_API}/mods/search?gameId=432&classId=6&sortField=6&sortOrder=desc&pageSize=50&index=50`。
- [ ] **Step 2:** `npx vitest run packages/core/src/curseforgeMods`，預期 FAIL。
- [ ] **Step 3:** 實作上述函式；`modpackImport` 既有測試不改。
- [ ] **Step 4:** `npm test -w @mlf/core` 全部 PASS。
- [ ] **Step 5: Commit** `feat(core): add CurseForge mod files, project lookup and jar download`

### Task 3: 依平台追蹤與新增版本

**Files:**
- Create: `packages/core/src/pipeline/platform.ts`（＋測試）、`scripts/lib/builds.ts`
- Modify: `packages/core/src/pipeline/trackPlan.ts`、`applyVersion.ts`（及兩者測試的型別）、`scripts/lib/addVersion.ts`、`scripts/track-versions.ts`、`scripts/add-source-version.ts`、`.github/workflows/track-versions.yml`

**Interfaces:**
- Consumes: Task 1、Task 2；`curseforgeSlug`（`packages/core/src/modpack/resolve.ts`）、`readCurseforgeKey`、`redact`。
- Produces:
  - `trackingPlatform(links: { modrinth?: string; curseforge?: string }): Platform | null`（`@mlf/core/pipeline`）
  - `planTracking(meta: CatalogMod, builds: readonly PlatformBuild[]): TrackPlan`；`TrackTarget.version`、`ApplyTarget.version` 型別改為 `PlatformBuild`；`ApplyVersionIO.extractEn(build: PlatformBuild, modId: string)`；`applyVersion` 寫入 `modVersion: target.version.modVersion`。
  - `scripts/lib/builds.ts`：`listBuilds(meta: { links: … }, apiKey: string | undefined): Promise<{ builds: PlatformBuild[] } | { skip: string }>` 與 `downloadBuildJar(build: PlatformBuild): Promise<Uint8Array | null>`（Modrinth 走既有 `downloadJar` 規則；CurseForge 走 `downloadCurseforgeJar`）。
  - `cachedExtract` 的快取鍵改為 `${build.platform}:${build.id}\u0000${modId}`。

- [ ] **Step 1: 寫失敗測試**：
  - `platform.test.ts`：只有 modrinth → `'modrinth'`；兩者都有 → `'modrinth'`；只有合法 CurseForge 網址 → `'curseforge'`；CurseForge 網址格式不符（例如 `https://curseforge.com/minecraft/mc-mods/x`，少了 `www.`）→ `null`；都沒有 → `null`。
  - `trackPlan.test.ts`：既有案例改用 `fromModrinthVersion` 產生輸入，期望值不變；新增 `tracks curseforge-only mods`（`links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/ae2' }` → `kind: 'track'`）；沒有任何連結時的原因改為 `'mod.json 沒有 Modrinth 或 CurseForge 連結'`。
  - `applyVersion.test.ts`：新增 CurseForge build 寫入 `modVersion` 為檔名去 `.jar` 的案例。
  - `listBuilds skips curseforge mods without a key`：把 `listBuilds` 的 HTTP 依賴注入（參數 `fetchImpl: FetchLike = fetch`）後，可以放在 `packages/core/src/pipeline/` 以純函式測試；如果留在 `scripts/` 就抽出判斷函式 `buildSourceFor(links, apiKey): { platform } | { skip }` 到 core 測試。
- [ ] **Step 2:** 執行上述測試，預期 FAIL。
- [ ] **Step 3:** 實作。`track-versions.ts` 用 `listBuilds`；`file.url === null` 的目標記為略過（原因「作者不允許第三方下載」），不算錯誤：在 `extractEn` 丟 `CurseforgeDownloadBlocked`，由 `track-versions.ts` 把對應結果轉成 `skipped`，或在 `planMod` 階段先濾掉，擇一並寫測試。`add-source-version.ts` 依平台取版本，CurseForge 沒有金鑰時丟「需要 CURSEFORGE_API_KEY」。workflow 的 Track 與 Refresh 步驟加 `env: CURSEFORGE_API_KEY: ${{ secrets.CURSEFORGE_API_KEY }}`。
- [ ] **Step 4:** `npm test`、`npm run lint` PASS；`npm run track:versions -- --max-builds 0` 實際執行一次（只規劃、不寫入），摘要中既有模組沒有出現新的略過原因。
- [ ] **Step 5: Commit** `feat(pipeline): track versions of CurseForge-only mods`

### Task 4: 資料格式與檢查

**Files:**
- Modify: `packages/core/src/catalog/builtinSchema.ts`（＋測試）、`scripts/validate-data.ts`（或 core 的檢查函式＋測試）

**Interfaces:**
- Consumes: Task 3 的 `trackingPlatform`、`curseforgeSlug`。
- Produces: `builtinModSchema` 的 `links` 規則改為 `modrinth !== undefined || curseforge !== undefined`，訊息 `'內建條目必須提供 Modrinth 或 CurseForge 連結'`；`checkCurseforgeLinks(mods: readonly { modId: string; links: … }[]): readonly string[]`：沒有 `links.modrinth`、有 `links.curseforge` 但 `curseforgeSlug` 解析不出 → `${modId}: CurseForge 連結格式不符（應為 https://www.curseforge.com/minecraft/mc-mods/<slug>）`。

- [ ] **Step 1:** 測試：只有 CurseForge 連結的內建條目通過；兩者都沒有失敗且訊息正確；`checkCurseforgeLinks` 的通過與失敗案例。
- [ ] **Step 2:** 執行，預期 FAIL。
- [ ] **Step 3:** 實作，並在 `validate-data.ts` 對一般模組與內建條目呼叫 `checkCurseforgeLinks`。
- [ ] **Step 4:** `npm test`、`npm run validate:data` PASS。
- [ ] **Step 5: Commit** `feat(catalog): allow CurseForge-only entries`

### Task 5: 下載量（資料、腳本、網站）

**Files:**
- Modify: `packages/core/src/catalog/modStats.ts`（＋測試）、`scripts/fetch-mod-stats.ts`、`scripts/validate-data.ts`、`apps/site/src/lib/data.ts`、`apps/site/src/lib/summary.ts`、`apps/site/src/islands/catalogIndex.ts`、`apps/site/src/components/ModCard.tsx`、`ModRow.tsx`、`TranslatedModPage.astro`、`BuiltinModPage.astro`、`apps/site/src/i18n/zh-TW.ts`，以及相關測試
- Rename: `data/modrinth-stats.json` → `data/mod-stats.json`（內容轉為 v2）

**Interfaces:**
- Produces:
  - `modStatsSchema`：`{ version: 2, mods: Record<string, { downloads: number; platform: Platform; fetchedAt: string }> }`
  - `mergeModStats(prev: ModStats, fetched: Readonly<Record<string, { downloads: number; platform: Platform }>>, linkedModIds: ReadonlySet<string>, today: string): ModStats`：未抓到的既有條目保留；不在 `linkedModIds`（`trackingPlatform` 為 `null` 或已移除）的丟掉。
  - 網站目錄項目的 `downloads` 改為 `{ count: number; platform: Platform } | null`（`catalogIndex` 的 zod 同步改；排序用 `count`）。
  - i18n：`modPage.downloads` 改為 `downloads: { modrinth: 'Modrinth 下載量', curseforge: 'CurseForge 下載量' }`；卡片／列表在數字旁顯示小字平台名（`Modrinth`／`CurseForge`），沿用現有字級與顏色 token，不改版面。

- [ ] **Step 1:** 測試：`mergeModStats keeps entries that were not fetched`、`drops unlinked mods`、`writes platform`；`filterMods` 的下載量排序用 `count`；`ModCard` 顯示平台名稱；`siteData` 讀 `mod-stats.json`。
- [ ] **Step 2:** 執行，預期 FAIL。
- [ ] **Step 3:** 實作；`fetch-mod-stats.ts` 依 `trackingPlatform` 取 Modrinth `downloads` 或 `findCurseforgeProject(...).downloadCount`，沒有金鑰時 CurseForge 模組不抓（保留舊值）並印一行說明；寫一次性轉換把既有檔案轉成 v2（所有條目 `platform: 'modrinth'`），轉換腳本不提交。
- [ ] **Step 4:** `npm test`、`npm run validate:data`、`npm run build` PASS；建置後隨便挑一個既有模組頁，下載量數字與改版前相同。
- [ ] **Step 5: Commit** `feat(stats): record download counts per platform`

### Task 6: 圖示與橫幅

**Files:**
- Create: `packages/core/src/curseforgeMods/images.ts`（＋測試）
- Modify: `scripts/fetch-mod-icons.ts`、`scripts/fetch-mod-banners.ts`

**Interfaces:**
- Consumes: Task 2 的 `CurseforgeProject`、`CURSEFORGE_IMAGE_PREFIX`；Task 3 的 `trackingPlatform`。
- Produces: `curseforgeIconSource(p: CurseforgeProject): string | null`、`curseforgeBannerSources(p: CurseforgeProject): readonly string[]`（只保留 `CURSEFORGE_IMAGE_PREFIX` 開頭的網址；橫幅取第一張）。

- [ ] **Step 1:** 測試：非允許主機的網址被丟掉；沒有 logo 時回 `null`；橫幅順序與輸入一致、只取第一張。
- [ ] **Step 2:** 執行，預期 FAIL。
- [ ] **Step 3:** 實作；兩個腳本對 `trackingPlatform === 'curseforge'` 的模組改用這兩個函式，下載時 `redirect: 'error'`、不帶金鑰；沒有金鑰時略過且不刪既有圖檔；Modrinth 路徑不變。
- [ ] **Step 4:** `npm test` PASS；`npm run icons:fetch` 實際跑一次，`git status` 顯示既有圖示沒有變動。
- [ ] **Step 5: Commit** `feat(site): fetch icons and banners for CurseForge-only mods`

### Task 7: 內建繁中頁的下載按鈕

**Files:**
- Modify: `apps/site/src/pages/…/BuiltinModPage.astro`（第 61 行附近）、`apps/site/src/i18n/zh-TW.ts`（`builtin.getMod`）、`e2e/builtin.spec.ts`；新增一個只有 CurseForge 連結的測試用內建條目（放在 e2e 既有的 fixture 機制內；若 e2e 直接讀 `data/`，改用單元測試驗證按鈕資料，並把 e2e 留給既有 Modrinth 案例）

**Interfaces:**
- Produces: `builtinDownloadLink(links): { href: string; platform: Platform } | null`（放在 `apps/site/src/lib/`，＋測試）；i18n `builtin.getMod: { modrinth: '到 Modrinth 下載模組', curseforge: '到 CurseForge 下載模組' }`。

- [ ] **Step 1:** 測試：有 Modrinth 回 Modrinth；只有 CurseForge 回 CurseForge；都沒有回 `null`（按鈕不渲染）。
- [ ] **Step 2:** 執行，預期 FAIL。
- [ ] **Step 3:** 實作並套用到頁面。
- [ ] **Step 4:** `npm test`、`npm run test:e2e` PASS（既有 `到 Modrinth 下載模組` 斷言不變）。
- [ ] **Step 5: Commit** `feat(site): link built-in entries to CurseForge when needed`

### Task 8: `fetch:curseforge`

**Files:**
- Create: `scripts/fetch-curseforge.ts`、`scripts/lib/ingest.ts`、`packages/core/src/pipeline/draft.ts`（＋測試）、`packages/core/src/curseforgeMods/route.ts`（＋測試）
- Modify: `scripts/fetch-modrinth.ts`（改用 `ingest.ts`，行為不變）、`packages/core/src/pipeline/modrinth.ts`（`buildDraftMeta`／`buildBuiltinMeta` 改為呼叫 draft.ts）、`package.json`（`"fetch:curseforge": "tsx scripts/fetch-curseforge.ts"`）

**Interfaces:**
- Consumes: Task 1–3。
- Produces:
  - `interface DraftProject { name: string; slug: string; authors: readonly string[]; links: { modrinth?: string; curseforge?: string }; mcVersions: readonly string[]; loaders: readonly string[] }`；`draftFromModrinthHit(hit: ModrinthHit, curseforgeUrl?: string): DraftProject`、`draftFromCurseforge(p: CurseforgeProject, builds: readonly PlatformBuild[]): DraftProject`。
  - `buildDraftMeta({ project: DraftProject, modId, source, builtinPercent?, today })`、`buildBuiltinMeta({ project, modId, source, today })`：Modrinth 輸入的輸出必須與現在逐欄相同（以既有測試＋一個「改版前後輸出相同」的快照測試保證）。
  - `routeCurseforgeHit(input: { project: CurseforgeProject; existingCurseforgeSlugs: ReadonlySet<string>; modrinth: { slug: string; title: string; authors: readonly string[] } | null }): 'exists' | 'modrinth' | 'curseforge'`：Modrinth 對應的判斷沿用 `curseforgeLinks` 的比對（slug 相同，或 `normalizeModName` 相同且作者重疊）；比對不成立 → `'curseforge'`。
  - `scripts/lib/ingest.ts`：`ingestBuild(args: { draft: DraftProject; build: PlatformBuild; jar: Uint8Array; existing: Set<string>; today: string; dryRun: boolean }): Promise<string>`，回傳與 `fetch-modrinth` 現在相同格式的結果字串（`ADDED …`、`ADDED-BUILTIN …`、`skip: …`）。
- CLI：`npm run fetch:curseforge -- --limit 100 [--scan 3000] [--dry-run]`，行為依 spec「收錄」一節；Modrinth 對應專案沒有可用版本時輸出 `skip: Modrinth 上沒有 1.21.1/1.20.1 版本`，不改用 CurseForge。

- [ ] **Step 1:** 測試：`routeCurseforgeHit` 三種結果；`draftFromCurseforge` 的 `links` 只有 `curseforge`、`aliases` 規則與 Modrinth 相同（slug 等於 modId 時為空陣列）、`mcVersions` 只含支援版本；Modrinth 草稿輸出不變。
- [ ] **Step 2:** 執行，預期 FAIL。
- [ ] **Step 3:** 實作；`fetch-modrinth.ts` 改用共用程式後行為不變。
- [ ] **Step 4:** `npm test`、`npm run lint` PASS；`npm run fetch:curseforge -- --limit 5 --dry-run` 實際執行，輸出含 CurseForge 專有模組的判斷，`git status` 沒有任何資料變動。
- [ ] **Step 5: Commit** `feat(scripts): add fetch:curseforge for CurseForge ranking`

### Task 9: 文件

**Files:**
- Modify: `data/README.md`、`CONTRIBUTING.md`、`docs/development.md`

- [ ] **Step 1:** 依 spec「文件」一節更新：`fetch:curseforge` 用法、CurseForge 專有模組的處理（追蹤、圖示、下載量依平台）、哪些指令需要金鑰、作者不允許第三方下載會被略過、`mod-stats.json` 改名與格式。以外部讀者為對象，用完整易懂的繁體中文。
- [ ] **Step 2:** 檢查文件中不再出現 `modrinth-stats.json`：`git grep -n "modrinth-stats" -- ':!docs/superpowers'` 無輸出。
- [ ] **Step 3: Commit** `docs: describe CurseForge-only mod support`
