# 內建繁中模組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 內建完整繁中的模組以「內建繁中」條目出現在模組列表、模組頁、整合包頁，並由 `fetch:modrinth` 自動建立；部分內建的模組在列表上標出內建涵蓋率。

**Architecture:** 新資料夾 `data/builtin-mods/<modId>.json`（core 新 schema＋loader），不進 `data/mods/`，所以翻譯工具、Worker、`track-versions` 不受影響。網站把兩種來源合成同一份 `ModSummary` 清單（`status: 'builtin'` 作辨識），模組頁依來源渲染不同版面；整合包比對把內建條目一起放進 slug 索引，並在解析結果標記 `builtin: true`，下載時略過。

**Tech Stack:** TypeScript、Zod 4、Astro + React islands、Vitest、Playwright、tsx scripts。

**Spec:** `docs/superpowers/specs/2026-10-17-builtin-zh-tw-mods-design.md`

## Global Constraints

- 不複製作者譯文到 repo；內建條目沒有 `en_us.json`／`zh_tw.json`。
- 模組名稱只顯示英文，不填 `nameZh`；中文叫法放 `aliases`。
- 網站文字用玩家用語；不改整站風格，只用現有元件樣式（info 色系、`builtinNote` 說明框樣式）。
- 同一 modId 不可同時在 `data/mods/` 與 `data/builtin-mods/`。
- 有內建 zh_tw 的模組：缺任何 key 就照一般模組收錄未涵蓋的 key，不套 `MIN_KEYS`，取消 `BUILTIN_COMPLETE_PERCENT` 略過；全部涵蓋才建內建條目。沒有內建 zh_tw 的模組維持 `MIN_KEYS`／`MAX_KEYS`。`MAX_KEYS` 以未涵蓋 key 數計算。
- 首頁／列表模組總數含內建條目；翻譯條數等統計不計入；sitemap 含內建模組頁；`/contributors/`、`/translate/` 不列。
- `/api/v1/index.json` 只新增欄位，不升版本。
- Commit 訊息英文 Conventional Commits，不加 `Claude-Session` trailer。

**計畫層級決定：** 內建條目不存 `builtinPercent`。依上面的規則，內建條目的涵蓋率恆為 100%，存了也只會重複；需要時用 `checkedVersion` 重新檢查。

## Review Focus

1. 整合包下載：整合包含內建條目時，下載不能去抓 `/api/v1/mods/<id>.json`（不存在）也不能產生空的 `assets/<id>/lang/zh_tw.json` → Task 8 測試。
2. 篩選「機器翻譯」不能出現內建條目；篩選「內建繁中」只出現內建條目 → Task 6 測試。
3. 舊版快取的 `index.json`（沒有 `builtinPercent` 欄位、沒有 `builtin` status）仍能解析 → Task 5 測試。
4. 內建條目 JSON 檔名與 `modId` 不一致、或與 `data/mods/` 重複 → Task 1、Task 2 測試。
5. `fetch:modrinth` 重跑時，已在 `data/builtin-mods/` 的模組要略過，不重複建立 → Task 3 測試（`existing` 集合）。

---

### Task 1: core — 內建條目 schema 與 loader

**Files:**
- Create: `packages/core/src/catalog/builtinSchema.ts`
- Modify: `packages/core/src/catalog/index.ts`（匯出）
- Create: `packages/core/src/node/loadBuiltin.ts`
- Modify: `packages/core/src/node/index.ts`（匯出）
- Test: `packages/core/src/catalog/builtinSchema.test.ts`、`packages/core/src/node/loadBuiltin.test.ts`

