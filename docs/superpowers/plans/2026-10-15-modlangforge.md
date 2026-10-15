# ModLangForge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立純前端網頁工具，讀取多個 Minecraft 模組 jar 的語言檔，手動翻譯為繁中並匯出資源包或語言檔。

**Architecture:** `core/` 為純 TypeScript 函式（jar 解析、語言檔解析/序列化、格式碼檢查、合併、匯出），由 Zustand `store/` 呼叫並以 IndexedDB 持久化；`ui/` 為 React 元件，只透過 store 操作資料。

**Tech Stack:** React 18、TypeScript strict、Vite、Zustand、JSZip、smol-toml、idb、Tailwind CSS v4、@tanstack/react-virtual、Vitest、Testing Library、fake-indexeddb、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-15-modlangforge-design.md`

## Global Constraints

- 所有介面字串放在 `src/i18n/zh-TW.ts`，元件不得寫死中文。
- 所有資料型別欄位為 `readonly`；更新一律回傳新物件。
- `core/` 不得 import React、DOM API、store。
- 單檔上限 200MB；單一 jar 解壓總量上限 500MB。
- 匯出檔名：JSON → `zh_tw.json`；.lang → `zh_TW.lang`。
- 不使用 `dangerouslySetInnerHTML`。
- 檔案 ≤ 400 行；函式 ≤ 50 行。
- 覆蓋率：`src/core/**` ≥ 80%。

## Review Focus

1. 語言檔含 UTF-8 BOM 或 CRLF 換行 → 正常解析（Task 2 測試）。
2. locale 檔名大小寫不一（`en_US.lang`、`EN_us.json`）→ 仍偵測到（Task 4 測試）。
3. 譯文格式碼順序不同（中文語序）→ 不應誤報（Task 3 測試）。
4. 同 modId 重新載入，原文變更 → 譯文清空並標 `new`，不默默保留過期譯文（Task 5 測試）。
5. 同一 jar 多 namespace、或兩個 jar 同 namespace → 工作區內 id 不衝突、觸發合併詢問（Task 4、Task 7 測試）。

---

### Task 1: 專案骨架

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/types.ts`, `src/i18n/zh-TW.ts`, `.gitignore`, `eslint.config.js`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `src/types.ts` 定義 `LangFormat`、`EntryStatus`、`TranslationEntry`、`ModProject`、`DetectedMod`、`Workspace`（見 spec §4；`DetectedMod` = `ModProject` 去掉 `entries/updatedAt`，加 `source: Record<string,string>`、`zhTw?: Record<string,string>`、`zhCn?: Record<string,string>`、`order: string[]`）。`t` 物件匯出於 `src/i18n/zh-TW.ts`。

- [ ] Step 1: `npm create vite@latest . -- --template react-ts`，安裝相依套件。
- [ ] Step 2: 設定 Vitest（jsdom、setupFiles 載入 `@testing-library/jest-dom` 與 `fake-indexeddb/auto`）、Tailwind v4（`@tailwindcss/vite`）、`base: './'`。
- [ ] Step 3: 寫失敗測試 `App.test.tsx`：渲染 `<App/>` 應出現 `t.app.title`（「ModLangForge」）與 `t.dropzone.hint`。
- [ ] Step 4: 實作最小 App，執行 `npx vitest run` 通過。
- [ ] Step 5: `npm run build` 通過；commit `chore: scaffold vite react ts project`。

### Task 2: 語言檔解析與序列化 (`core/lang`)

**Files:**
- Create: `src/core/lang/parseJson.ts`, `parseLang.ts`, `serialize.ts`, `index.ts`
- Test: `src/core/lang/lang.test.ts`

**Interfaces:**
- Produces:
  - `interface ParsedLang { readonly entries: Readonly<Record<string,string>>; readonly order: readonly string[]; readonly warnings: readonly string[] }`
  - `parseJsonLang(text: string): ParsedLang`（JSON 錯誤時 throw `LangParseError`）
  - `parseLangFile(text: string): ParsedLang`
  - `parseLangText(text: string, format: LangFormat): ParsedLang`
  - `serializeLang(pairs: readonly (readonly [string,string])[], format: LangFormat): string`
  - `class LangParseError extends Error`

測試案例（每項一個 `it`）：
- JSON 保留 key 順序；去除 BOM；非字串值略過並產生 warning；無效 JSON throw `LangParseError`；頂層非物件 throw。
- .lang：`#` 註解與空行略過；只以第一個 `=` 分割（`a=b=c` → `b=c`）；CRLF 正確；沒有 `=` 的行產生 warning。
- 序列化 JSON：2 空格縮排、中文不跳脫、結尾換行；.lang 為 `key=value\n`。
- 往返：parse(serialize(x)) 等於 x。

- [ ] Step 1: 寫測試 → 執行失敗。
- [ ] Step 2: 實作 → 測試通過。
- [ ] Step 3: commit `feat: add lang file parsing and serialization`。

### Task 3: 格式碼檢查 (`core/validate`)

**Files:**
- Create: `src/core/validate/formatCodes.ts`
- Test: `src/core/validate/formatCodes.test.ts`

**Interfaces:**
- Produces:
  - `extractTokens(text: string): string[]`
  - `interface FormatIssue { readonly missing: readonly string[]; readonly extra: readonly string[] }`
  - `checkFormat(source: string, target: string): FormatIssue | null`（target 空 → null；一致 → null）

Token regex：`/%(?:\d+\$)?[-#+ 0,(]*\d*(?:\.\d+)?[sdfxXeEcbhnoS%]|\{\d+\}|§[0-9a-fk-orA-FK-OR]|\\n|\n/g`；`§` 小寫正規化。

測試案例：`%s` 缺少；`§a` 多出；順序不同（`%1$s %2$s` vs `%2$s %1$s`）→ null；`%%` 視為 token；`{0}`；空譯文 → null；重複 token 次數不同 → missing。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add format code validation`。

### Task 4: Jar 偵測 (`core/jar`)

**Files:**
- Create: `src/core/jar/findLangFiles.ts`, `metadata.ts`, `readJar.ts`, `errors.ts`
- Create: `src/test/makeJar.ts`（測試用：以 JSZip 從 `Record<path, string>` 產生 `Uint8Array`）
- Test: `src/core/jar/jar.test.ts`

**Interfaces:**
- Consumes: `parseLangText`（Task 2）、`DetectedMod`（Task 1）
- Produces:
  - `interface LangFileRef { readonly namespace: string; readonly locale: string; readonly format: LangFormat; readonly path: string }`
  - `findLangFiles(paths: readonly string[]): LangFileRef[]`（locale 轉小寫）
  - `interface ModMeta { readonly modId: string; readonly name: string; readonly version: string }`
  - `readModMetadata(zip: JSZip): Promise<ModMeta[]>`
  - `readJar(data: Uint8Array, jarName: string): Promise<DetectedMod[]>`
  - `class JarError extends Error { readonly code: 'not-zip' | 'no-lang' | 'too-large' | 'parse' }`
  - 常數 `MAX_JAR_BYTES = 200*1024*1024`、`MAX_UNCOMPRESSED_BYTES = 500*1024*1024`

測試案例：
- JSON 型 jar（en_us + zh_tw + zh_cn）→ 1 mod，zhTw/zhCn 填入。
- `.lang` 型 jar `en_US.lang` → format `lang`。
- 同時有 json 與 lang → 選 json。
- 多 namespace（`assets/a/lang/en_us.json`、`assets/b/lang/en_us.json`）→ 2 mod。
- 無 en_us 的 namespace 略過；整個 jar 無 → `JarError('no-lang')`。
- 非 zip bytes → `JarError('not-zip')`。
- 語言檔 JSON 損壞 → `JarError('parse')`，訊息含路徑。
- metadata：fabric.mod.json（`id/name/version`）、mods.toml（`[[mods]] modId/displayName/version`，`${file.jarVersion}` → `unknown`）、neoforge.mods.toml、mcmod.info（陣列 `modid/name/version`）；無對應 → name = namespace、version = `unknown`。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: detect lang files and metadata in mod jars`。

### Task 5: 合併邏輯 (`core/merge`)

**Files:**
- Create: `src/core/merge/buildProject.ts`, `mergeMod.ts`, `stats.ts`
- Test: `src/core/merge/merge.test.ts`

**Interfaces:**
- Consumes: `DetectedMod`, `ModProject`, `checkFormat`
- Produces:
  - `buildProject(d: DetectedMod, now: number): ModProject`（target = zhTw[key] ?? ''；status 依 target 是否為空）
  - `mergeProject(existing: ModProject, incoming: DetectedMod, now: number): ModProject`
  - `updateEntry(p: ModProject, key: string, target: string, now: number): ModProject`
  - `interface ProjectStats { total; translated; warnings; percent }` 與 `projectStats(p): ProjectStats`（obsolete 不計入 total）

合併規則（spec §8）：既有譯文且原文相同 → 保留、狀態 translated；原文變更 → target 清空、`new`；新 key → `new`（若 incoming.zhTw 有值則帶入並 `translated`）；舊有但新 jar 無 → `obsolete`，排在最後。

測試案例：上述四種情況各一；`updateEntry` 不改變原物件（`Object.isFrozen` 或比對參考）；`updateEntry` 設空字串 → `untranslated`；stats 百分比四捨五入整數；空專案 percent 0。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add project build, merge and stats`。

### Task 6: 匯出 (`core/export`)

**Files:**
- Create: `src/core/export/packFormats.ts`, `buildLangFiles.ts`, `buildResourcePack.ts`, `types.ts`
- Test: `src/core/export/export.test.ts`

**Interfaces:**
- Consumes: `serializeLang`, `ModProject`
- Produces:
  - `PACK_FORMATS: readonly { mcVersion: string; packFormat: number }[]`（1.12.2→3、1.16.5→6、1.18.2→8、1.19.2→9、1.20.1→15、1.20.4→22、1.20.6→32、1.21.1→34、1.21.4→46、1.21.5→55、1.21.8→64），`DEFAULT_MC_VERSION = '1.20.1'`
  - `type ExportKind = 'merged-pack' | 'separate-packs' | 'lang-files'`
  - `type UntranslatedMode = 'keep-source' | 'skip'`
  - `interface ExportOptions { kind; untranslated: UntranslatedMode; mcVersion: string; description: string }`
  - `langFileName(format: LangFormat): string`
  - `buildLangPairs(p: ModProject, mode: UntranslatedMode): [string,string][]`（排除 obsolete）
  - `interface ExportResult { readonly fileName: string; readonly blob: Blob }`
  - `exportProjects(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult>`

輸出規則：merged-pack → `ModLangForge-zh_tw.zip`（`pack.mcmeta` + `assets/<modId>/lang/<file>`）；separate-packs → `ModLangForge-packs.zip` 內含 `<modId>-zh_tw.zip`；lang-files 單一 → 直接檔案，多個 → `ModLangForge-lang.zip` 內 `<modId>/<file>`。`projects` 空 → throw。

測試案例：每種 kind 各一（用 JSZip 讀回驗證路徑與內容）；`skip` 模式排除未翻譯；`keep-source` 填入原文；obsolete 不輸出；`pack.mcmeta` 的 `pack_format` 依版本；lang 格式檔名 `zh_TW.lang`。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add resource pack and lang file export`。

### Task 7: Store 與持久化

**Files:**
- Create: `src/store/persistence.ts`, `src/store/workspaceStore.ts`, `src/store/toastStore.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `readJar`, `buildProject`, `mergeProject`, `updateEntry`
- Produces:
  - persistence：`loadAll(): Promise<ModProject[]>`、`saveProject(p)`、`deleteProject(id)`、`clearAll()`；DB 名 `modlangforge`、store `projects`、keyPath `id`。
  - `useWorkspace` (Zustand)：state `{ mods, activeModId, pendingConflicts: DetectedMod[], persistent: boolean, loading: boolean }`；actions `init()`、`addJars(files: File[])`、`resolveConflict(modId, 'merge'|'replace'|'skip')`、`setActive(id)`、`editEntry(modId, key, target)`、`removeMod(id)`、`clearWorkspace()`。
  - `useToasts`：`push({ kind: 'error'|'info', message })`、`dismiss(id)`。
  - 儲存：`editEntry` 後 500ms debounce per mod 呼叫 `saveProject`；IndexedDB 失敗 → `persistent=false`。

測試案例（fake-indexeddb）：addJars 新 mod 加入並設為 active；同 modId 再加 → 進 `pendingConflicts`；resolve merge/replace 正確；壞 jar → toast error 且其他 jar 照常加入；editEntry 後（fake timers）存入 DB，`init()` 可讀回；removeMod 從 DB 刪除。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add workspace store with indexeddb persistence`。

### Task 8: 版面、拖放區、模組清單、Toast

**Files:**
- Create: `src/ui/DropZone.tsx`, `ModList.tsx`, `Toast.tsx`, `ConflictDialog.tsx`, `ConfirmButton.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/ModList.test.tsx`, `src/ui/DropZone.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace`, `useToasts`, `projectStats`, `t`

版面：頂部標題列（標題、匯出按鈕、清空工作區）；左側 ModList；右側主編輯區；無模組時主區顯示 DropZone，有模組時左欄頂部顯示小型「加入 jar」按鈕。DropZone 接受拖放與 `<input type=file multiple accept=".jar,.zip">`。

測試案例：ModList 顯示名稱、版本、`已翻譯/總數 · %`，點擊呼叫 setActive；DropZone 選檔後呼叫 addJars；ConflictDialog 顯示並呼叫 resolveConflict。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add layout, drop zone and mod list`。

### Task 9: 翻譯表格與篩選

**Files:**
- Create: `src/ui/TranslationTable.tsx`, `TranslationRow.tsx`, `FilterBar.tsx`, `src/ui/filterEntries.ts`
- Test: `src/ui/filterEntries.test.ts`, `src/ui/TranslationTable.test.tsx`

**Interfaces:**
- Produces:
  - `type StatusFilter = 'all' | 'untranslated' | 'translated' | 'warning' | 'new'`
  - `interface SearchHit { readonly modId: string; readonly entry: TranslationEntry }`
  - `filterEntries(mods: readonly ModProject[], opts: { scope: 'current'|'all'; activeModId: string|null; query: string; status: StatusFilter }): SearchHit[]`（不分大小寫比對 key/source/target；排除 obsolete）

表格：虛擬捲動；欄位 Key / 原文 / 參考（可切換顯示）/ 譯文 textarea / 狀態圖示 + 格式碼警告說明；`Enter` 提交並聚焦下一列、`Shift+Enter` 換行、`Ctrl+↑/↓` 移動；「複製原文」按鈕。scope=all 時列上顯示 modId。

測試案例：filterEntries 各 status、query 比對三欄、scope all 跨模組；表格編輯後呼叫 editEntry；Enter 移焦點。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add translation table with search and filters`。

### Task 10: 匯出對話框

**Files:**
- Create: `src/ui/ExportDialog.tsx`, `src/ui/download.ts`
- Test: `src/ui/ExportDialog.test.tsx`

**Interfaces:**
- Consumes: `exportProjects`, `PACK_FORMATS`, `projectStats`
- Produces: `downloadBlob(result: ExportResult): void`

內容：模組勾選（預設全選）、類型 radio、未翻譯處理 radio、MC 版本下拉（僅資源包類型顯示）、描述欄；若勾選模組格式碼警告總數 > 0，顯示提示文字；未勾選任何模組時匯出按鈕停用。

測試案例：預設全選；取消全部 → 按鈕停用；有警告顯示數量；按匯出呼叫 `exportProjects` 並傳正確選項（mock）。

- [ ] Step 1–3: 測試 → 實作 → commit `feat: add export dialog`。

### Task 11: E2E、CI、README

**Files:**
- Create: `playwright.config.ts`, `e2e/fixtures/makeFixtures.ts`, `e2e/main-flow.spec.ts`, `.github/workflows/deploy.yml`, `README.md`

E2E：產生兩個 fixture jar → 上傳 → 翻譯兩筆 → reload 確認保留 → 開匯出 → 下載合併資源包 → JSZip 讀取驗證 `assets/<id>/lang/zh_tw.json` 內容。

CI：push main → `npm ci`、`npm run lint`、`npm run test:coverage`、`npm run build`、部署 Pages。

README（繁中）：功能、使用方式、開發指令、資料隱私說明。

- [ ] Step 1: 寫 E2E → 執行 `npx playwright test` 通過。
- [ ] Step 2: 加 CI 與 README。
- [ ] Step 3: commit `test: add e2e main flow; ci: add pages deploy`。