**Interfaces:**
- Produces:
  - `builtinModSchema`（zod），欄位：`modId`（同 `catalogModSchema` 規則）、`name`、`aliases`（default `[]`）、`summary`（同長度上限）、`authors`（min 1）、`links`（沿用 catalog 的 `links` schema，且 `modrinth` 必填）、`mcVersions`、`loaders`、`checkedVersion: { modVersion: string; mcVersion: knownMcVersion; loader: Loader }`、`updatedAt`（YYYY-MM-DD）。`.strict()`，不接受 `nameZh`、`translation`。
  - `type BuiltinMod = z.infer<typeof builtinModSchema>`
  - `BUILTIN_DIR = 'builtin-mods'`
  - `loadAllBuiltinMods(dataDir: string): Promise<{ mods: readonly BuiltinMod[]; issues: readonly DataIssue[] }>` — 讀 `<dataDir>/builtin-mods/*.json`；資料夾不存在回傳空清單；`issues` 的 `file` 欄位用 `'builtin.json'`（擴充 `ModIssue['file']` 型別）。
  - `checkBuiltinConflicts(modIds: Iterable<string>, builtinIds: Iterable<string>): string[]`（放 `builtinSchema.ts`），回傳 `${id} 同時存在於 data/mods 與 data/builtin-mods`。

- [ ] **Step 1: 寫失敗測試**

`builtinSchema.test.ts`：
- 合法物件（litematica 樣本，含 `checkedVersion`）parse 成功，`aliases` 預設 `[]`。
- 含 `nameZh` 或 `translation` → 失敗。
- `links` 沒有 `modrinth` → 失敗。
- `checkBuiltinConflicts(['a','b'], ['b','c'])` → `['b 同時存在於 data/mods 與 data/builtin-mods']`。

`loadBuiltin.test.ts`（用暫存資料夾，照 `loadData.test.ts` 的做法）：
- 兩個合法檔 → `mods.length === 2`，`issues` 空。
- 檔名 `foo.json` 內 `modId: 'bar'` → 一個 error issue，`modId: 'foo'`，訊息含「檔名須與 modId 相同」。
- JSON 解析失敗 → error issue。
- 沒有 `builtin-mods` 資料夾 → `{ mods: [], issues: [] }`。

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run packages/core/src/catalog/builtinSchema.test.ts packages/core/src/node/loadBuiltin.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作上述介面**

- [ ] **Step 4: 執行確認通過**

同 Step 2 指令，Expected: PASS；再跑 `npm run typecheck --workspace @mlf/core`（或 repo 的 typecheck 指令）無錯。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/catalog packages/core/src/node
git commit -m "feat(core): add built-in zh_tw mod schema and loader"
```

### Task 2: validate:data 與資料腳本涵蓋內建條目

**Files:**
- Modify: `scripts/validate-data.ts`
- Modify: `scripts/lib/modrinthLinks.ts`
- Modify: `scripts/fetch-mod-icons.ts`（改用 `listModIds`／`readModrinthSlug`）
- Test: `scripts/lib/modrinthLinks.test.ts`（若 scripts 無測試設定，改成把純函式放 core 並在 core 測）

**Interfaces:**
- Consumes: `loadAllBuiltinMods`、`checkBuiltinConflicts`、`BUILTIN_DIR`（Task 1）
- Produces:
  - `listModIds()` 回傳 `data/mods` 資料夾＋`data/builtin-mods/*.json` 的 modId（排序、去重）。
  - `readModrinthSlug(modId)` 先找 `data/mods/<id>/mod.json`，不存在再找 `data/builtin-mods/<id>.json`。
  - `validate:data`：輸出內建條目的 issues；`checkBuiltinConflicts` 的結果算 error；`modrinth-stats.json`、`banners-disabled.json` 的「已知 modId」包含內建條目；最後一行改為 `已檢查 N 個模組、K 個內建繁中模組、P 個整合包：…`。

- [ ] **Step 1: 寫失敗測試**：`listModIds` 在含 `mods/a/`、`builtin-mods/b.json` 的暫存資料夾回傳 `['a','b']`；`readModrinthSlug('b')` 回傳 builtin 檔的 slug。（`MODS_DIR` 需改成可注入，例如 `listModIds(dataDir = DATA_DIR)`。）
- [ ] **Step 2: 執行確認失敗**：`npx vitest run scripts/lib/modrinthLinks.test.ts`，FAIL。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試 PASS；`npm run validate:data` 輸出 `0 個錯誤`、內建數 `0`（尚未回填）。
- [ ] **Step 5: Commit** `feat(scripts): include built-in zh_tw mods in data validation and Modrinth scripts`

### Task 3: pipeline 與 `fetch:modrinth` 自動建立內建條目

**Files:**
- Modify: `packages/core/src/pipeline/select.ts`
- Modify: `packages/core/src/pipeline/modrinth.ts`（新增 `buildBuiltinMeta`）
- Modify: `scripts/fetch-modrinth.ts`
- Test: `packages/core/src/pipeline/pipeline.test.ts`

**Interfaces:**
- Produces:
  - `Selection` 新增 `{ action: 'builtin' }`；`'skip'` 的 reason 移除 `'builtin-complete'`。刪除 `BUILTIN_COMPLETE_PERCENT`（確認沒有其他引用）。
  - `buildBuiltinMeta({ hit, modId, source, today }): BuiltinMod`：`name`、`aliases`、`summary`（`SUMMARY_PLACEHOLDER`）、`authors`、`links`、`mcVersions`、`loaders` 與 `buildDraftMeta` 同規則（抽共用 helper，不複製）；`checkedVersion` = `source` 的 `modVersion`／`mcVersion`／`loader`。
  - `fetch-modrinth`：`existing` 同時包含 `data/builtin-mods` 的 modId；`builtin` 選擇寫 `data/builtin-mods/<modId>.json`，輸出 `ADDED-BUILTIN <modId>`，並計入 `added`；結尾摘要分開列出新增的一般／內建數。

- [ ] **Step 1: 改寫測試**（`pipeline.test.ts` 的 `selectForTranslation` describe）：
  - 內建 zh_tw 涵蓋全部 30 key → `{ action: 'builtin' }`（取代原 `builtin-complete` 斷言）。
  - 內建涵蓋 27/30（90%，缺 3）→ `action: 'include'`、`Object.keys(en).length === 3`、`builtinPercent === 90`。
  - 內建涵蓋 5/6（缺 1，總數 6 < `MIN_KEYS`）→ `include`，1 key。
  - 沒有內建、5 key → 仍 `{ action: 'skip', reason: 'too-small' }`；2000 key → `too-large`。
  - 內建涵蓋 0/2000 → `too-large`。
  - `buildBuiltinMeta(...)` 結果通過 `builtinModSchema.parse`，且 `checkedVersion` 等於輸入 `source`。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run packages/core/src/pipeline/pipeline.test.ts`，FAIL。
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試 PASS；`npx tsc --noEmit -p scripts`（或 repo 的 typecheck）無錯。
- [ ] **Step 5: Commit** `feat(pipeline): create built-in zh_tw entries instead of skipping complete mods`

### Task 4: 回填 17 個內建條目（資料）

**Files:**
- Create: `data/builtin-mods/<modId>.json` × 17
- 暫時腳本：`scripts/_backfill-builtin.ts`（執行後刪除，不提交）

17 個 modId：appleskin、cloth-config2、fastquit、freecam、lambdynlights、litematica、lootr、malilib、modernui、naturescompass、nochatreports、presencefootsteps、rrls、tacz、terralith、yet_another_config_lib_v3、zoomify。

- [ ] **Step 1: 寫暫時腳本**：每個 modId 用 `git show 45c9f46:data/mods/<id>/mod.json` 取舊資料，對應：`name`、`summary`、`authors`、`links`、`mcVersions`、`loaders` 原樣；`aliases` = 舊 `aliases` ∪ 舊 `nameZh`（若有且不在其中）；`checkedVersion` = 舊 `sourceVersions[0]` 的 `modVersion`／`mcVersion`／`loader`；`updatedAt` = 執行日。寫入前用 Modrinth API 找到該版本、下載 jar、`selectNamespace` + `uncoveredKeys`，確認未涵蓋 key 數為 0；不是 0 的模組不寫入，印出 `NOT-COMPLETE <id> <n>`。
- [ ] **Step 2: 執行**：`npx tsx scripts/_backfill-builtin.ts`。Expected: 17 行 `WROTE`，0 行 `NOT-COMPLETE`。若有 `NOT-COMPLETE`，停下來回報（依規則它應改回一般條目，需另外處理）。
- [ ] **Step 3: 刪除暫時腳本並驗證**：`rm scripts/_backfill-builtin.ts`；`npm run validate:data` → `0 個錯誤`、`17 個內建繁中模組`。
- [ ] **Step 4: 補圖示、橫幅、下載量**：`npm run fetch:icons`（以 package.json 實際名稱為準）、`npm run banners:fetch`、`npm run stats:fetch`；`npm run validate:data` 仍 0 錯誤。
- [ ] **Step 5: Commit** `chore(data): restore 17 mods as built-in zh_tw entries`

### Task 5: 網站資料層 — `ModSummary` 與 index API

**Files:**
- Modify: `apps/site/src/lib/summary.ts`、`apps/site/src/lib/data.ts`、`apps/site/src/islands/catalogIndex.ts`、`apps/site/src/pages/api/v1/index.json.ts`
- Test: `apps/site/src/islands/catalogIndex.test.ts`、`apps/site/src/lib/siteData.test.ts`

**Interfaces:**
- Consumes: `loadAllBuiltinMods`、`BuiltinMod`（Task 1）
- Produces:
  - `ModSummary.status: TranslationStatus | 'builtin'`（型別 `SummaryStatus`，`SUMMARY_STATUSES = [...TRANSLATION_STATUSES, 'builtin'] as const` 放 `summary.ts`）。
  - `ModSummary.builtinPercent: number | null`：一般條目取 `translation.builtinPercent ?? null`；內建條目 `100`。
  - 內建條目的摘要：`percent: 100`、`total: 0`、`translated: 0`、`hasGuide: false`、`nameZh: null`、icon／banner／downloads 同一般條目取法。
  - `getBuiltinMods(): Promise<readonly BuiltinMod[]>`（併入 `siteData()` 快取；載入有 error 時與一般資料一樣丟出）。
  - `builtinToSummary(b: BuiltinMod): ModSummary`。
  - `getAllSummaries(): Promise<ModSummary[]>` = 一般＋內建，供 `/mods/`、首頁、index API 共用。
  - `modSummarySchema`：`status: z.enum(SUMMARY_STATUSES)`、`builtinPercent: z.number().int().min(0).max(100).nullable().default(null)`。

- [ ] **Step 1: 寫失敗測試**
  - `catalogIndex.test.ts`：含 `status: 'builtin'` 的項目解析成功；沒有 `builtinPercent` 的舊項目解析為 `null`。
  - `siteData.test.ts`：`builtinToSummary(litematica 樣本)` → `status: 'builtin'`、`builtinPercent: 100`、`total: 0`、`nameZh: null`。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run apps/site/src/islands/catalogIndex.test.ts apps/site/src/lib/siteData.test.ts`
- [ ] **Step 3: 實作**；`index.json.ts` 改用 `getAllSummaries()`。
- [ ] **Step 4: 驗證**：測試 PASS；`npm run build` 成功，`dist` 的 `api/v1/index.json` 含 `"modId":"litematica"` 且 `"status":"builtin"`。
- [ ] **Step 5: Commit** `feat(site): include built-in zh_tw mods in catalog summaries`

### Task 6: 模組列表 — 卡片、條列、篩選、圖例

**Files:**
- Create: `apps/site/src/components/BuiltinTag.tsx`
- Modify: `apps/site/src/components/ModCard.tsx`、`ModRow.tsx`、`apps/site/src/islands/ModsBrowser.tsx`、`apps/site/src/islands/filterMods.ts`（若需要）、`apps/site/src/pages/mods/index.astro`、`apps/site/src/pages/index.astro`、`apps/site/src/i18n/zh-TW.ts`、`apps/site/src/lib/format.ts`
- Test: `ModCard.test.tsx`、`ModRow.test.tsx`、`filterMods.test.ts`

**Interfaces:**
- Consumes: `ModSummary`、`SUMMARY_STATUSES`（Task 5）
- Produces:
  - `BuiltinTag({ className? })`：與 `TranslationTag` 同尺寸，info 色系（`bg-info-soft text-info` 一類現有 token），文字 `t.builtin.tag` = `內建繁中`。
  - i18n：`t.builtin.tag: '內建繁中'`、`t.builtin.partial: (p: number) => \`內建繁中 ${p}%\``、`t.mods.legend.builtin: '模組本身已有完整繁中，不需要本站資源包'`、篩選選項標籤 `內建繁中`。
- 行為：
  - `status === 'builtin'`：卡片／條列以 `BuiltinTag` 取代 `TranslationTag`，不渲染 `StatusBadge`。
  - 一般條目且 `builtinPercent !== null`：資訊列加 `t.builtin.partial(builtinPercent)`。
  - 篩選 `STATUS_OPTIONS` 用 `SUMMARY_STATUSES`；`/mods/` 圖例多一列 builtin（用 `BuiltinTag` 當 `dt`）。
  - `/mods/` 與首頁的資料來源改用 `getAllSummaries()`；首頁 `statMods` = 一般＋內建數；`totalEntries`、`toReview`、`sampleMod` 只用一般條目。

- [ ] **Step 1: 寫失敗測試**
  - `ModCard.test.tsx`：builtin 摘要 → 有文字「內建繁中」、沒有「機器翻譯・待校對」、沒有百分比文字；`builtinPercent: 99` 的 machine 摘要 → 有「內建繁中 99%」。
  - `ModRow.test.tsx`：同上兩條。
  - `filterMods.test.ts`：清單含 machine 與 builtin；`status: 'machine'` 只回 machine；`status: 'builtin'` 只回 builtin。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run apps/site/src/components/ModCard.test.tsx apps/site/src/components/ModRow.test.tsx apps/site/src/islands/filterMods.test.ts`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試 PASS；`npm run lint` 無錯。
- [ ] **Step 5: Commit** `feat(site): show built-in zh_tw tag in mod list`

### Task 7: 內建條目的模組頁

**Files:**
- Create: `apps/site/src/components/BuiltinModPage.astro`
- Modify: `apps/site/src/pages/mods/[modId].astro`、`apps/site/src/i18n/zh-TW.ts`、`apps/site/src/lib/format.ts`（`modPageDescription` 若需內建版本）
- Test: e2e（Task 9）；元件無單元測試框架時以 build 驗證

**Interfaces:**
- Consumes: `getBuiltinMods`（Task 5）
- Produces:
  - `getStaticPaths` 回傳一般與內建兩種 props：`{ kind: 'translated', mod: SiteMod } | { kind: 'builtin', mod: BuiltinMod }`；`[modId].astro` 依 `kind` 渲染原版面或 `<BuiltinModPage mod={...} />`。
  - `BuiltinModPage`：麵包屑、橫幅、圖示、名稱、簡介、`BuiltinTag`、載入器與版本 chip、說明框（`t.builtin.note`，樣式同現有 `builtinNote` 框）、主要按鈕「到 Modrinth 下載模組」（外部連結，`rel="noopener noreferrer"`、新視窗提示同現有寫法）、右側資訊（作者、下載量、Minecraft 版本、外部連結）。保留 `data-pagefind-body` 與 `modId`、`nameZh`（空字串）、`percent`（`100`）meta、aliases 隱藏文字，讓搜尋找得到。
  - 不渲染：`DownloadPanel`、`SuggestDialog`、條目預覽、進度、手冊、貢獻者連結、`machineNote`。
  - i18n：`t.builtin.note: '這個模組本身已經有完整的繁體中文，在遊戲裡把語言切到「繁體中文（台灣）」就能看到，不需要下載本站的資源包。'`、`t.builtin.getMod: '到 Modrinth 下載模組'`。

- [ ] **Step 1: 實作**
- [ ] **Step 2: 驗證**：`npm run build` 成功；`dist/mods/litematica/index.html` 含「本身已經有完整的繁體中文」，且不含 `DownloadPanel` 的按鈕文字（`t.modPage.downloadTitle`）。
- [ ] **Step 3: Commit** `feat(site): add mod page for built-in zh_tw mods`

### Task 8: 整合包 — 比對、清單標籤、下載略過

**Files:**
- Modify: `packages/core/src/modpack/resolve.ts`
- Modify: `apps/site/src/lib/modpacks.ts`、`apps/site/src/lib/modpackSummary.ts`、`apps/site/src/lib/data.ts`（`toSiteModpack` 傳入內建清單）
- Modify: `apps/site/src/components/ModpackModList.tsx`
- Modify: `apps/site/src/islands/downloadModpack.ts`
- Test: `packages/core/src/modpack/*.test.ts`（resolve 所在測試檔）、`apps/site/src/lib/modpacks.test.ts`、`apps/site/src/components/ModpackModList.test.tsx`、`apps/site/src/islands/modpackDownload.test.tsx`

**Interfaces:**
- Consumes: `BuiltinMod`（Task 1）、`BuiltinTag`（Task 6）
- Produces:
  - `resolvedModpackModSchema` 加 `builtin: z.boolean().default(false)`。
  - `resolveModpackMods(mods, catalog, builtin: readonly CatalogModLinks[] = [])`：一般目錄優先；對不上時再查內建索引，命中則 `{ modId, builtin: true }`。
  - `includedModIds(resolved, { includeBuiltin = true } = {})`；下載端呼叫 `includedModIds(pack.mods, { includeBuiltin: false })`。
  - `IncludedMod` 加 `builtin: boolean`；內建條目 `percent: 100`。
  - `toSiteModpack(pack, catalog, builtin: readonly BuiltinMod[])`；`ModpackSummary.includedMods` 含內建。
  - `ModpackModList`：`builtin` 項目右側渲染 `BuiltinTag`，不渲染 `modPercent`。

- [ ] **Step 1: 寫失敗測試**
  - resolve：整合包含 slug `litematica`（只在內建索引）→ `modId: 'litematica'`、`builtin: true`；同 slug 同時存在一般目錄 → `builtin: false`。舊 API body 沒有 `builtin` 欄位 → parse 為 `false`。
  - `modpacks.test.ts`：`toSiteModpack` 的 `included` 含 `{ modId: 'litematica', builtin: true }`，`missing` 不含它；`toModpackSummary(...).includedMods` 計入。
  - `ModpackModList.test.tsx`：builtin 項目顯示「內建繁中」，不顯示百分比。
  - `modpackDownload.test.tsx`：整合包 mods 含一個 builtin → `fetchImpl` 從未被呼叫 `/api/v1/mods/litematica.json`；產出的 zip 不含 `assets/litematica/`。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run packages/core/src/modpack apps/site/src/lib/modpacks.test.ts apps/site/src/components/ModpackModList.test.tsx apps/site/src/islands/modpackDownload.test.tsx`
- [ ] **Step 3: 實作**
- [ ] **Step 4: 驗證**：測試 PASS；`npm test` 全部通過。
- [ ] **Step 5: Commit** `feat(modpacks): count built-in zh_tw mods as included and skip them in downloads`

### Task 9: e2e 與收尾

**Files:**
- Modify/Create: `e2e/site.spec.ts`（或新增 `e2e/builtin.spec.ts`）
- Modify: `CONTRIBUTING.md`／`data/README.md` 中描述資料夾結構的段落（加入 `data/builtin-mods/` 說明，語氣以外部讀者為對象）

- [ ] **Step 1: 寫 e2e**
  - `/mods/` 搜尋 `Litematica` → 出現卡片，含「內建繁中」。
  - `/mods/litematica/` → 有說明文字「本身已經有完整的繁體中文」與 Modrinth 連結；沒有「加入合併資源包」按鈕、沒有條目表。
  - 篩選「內建繁中」→ 只剩內建卡片（至少含 Litematica，不含 Create）。
  - 若範例整合包不含內建模組，在 `data/modpacks/example-pack/modpack.json` 加一筆 `{ "platform": "modrinth", "projectId": "<litematica 的 Modrinth project id>", "slug": "litematica" }`，並驗證 `/modpacks/example-pack/` 的已收錄清單出現 Litematica 與「內建繁中」；更新 `e2e/modpacks.spec.ts` 中受影響的計數斷言。
- [ ] **Step 2: 執行**：`npm run build && npm run test:e2e`（依 `.claude/rules/worktrees.md`：先 `cp .dev.vars.example .dev.vars`、`PUBLIC_SUGGEST_ENABLED=true npm run build`，用 `E2E_PORT=8791`）。Expected: 全部 PASS。
- [ ] **Step 3: 文件**：補 `data/builtin-mods/` 說明（欄位、何時建立、不放譯文的原因）。
- [ ] **Step 4: 全套驗證**：`npm run validate:data`、`npm test`、`npm run lint`、`npm run build` 全過。
- [ ] **Step 5: Commit** `test(e2e): cover built-in zh_tw mods` 與 `docs: describe data/builtin-mods`
