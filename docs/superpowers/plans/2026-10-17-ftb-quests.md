# FTB 任務翻譯 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 MC 1.21 以上整合包的 FTB Quests 任務文字（任務書、章節群組、章節、任務的標題／副標／說明）以 `data/modpacks/<id>/ftbquests/{en_us,zh_tw}.json` 收錄：`add:modpack` 從整合包壓縮檔讀出英文（lang 單檔、lang 資料夾或只有章節檔），`validate:data` 驗證，網站顯示「FTB 任務」進度，一鍵下載改為「`resourcepacks/` 資源包＋`config/` 任務翻譯＋安裝說明」的兩部分 zip，翻譯工具可載入、編輯（多行）、匯出與投稿任務翻譯。

**Architecture:** `packages/core/src/ftbquests/` 是純函式：容錯的 SNBT 讀取器（`parseSnbt`，同時接受 FTB Library 的 SNBT 與 FTB Quests 26.x 的 JSON5 寫法）、lang 檔讀寫（`readQuestLang`／`questLangText`，清單欄位以 `\n` 合併／拆回；輸出同時是合法 SNBT、JSON5 與 JSON）、舊式章節檔抽取（`extractLegacyQuests`，依 FTB Quests `BaseQuestFile.handleLegacy*` 與 `readID` 規則）、任務格式碼（`checkQuestFormat`）、`modpack.json` 的 `ftbquests` schema 與驗證、翻譯工具的任務專案（`modpack-quests:<id>`，`ModProject.questLayout` 記住輸出格式）。`packages/core/src/export/` 的 `exportProjects` 遇到任務專案時改輸出兩部分結構（`buildBundle`），網站一鍵下載也用 `buildBundle`。`packages/core/src/modpackImport/` 在讀取壓縮檔時一併讀 `overrides/config/ftbquests/quests/`（同一個解壓大小上限），`planQuestWrite` 沿用 KubeJS 的聯集規則，`runAddModpack` 寫入 `ftbquests/en_us.json`；`packages/core/src/node/loadModpacks.ts` 載入並驗證 `ftbquests/`。網站在建置時計算任務進度並輸出 API；下載與翻譯工具都在瀏覽器內以 zod 驗證 payload 後處理。

**Tech Stack:** TypeScript、zod 4、JSZip、Vitest（core: node；site: jsdom＋Testing Library＋fake-indexeddb）、Astro、React 18、zustand、Playwright（wrangler dev）、tsx（腳本）。

**Spec:** docs/superpowers/specs/2026-10-17-ftb-quests-design.md

## Global Constraints

- 只支援 MC 1.21 以上（FTB Quests 2100 起）的整合包；MC < 1.21 不處理任務文字，網站顯示「此版本的任務暫不支援翻譯」。
- 資料：`data/modpacks/<id>/ftbquests/en_us.json`（英文原文，由 `add:modpack` 產生，不手動修改）、選填 `ftbquests/zh_tw.json`（譯文；每個 key 都必須存在於 `en_us.json`）；`ftbquests/` 只接受這兩個檔案。
- key 規則：`^(quest|chapter|chapter_group|file)\.[0-9A-F]{16}\.(title|quest_subtitle|quest_desc|chapter_subtitle)$`。
- 清單欄位（`quest_desc`、`chapter_subtitle`）以 `\n` 合併成一條文字；輸出時再依 `\n` 拆回清單（`\r\n` 視同 `\n`）；中文行數可與英文不同；空字串、空清單不收錄。
- `modpack.json` 新增選填欄位 `"ftbquests": { "status": "supported", "layout": "single" }`；`status` 為 `supported`（MC ≥ 1.21 且有任務文字）或 `unsupported-version`（MC < 1.21 但整合包含 FTB Quests 任務檔）；`layout`（`single`＝`lang/<locale>.snbt`、`split`＝`lang/<locale>/` 資料夾）只在 `supported` 時存在；只有章節檔時記為 `single`；沒有任務檔時不寫此欄位。
- 腳本讀取 `overrides/config/ftbquests/quests/`：1. 有 `lang/en_us.snbt` → `single`；2. 否則有 `lang/en_us/**.snbt` → 全部讀取合併，`split`；3. 都沒有但有 `chapters/*.snbt` → 依 FTB 自動轉換規則抽出文字（章節 `title`／`subtitle`、任務 `title`／`subtitle`／`description`、`chapter_groups.snbt` 的群組 `title`、`data.snbt` 的任務書 `title`），`single`。
- MC < 1.21：略過任務文字（不解析），有任務檔時寫入 `status: unsupported-version` 並印出提示。
- SNBT 讀取器支援：換行分隔、逗號可省略、未加引號的 key、雙引號（與單引號）字串與跳脫、`1L`／`1b`／`1.0d` 數字字尾、`[I; …]` 型別陣列、註解；解析失敗以清楚訊息（檔案路徑＋行號）結束，不寫入任何檔案；所有讀取的任務檔都計入 4b 的解壓大小上限（`ArchiveReadOptions.maxUncompressedBytes`，預設 `MAX_UNCOMPRESSED_BYTES`）。
- 新增：建立 `ftbquests/en_us.json`。更新：同 KubeJS（新 key 加入、原文不同列為差異並保留既有原文、格式碼改變則整次拒絕寫入），不動 `zh_tw.json`；同時更新 `modpack.json` 的 `ftbquests`。
- 格式碼（翻譯須保留）：`&` 顏色碼（`&a`、`&#RRGGBB`、`&z`）與 `\&`、`{@pagebreak}`、`{image:…}`、`{某.key}` 引用、以 `{"` 或 `["` 開頭的整行 JSON 文字元件；不一致為 warning；換行數量不必相同；`{@pagebreak}` 與整行 JSON 在拆行後須各自獨立成一行，否則為 warning。
- 驗證（`validate:data`）：`ftbquests/*.json` 頂層不是字串物件 → error；key 不符規則 → error；`zh_tw.json` 的 key 不在 `en_us.json` → error；格式碼不一致 → warning；術語表 → 依術語 level；`modpack.json` 的 `ftbquests` 不符 schema、`supported` 卻沒有 `en_us.json`、`unsupported-version` 卻有 `ftbquests/` 資料夾 → error；以 `modpacks/<id>/ftbquests/…` 路徑回報 GitHub 註記；有 error 的整合包不出現在網站（沿用 4b）。
- 網站：整合包頁在 KubeJS 進度旁新增任務翻譯進度（已翻條目／總條目）；`unsupported-version` 顯示「此版本的任務暫不支援翻譯」；無任務文字不顯示；目錄頁卡片加上任務進度。
- 一鍵下載 `<id>-zh_tw-<mcVersion>.zip`（不論有沒有任務文字都是兩部分結構）：`安裝說明.txt`、`resourcepacks/<id>-zh_tw.zip`（原本的合併資源包）、`config/ftbquests/quests/lang/zh_tw.snbt`（`single`）或 `config/ftbquests/quests/lang/zh_tw/modlangforge.snbt`（`split`）；任務檔只含已翻譯條目；沒有任務翻譯時省略 config 部分；安裝說明（台灣繁中、玩家用語）：解壓到整合包資料夾、在「選項 → 資源包」啟用資源包、伺服器遊玩時任務檔需放在伺服器的 `config/`。4b 的行為維持：未翻譯的 KubeJS 條目不寫入資源包。
- SNBT 輸出器：core 純函式，正確跳脫 `"`、`\`、換行；輸出可被 SNBT 讀取器讀回相同內容。
- API：`/api/v1/modpacks/<id>.json` 加上 `ftbquests: { status, layout, en_us, zh_tw }`（`unsupported-version` 只有 `status`；無則省略）；`index.json` 摘要加上 `ftbquests`（`supported` 含 `total`／`translated`／`percent`；`unsupported-version` 只有 `status`；無則 `null`）。
- 翻譯工具：整合包有 `supported` 任務文字時另建專案，ID `modpack-quests:<id>`、顯示名稱「<整合包名>（FTB 任務）」；重新載入套用與模組相同的合併規則；清單欄位在編輯框以多行文字呈現；資源包／語言檔匯出輸出 `config/ftbquests/quests/lang/zh_tw.snbt`（`split` 輸出資料夾格式），合併資源包時使用兩部分結構；投稿檔輸出 `modpacks/<id>/ftbquests/zh_tw.json` 與說明。
- 不在範圍：MC 1.20.1 的任務文字、Quest Lang Files 等附加模組、獎勵表／任務項目（task）／獎勵（reward）的自訂標題、展開舊式 `{key}` 引用（原樣保留）、每週自動追蹤整合包新版本、直接上傳 FTB Quests 檔案到翻譯工具。
- 4b 既有行為不變：分開的資源包不合併命名空間；CurseForge API 請求使用 `redirect: 'error'`；金鑰只送往 `api.curseforge.com`。
- 網站文字：台灣繁中、玩家用語（modpack＝整合包；合併功能＝「合併資源包」；FTB Quests＝「FTB 任務」）；只用既有語意色彩 token（`text-muted`、`text-warn`、`text-danger`、`border-line`、`bg-warn-soft`…）。
- 不可變：所有函式回傳新物件／陣列，不修改輸入；以未受信任名稱查表一律 `Object.hasOwn`；檔案 200–400 行為主、最多 800 行；所有外部資料（壓縮檔內容、`data/` 檔案、站內 API payload）以 zod 或既有驗證函式驗證。
- 不重複 helper：沿用 `isMissing`／`parseJsonText`（`node/fsErrors`）、`langIssues`／`translationKeyIssues`（`catalog/validateMod`）、`checkTokens`（`validate/formatCodes`）、`findKeyConflicts`（`pipeline/addSourceVersion`）、`CHIP_CLASS`、`e2e/helpers.ts`、`fakeFetch`、`modpackFixtures`；壓縮檔檔案清單斷言用新的 `zipFileNames`（`packages/core/src/test/zipFiles.ts`），測試一律斷言 zip 的完整檔案集合。
- TDD：每個 task 先寫失敗的測試、執行並記錄 RED，再實作到 PASS。core 覆蓋率（`npm run test:coverage -w @mlf/core`）維持 ≥ 80%。
- 驗證指令：`npm test`（site 為 `npm test -w @mlf/site`）、`npm run lint`、`npm run typecheck -w @mlf/core`、`npm run typecheck -w @mlf/site`、`npm run validate:data`、`npm run test:coverage -w @mlf/core`；E2E：`npm run build && E2E_PORT=8797 npm run test:e2e`（需要 `.dev.vars`：`cp .dev.vars.example .dev.vars`；`PUBLIC_SUGGEST_ENABLED` 已不存在）。
- CurseForge 金鑰：絕不寫死、印出或提交；測試只用 `fakeFetch` 與假金鑰 `CF_FAKE_KEY`；絕不對網路執行真實的 `add:modpack`；絕不讀取 `.env`。
- Commit：英文 Conventional Commits；絕不加 `Claude-Session` trailer、`Co-Authored-By` 或任何 claude.ai 連結。PR 標題 `feat: <繁中>`，說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填）。
- 換行：repo 檔案一律 LF。每次 commit 前確認 `git diff --cached --stat` 與 `git diff --cached --ignore-cr-at-eol --stat` 輸出相同（不同代表寫入了 CRLF，先轉回 LF）。git 指令一律在 worktree 根目錄逐條執行（不用 `cd … &&` 串接、不用 `git -C`）。

## FTB Quests 原始碼確認（抽取與 SNBT 規則依據）

| 事實 | 來源（FTBTeam GitHub，2026-10-17 讀取） | 本計畫的做法 |
|---|---|---|
| key = `String.format("%s.%s.%s", object.getObjectType().getId(), getCodeString(object), subKey.getName())`；`getCodeString` = `String.format("%016X", id)` | FTB-Quests `1.21.1/main` `quest/translation/TranslationManager.java`（`makeKey`）、`quest/QuestObjectBase.java` | key 規則同 spec；ID 一律輸出 16 位大寫十六進位 |
| `TranslationKey`：`title`（字串）、`quest_subtitle`（字串）、`quest_desc`（清單）、`chapter_subtitle`（清單） | `main` `quest/translation/TranslationKey.java` | `isListKey` 只認 `quest_desc`／`chapter_subtitle` |
| 物件類型 id：`file`、`chapter`、`quest`、`chapter_group`（另有 `task`、`reward`、`reward_table`、`quest_link`、`image`） | `1.21.1/main` `quest/QuestObjectType.java` | 只收前四種；其餘 key 略過並計入提示 |
| 任務書本身 ID 為 1（`super(1L)`） | `1.21.1/main` `quest/BaseQuestFile.java` | 任務書標題 key 為 `file.0000000000000001.title` |
| 1.21.1／1.21.11：`lang/` 底下只讀 `^\w+\.snbt$` 的平面檔，locale 取檔名第一個點之前並轉小寫 | `1.21.1/main`、`1.21.11/main` `TranslationManager.loadFromNBT`（`LANG_FILE_PAT`） | `lang/en_us.snbt` 比對不分大小寫 |
| 26.x（`main`）：`Files.walk(lang/<locale>)` 遞迴讀取所有 `.snbt` 並合併；檔案內容以 Json5Util 讀寫 | `main` `quest/translation/TranslationTable.loadAndCombine`、`TranslationManager.loadFromFile` | `split` 讀取 `lang/en_us/**.snbt`（依路徑排序，後讀到的同名 key 取代前者）；讀取器接受 JSON5 語法；輸出加逗號與引號，兩種讀取器都能讀 |
| 存檔時空字串（`!str.isEmpty()`）與空清單（`!list.isEmpty()`）不寫入；清單寫成字串 ListTag | `1.21.1/main` `TranslationTable.saveToNBT` | 空字串、空清單不收錄 |
| 舊式文字搬移：`data.snbt` 的 `title`（字串）→ 任務書 `TITLE`；`chapter_groups.snbt` 的 `chapter_groups[].title`（字串）→ 群組 `TITLE`；章節 `title`（字串）→ `TITLE`、`subtitle`（**清單**）→ `CHAPTER_SUBTITLE`；任務 `title`（字串）→ `TITLE`、`subtitle`（**字串**）→ `QUEST_SUBTITLE`、`description`（清單）→ `QUEST_DESC`；全部寫入 `en_us` | `1.21.1/main` `BaseQuestFile.handleLegacyFileNBT／ChapterGroupNBT／ChapterNBT／QuestNBT` | 型別不符的欄位略過（章節字串 subtitle、任務清單 subtitle 不收）；任務項目 `title` 不在範圍 |
| 章節檔：`Files.list(chapters)` 只看第一層 `.snbt`；章節的 `quests` 為 compound 清單 | `1.21.1/main` `BaseQuestFile.readDataFull` | 只讀 `chapters/*.snbt`（不遞迴），依路徑排序 |
| `readID`：數字 tag 直接用；字串 tag 以十六進位解析（可有前綴 `#`）；缺少、無法解析、0、1 或已被使用時產生隨機新 ID | `1.21.1/main` `BaseQuestFile.readID` | 缺少／無效／0／1／超出 `0x7FFFFFFFFFFFFFFF`／重複的物件無法對應翻譯 → 略過並提示 |
| SNBT 讀取：整行以 `//` 或 `#` 開頭為註解；`<= ' '` 皆為空白；`,` 可省略且可重複；key 可加單／雙引號或為簡單字元（字母、數字、`. _ - + ∞`），分隔符 `:` 或 `=`；跳脫只有 `\"` `\\` `\t` `\b` `\n` `\r` `\f`，其他跳脫字元**整個捨棄**；字串內不可有換行；數字字尾 `b s L f d`；`[B;`／`[I;`／`[L;` 型別陣列；`true`／`false`；非數字的未加引號字詞是字串 | FTB-Library `1.21.1/main` `snbt/SNBTParser.java`、`snbt/SNBTUtils.java` | 讀取器照做；另接受 JSON5 的 `\uXXXX`、`\'`、`\/`、行內 `//`、`/* */` 與結尾逗號（FTB SNBT 檔不會出現這些寫法，不影響相容） |
| 舊式 inline 欄位即使已有 lang 檔也會被搬入 `en_us` | `BaseQuestFile.readDataFull`（`handleLegacy*` 無條件執行） | **保守依 spec**：有 lang 檔時只讀 lang 檔（整合包同時附兩者的情況罕見；已在本表註明差異） |

無法確認：FTB Library 的 `SNBTUtils.isSimpleString` 細節（決定 FTB 寫檔時哪些字串不加引號）；讀取器因此一律把非數字的未加引號字詞當字串、數字字詞保留原文。

## Review Focus

1. SNBT 或 lang 檔中出現 `__proto__`、`constructor`、`toString` 之類的 key → 視為一般自有 key（不污染 prototype、查表用 `Object.hasOwn`），不符 key 規則者略過並計入提示。（Task 1 `keeps keys such as __proto__ and constructor as plain own entries`；Task 2 `skips prototype-named and out-of-scope keys`）
2. 惡意或損壞的任務檔（萬層巢狀、字串沒結尾、檔案在中途截斷、超大檔案）→ 以「檔案路徑＋第 N 行」的 `ModpackImportError` 結束、不發生堆疊溢位、不寫入任何檔案；任務檔與 KubeJS 檔共用同一個解壓大小上限。（Task 1 `rejects nesting deeper than 256 levels`；Task 9 `counts quest files against the shared decompressed budget`；Task 11 `does not write anything when a quest file cannot be parsed`）
3. 譯文含 `"`、`\`、`\&`、tab、`\r\n`、空行與 `{@pagebreak}` → 輸出的 SNBT 經讀取器讀回後內容相同（`\r\n` 統一為 `\n`、清單每行一個元素、空行保留）；輸出同時是合法 JSON（JSON5 讀取器也讀得懂）。（Task 2 `round-trips quotes, backslashes, tabs, CRLF and blank lines`）
4. 章節檔 ID 的邊界：`#` 前綴、小寫十六進位、數字 tag（`255L`）、缺少 ID、ID 為 `1`、超過 16 位、超出 long 範圍、兩個物件同 ID → 依 FTB `readID`：前三者正規化為 16 位大寫、其餘略過並提示（遊戲會重新產生 ID，翻譯無法對應）。（Task 4 `follows FTB readID for ids`）
5. 翻譯工具中舊的（IndexedDB 內沒有 `questLayout`）任務專案、或重新載入時整合包從 `single` 改成 `split` → 匯出時沒有 `questLayout` 視為 `single`，重新載入後改用新 layout，已翻內容保留。（Task 7 `treats stored projects without questLayout as single`；Task 8 `defaults to the single layout for stored projects without questLayout`；Task 15 `merges a reloaded quest project and follows the new layout`）

---

## File Structure

**Core：FTB 任務（純函式，瀏覽器可用，`@mlf/core/ftbquests`）**

| 檔案 | 職責 |
|---|---|
| `packages/core/src/ftbquests/snbt.ts` | `parseSnbt`、`SnbtValue`、`SnbtParseError`、`MAX_SNBT_DEPTH`、`field`／`stringField`／`listField`／`compounds` |
| `packages/core/src/ftbquests/keys.ts` | `QUEST_KEY_PATTERN`、`isQuestKey`、`isListKey`、`questKey`、`joinLines`、`splitLines` |
| `packages/core/src/ftbquests/snbtWrite.ts` | `quoteSnbt`、`writeSnbtLang` |
| `packages/core/src/ftbquests/schema.ts` | `QUEST_LAYOUTS`、`QuestLayout`、`ftbquestsMetaSchema`、`supportsQuestLang`、`questRecordSchema`、`questApiSchema` |
| `packages/core/src/ftbquests/langFile.ts` | `readQuestLang`、`questLangText`、`questLangPath`、`QUEST_LANG_DIR` |
| `packages/core/src/ftbquests/formatCodes.ts` | `extractQuestTokens`、`checkQuestFormat`、`hasQuestWarning`、`formatCheckFor` |
| `packages/core/src/ftbquests/ids.ts` | `questProjectId`、`parseQuestProjectId`、`isQuestProjectId` |
| `packages/core/src/ftbquests/extract.ts` | `questIdHex`、`extractLegacyQuests`、`FILE_OBJECT_ID` |
| `packages/core/src/ftbquests/validate.ts` | `QUESTS_DIR`、`QUEST_EN_FILE`、`QUEST_ZH_FILE`、`questFile`、`validateQuestData` |
| `packages/core/src/ftbquests/project.ts` | `questProject`、`mergeQuestProject`、`questLayoutOf`、`questTranslations`、`questStats`、`QUEST_MOD_ID` |
| `packages/core/src/ftbquests/index.ts` | 匯出 |
| `packages/core/src/types.ts`（修改） | `ModProject.questLayout?` |
| `packages/core/src/merge/stats.ts`（修改） | 任務專案用任務格式碼計算 warnings |
| `packages/core/src/catalog/validateMod.ts`（修改） | `translationKeyIssues` 可傳入格式碼檢查 |
| `packages/core/src/modpack/schema.ts`、`types.ts`、`validate.ts`（修改） | `ftbquests` 欄位、`QuestData`、`ftbquests/…` 問題路徑、MC 版本一致性 |
| `packages/core/src/export/questBundle.ts` | `buildBundle`、`questBundleFiles`、`installGuide`、`INSTALL_GUIDE_FILE` |
| `packages/core/src/export/buildResourcePack.ts`（修改） | 有任務專案時輸出兩部分結構／任務檔 |
| `packages/core/src/test/zipFiles.ts` | 測試用 `zipFileNames` |
| `packages/core/package.json`（修改） | 匯出 `./test/zipFiles` |

**Core：腳本邏輯（`@mlf/core/modpackImport`）與 Node 載入**

| 檔案 | 職責 |
|---|---|
| `packages/core/src/modpackImport/archiveContext.ts` | 自 `archive.ts` 搬出：`ArchiveContext`、`ArchiveReadOptions`、`openContext`、`readText` |
| `packages/core/src/modpackImport/questArchive.ts` | `readQuests`、`ImportedQuests`、`QuestRead`、`QUESTS_ROOT` |
| `packages/core/src/modpackImport/archive.ts`、`modrinth.ts`、`curseforge.ts`（修改） | 回傳／帶出任務文字與提示 |
| `packages/core/src/modpackImport/questPlan.ts` | `planQuestWrite`、`QuestChange`、`QUEST_CONFLICT_LABEL` |
| `packages/core/src/modpackImport/plan.ts`、`run.ts`（修改） | 任務英文與 `ftbquests` 欄位的新增／更新 |
| `packages/core/src/test/modpackFixtures.ts`（修改） | 1.21.1 index、任務檔 fixture、可帶入額外檔案 |
| `packages/core/src/node/modpackFs.ts` | 自 `loadModpacks.ts` 搬出：`listEntries`、`readJson` |
| `packages/core/src/node/loadQuests.ts` | `loadQuestDir`、`questMetaIssues` |
| `packages/core/src/node/loadModpacks.ts`（修改） | 載入 `ftbquests/`、`LoadedModpack.quests?` |
| `scripts/lib/modpackFiles.ts`、`scripts/add-modpack.ts`（修改） | 讀寫 `ftbquests/en_us.json`、印出任務變更 |

**Site**

| 檔案 | 職責 |
|---|---|
| `apps/site/src/lib/modpackSummary.ts`、`modpacks.ts`（修改） | `QuestSummary`、`questStats`、API `ftbquests` |
| `apps/site/src/components/ModpackCard.tsx`（修改） | 卡片任務進度 |
| `apps/site/src/pages/modpacks/[modpackId].astro`（修改） | 任務進度、不支援提示、安裝說明 |
| `apps/site/src/i18n/zh-TW.ts`（修改） | 網站文字 |
| `apps/site/src/islands/downloadModpack.ts`（修改） | 驗證任務 payload、兩部分 zip |
| `apps/site/src/translator/modpack/modpackIndex.ts`（修改） | 有任務文字的整合包也列出 |
| `apps/site/src/translator/store/workspaceStore.ts`（修改） | 建立／合併任務專案 |
| `apps/site/src/translator/ui/TranslationRow.tsx`、`TranslationTable.tsx`、`Editor.tsx`、`filterEntries.ts`（修改） | 多行編輯、依專案選格式碼檢查 |
| `apps/site/src/translator/ui/contribution.ts`（修改） | 投稿檔 `modpacks/<id>/ftbquests/zh_tw.json` |
| `apps/site/src/translator/i18n/zh-TW.ts`（修改） | 翻譯工具文字 |

**資料、E2E、文件**

| 檔案 | 職責 |
|---|---|
| `data/modpacks/example-quests/**` | 新的測試專用範例整合包（MC 1.21.1、`single`）；`example-pack` 維持 1.20.1／pack_format 15，只加上 `"ftbquests": { "status": "unsupported-version" }` |
| `e2e/modpacks.spec.ts`、`e2e/site.spec.ts`（修改） | 兩部分下載、任務頁、翻譯工具任務流程 |
| `data/README.md`、`CONTRIBUTING.md`、`README.md`（修改） | 文件 |

---

### Task 1: SNBT 讀取器（pure core (full code given)）

**Files:**
- Create: `packages/core/src/ftbquests/snbt.ts`
- Create: `packages/core/src/ftbquests/index.ts`
- Test: `packages/core/src/ftbquests/snbt.test.ts`

**Interfaces:**
- Consumes: `stripBom`（`lang/types`）
- Produces:
  - `type SnbtValue = { kind: 'string'; value } | { kind: 'number'; raw } | { kind: 'boolean'; value } | { kind: 'null' } | { kind: 'list'; items: readonly SnbtValue[] } | { kind: 'array'; type: SnbtArrayType; items: readonly string[] } | { kind: 'compound'; entries: Readonly<Record<string, SnbtValue>> }`
  - `type SnbtArrayType = 'B' | 'I' | 'L'`、`type SnbtCompound`
  - `class SnbtParseError extends Error { readonly line: number }`（訊息 `第 N 行：<原因>`）
  - `MAX_SNBT_DEPTH = 256`
  - `parseSnbt(text: string): SnbtCompound`
  - `field(c: SnbtCompound, name: string): SnbtValue | undefined`、`stringField(c, name): string | undefined`、`listField(c, name): readonly SnbtValue[] | undefined`、`compounds(items: readonly SnbtValue[] | undefined): SnbtCompound[]`

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/snbt.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { compounds, listField, MAX_SNBT_DEPTH, parseSnbt, SnbtParseError, stringField } from './index';

const str = (value: string) => ({ kind: 'string', value });
const num = (raw: string) => ({ kind: 'number', raw });

describe('parseSnbt', () => {
  it('reads FTB-style files: newlines instead of commas, unquoted keys, suffixes, typed arrays and comments', () => {
    const text = [
      '# FTB Quests chapter',
      '{',
      '\tid: "44A5523F7A909209"',
      '\tgroup: ""',
      '\torder_index: 0',
      '\tsize: 1.0d',
      '\tcount: 3L',
      '\thide: false',
      '\tflags: [I; 1, 2 3]',
      '\t// a comment line',
      '\ttitle = Mining',
      '\tsubtitle: [',
      '\t\t"Line one"',
      '\t\t"Line two",,',
      '\t]',
      '\t/* block */ empty: {}',
      '}',
    ].join('\n');
    expect(parseSnbt(text)).toEqual({
      kind: 'compound',
      entries: {
        id: str('44A5523F7A909209'), group: str(''), order_index: num('0'), size: num('1.0d'), count: num('3L'),
        hide: { kind: 'boolean', value: false }, flags: { kind: 'array', type: 'I', items: ['1', '2', '3'] },
        title: str('Mining'), subtitle: { kind: 'list', items: [str('Line one'), str('Line two')] },
        empty: { kind: 'compound', entries: {} },
      },
    });
  });

  it('accepts the JSON5 style used by split lang files', () => {
    const c = parseSnbt('{\n  "a": "x", // trailing comment\n  "b": ["y", "z",],\n}\n');
    expect(c.entries).toEqual({ a: str('x'), b: { kind: 'list', items: [str('y'), str('z')] } });
  });

  it('handles quotes and escapes like FTB Library, plus \\u escapes', () => {
    const c = parseSnbt(String.raw`{ a: "q\"b\\s\tt\nn", b: 'it\'s "ok"', c: "café", d: "\\&a", e: "x\&y", "quoted key": 1b }`);
    expect(c.entries).toEqual({
      a: str('q"b\\s\tt\nn'), b: str('it\'s "ok"'), c: str('café'), d: str('\\&a'), e: str('xy'), 'quoted key': num('1b'),
    });
  });

  it('keeps keys such as __proto__ and constructor as plain own entries', () => {
    const c = parseSnbt('{ __proto__: "x", constructor: "y", toString: [] }');
    expect(Object.getPrototypeOf(c.entries)).toBe(Object.prototype);
    expect(Object.keys(c.entries)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(stringField(c, '__proto__')).toBe('x');
    expect(stringField(c, 'constructor')).toBe('y');
    expect(stringField(c, 'valueOf')).toBeUndefined();
    expect(listField(c, 'toString')).toEqual([]);
  });

  it('lets a repeated key replace the earlier value and strips a BOM', () => {
    expect(stringField(parseSnbt('﻿{ a: "1"\n a: "2" }'), 'a')).toBe('2');
  });

  it.each([
    ['{\n\ta: "abc\n}', '第 2 行：字串缺少結尾的引號（字串不可跨行）'],
    ['{\n\ta: 1\n', '第 1 行：缺少結尾的 }'],
    ['{ a: [1, 2', '第 1 行：缺少結尾的 ]'],
    ['{ a 1 }', '第 1 行：「a」後面應該是冒號'],
    ['{ a: @ }', '第 1 行：無法辨識的字元「@」'],
    ['[1, 2]', '第 1 行：最外層必須是 { } 物件'],
    ['{ a: 1 } b', '第 1 行：結尾有多餘的內容'],
    ['', '第 1 行：檔案意外結束'],
    ['{ a: [I; 1, "x"] }', '第 1 行：型別陣列只能放數字'],
    ['{ /* never closed', '第 1 行：註解缺少結尾的 */'],
  ])('reports %j with a line number', (text, message) => {
    expect(() => parseSnbt(text)).toThrow(SnbtParseError);
    expect(() => parseSnbt(text)).toThrow(message);
  });

  it(`rejects nesting deeper than ${MAX_SNBT_DEPTH} levels instead of overflowing the stack`, () => {
    const deep = `{ a: ${'['.repeat(10_000)}${']'.repeat(10_000)} }`;
    expect(() => parseSnbt(deep)).toThrow(`第 1 行：巢狀超過 ${MAX_SNBT_DEPTH} 層`);
  });
});

describe('field helpers', () => {
  it('reads typed fields and keeps only compounds from lists', () => {
    const c = parseSnbt('{ s: "x", n: 1, l: [{ a: 1 }, "skip", { b: 2 }] }');
    expect(stringField(c, 'n')).toBeUndefined();
    expect(listField(c, 's')).toBeUndefined();
    expect(compounds(listField(c, 'l')).map((x) => Object.keys(x.entries))).toEqual([['a'], ['b']]);
    expect(compounds(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/snbt.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`（`ftbquests/` 尚未建立）。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/ftbquests/snbt.ts`**

```ts
import { stripBom } from '../lang/types';

export type SnbtArrayType = 'B' | 'I' | 'L';

/** SNBT 值；數字保留原始文字（含字尾），避免 long 失去精度 */
export type SnbtValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly raw: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' }
  | { readonly kind: 'list'; readonly items: readonly SnbtValue[] }
  | { readonly kind: 'array'; readonly type: SnbtArrayType; readonly items: readonly string[] }
  | { readonly kind: 'compound'; readonly entries: Readonly<Record<string, SnbtValue>> };

export type SnbtCompound = Extract<SnbtValue, { readonly kind: 'compound' }>;

export class SnbtParseError extends Error {
  readonly line: number;

  constructor(line: number, reason: string) {
    super(`第 ${line} 行：${reason}`);
    this.name = 'SnbtParseError';
    this.line = line;
  }
}

/** 巢狀上限：避免惡意檔案造成堆疊溢位 */
export const MAX_SNBT_DEPTH = 256;

/** FTB Library SNBTUtils 的跳脫字元，加上 JSON5 的 \' 與 \/ */
const ESCAPES: Readonly<Record<string, string>> = { '"': '"', "'": "'", '\\': '\\', '/': '/', t: '\t', b: '\b', n: '\n', r: '\r', f: '\f' };
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[bBsSlLfFdD]?$/;
/** FTB Library SNBTUtils.isSimpleCharacter：字母、數字、. _ - + ∞ */
const WORD_CHAR = /^[\p{L}\p{N}._+\-∞]$/u;
const ARRAY_TYPES: Readonly<Record<string, SnbtArrayType>> = { B: 'B', b: 'B', I: 'I', i: 'I', L: 'L', l: 'L' };
const KEYWORDS: Readonly<Record<string, SnbtValue>> = {
  true: { kind: 'boolean', value: true },
  false: { kind: 'boolean', value: false },
  null: { kind: 'null' },
  end: { kind: 'null' },
  END: { kind: 'null' },
};

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

class Parser {
  private readonly text: string;
  private pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  error(reason: string, at: number = this.pos): SnbtParseError {
    let line = 1;
    for (let i = 0; i < at && i < this.text.length; i += 1) {
      if (this.text[i] === '\n') line += 1;
    }
    return new SnbtParseError(line, reason);
  }

  private peek(offset = 0): string | undefined {
    return this.text[this.pos + offset];
  }

  /** 略過空白與註解（# 與 // 到行尾、區塊註解） */
  private skip(): void {
    for (;;) {
      const c = this.peek();
      if (c === undefined) return;
      if (c <= ' ') {
        this.pos += 1;
      } else if (c === '#' || (c === '/' && this.peek(1) === '/')) {
        const end = this.text.indexOf('\n', this.pos);
        this.pos = end === -1 ? this.text.length : end + 1;
      } else if (c === '/' && this.peek(1) === '*') {
        const end = this.text.indexOf('*/', this.pos + 2);
        if (end === -1) throw this.error('註解缺少結尾的 */');
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  /** 元素之間的逗號可省略、可重複 */
  private separators(): void {
    for (;;) {
      this.skip();
      if (this.peek() !== ',') return;
      this.pos += 1;
    }
  }

  value(depth: number): SnbtValue {
    if (depth > MAX_SNBT_DEPTH) throw this.error(`巢狀超過 ${MAX_SNBT_DEPTH} 層`);
    this.skip();
    const c = this.peek();
    if (c === undefined) throw this.error('檔案意外結束');
    if (c === '{') return this.compound(depth + 1);
    if (c === '[') return this.collection(depth + 1);
    if (c === '"' || c === "'") return { kind: 'string', value: this.quoted() };
    return this.word();
  }

  private compound(depth: number): SnbtCompound {
    const start = this.pos;
    this.pos += 1;
    const entries = new Map<string, SnbtValue>();
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 }', start);
      if (c === '}') {
        this.pos += 1;
        // Object.fromEntries 以自有屬性建立，__proto__ 等 key 不會改到 prototype
        return { kind: 'compound', entries: Object.fromEntries(entries) };
      }
      const key = c === '"' || c === "'" ? this.quoted() : this.wordText();
      this.skip();
      const sep = this.peek();
      if (sep !== ':' && sep !== '=') throw this.error(`「${key}」後面應該是冒號`);
      this.pos += 1;
      entries.set(key, this.value(depth));
    }
  }

  private collection(depth: number): SnbtValue {
    const start = this.pos;
    const type = own(ARRAY_TYPES, this.peek(1) ?? '');
    if (type !== undefined && this.peek(2) === ';') {
      this.pos += 3;
      return this.array(type, depth, start);
    }
    this.pos += 1;
    const items: SnbtValue[] = [];
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 ]', start);
      if (c === ']') {
        this.pos += 1;
        return { kind: 'list', items };
      }
      items.push(this.value(depth));
    }
  }

  private array(type: SnbtArrayType, depth: number, start: number): SnbtValue {
    const items: string[] = [];
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 ]', start);
      if (c === ']') {
        this.pos += 1;
        return { kind: 'array', type, items };
      }
      const item = this.value(depth);
      if (item.kind !== 'number') throw this.error('型別陣列只能放數字');
      items.push(item.raw);
    }
  }

  private quoted(): string {
    const quote = this.peek();
    const start = this.pos;
    this.pos += 1;
    const parts: string[] = [];
    for (;;) {
      const c = this.peek();
      if (c === undefined || c === '\n') throw this.error('字串缺少結尾的引號（字串不可跨行）', start);
      this.pos += 1;
      if (c === quote) return parts.join('');
      parts.push(c === '\\' ? this.escape(start) : c);
    }
  }

  /** 反斜線後的字元；依 FTB Library SNBTParser，未知的跳脫字元整個捨棄 */
  private escape(start: number): string {
    const e = this.peek();
    if (e === undefined) throw this.error('字串缺少結尾的引號（字串不可跨行）', start);
    this.pos += 1;
    const hex = this.text.slice(this.pos, this.pos + 4);
    if (e === 'u' && HEX4.test(hex)) {
      this.pos += 4;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    return own(ESCAPES, e) ?? '';
  }

  private wordText(): string {
    const start = this.pos;
    while (this.pos < this.text.length && WORD_CHAR.test(this.text[this.pos] ?? '')) this.pos += 1;
    if (this.pos === start) throw this.error(`無法辨識的字元「${this.peek() ?? ''}」`);
    return this.text.slice(start, this.pos);
  }

  /** 未加引號的字詞：關鍵字、數字（保留原文）或字串 */
  private word(): SnbtValue {
    const text = this.wordText();
    const keyword = own(KEYWORDS, text);
    if (keyword) return keyword;
    return NUMBER.test(text) ? { kind: 'number', raw: text } : { kind: 'string', value: text };
  }

  end(): void {
    this.skip();
    if (this.pos < this.text.length) throw this.error('結尾有多餘的內容');
  }
}

/** 讀取 FTB Quests 的 .snbt（FTB Library SNBT，也接受 JSON5）；最外層必須是 { } */
export function parseSnbt(text: string): SnbtCompound {
  const parser = new Parser(stripBom(text));
  const root = parser.value(0);
  if (root.kind !== 'compound') throw parser.error('最外層必須是 { } 物件', 0);
  parser.end();
  return root;
}

export function field(c: SnbtCompound, name: string): SnbtValue | undefined {
  return own(c.entries, name);
}

export function stringField(c: SnbtCompound, name: string): string | undefined {
  const v = field(c, name);
  return v?.kind === 'string' ? v.value : undefined;
}

export function listField(c: SnbtCompound, name: string): readonly SnbtValue[] | undefined {
  const v = field(c, name);
  return v?.kind === 'list' ? v.items : undefined;
}

export function compounds(items: readonly SnbtValue[] | undefined): SnbtCompound[] {
  return (items ?? []).flatMap((i) => (i.kind === 'compound' ? [i] : []));
}
```

- [ ] **Step 4: Create `packages/core/src/ftbquests/index.ts`**

```ts
export * from './snbt';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/ftbquests && npm run typecheck -w @mlf/core`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ftbquests
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): add tolerant SNBT reader for FTB Quests files"
```

---

### Task 2: 任務 key、lang 檔讀寫與 SNBT 輸出（pure core (full code given)）

**Files:**
- Create: `packages/core/src/ftbquests/keys.ts`
- Create: `packages/core/src/ftbquests/snbtWrite.ts`
- Create: `packages/core/src/ftbquests/schema.ts`（本 task 只放 layout；Task 5 擴充）
- Create: `packages/core/src/ftbquests/langFile.ts`
- Modify: `packages/core/src/ftbquests/index.ts`
- Test: `packages/core/src/ftbquests/langFile.test.ts`

**Interfaces:**
- Consumes: `parseSnbt`、`SnbtCompound`、`SnbtValue`（Task 1）
- Produces:
  - `QUEST_OBJECT_TYPES`、`QUEST_FIELDS`、`type QuestObjectType`、`type QuestField`、`QUEST_KEY_PATTERN`
  - `isQuestKey(key: string): boolean`、`isListKey(key: string): boolean`、`questKey(type: QuestObjectType, id: string, field: QuestField): string`
  - `joinLines(lines: readonly string[]): string`、`splitLines(text: string): string[]`（以 `/\r?\n/` 拆）
  - `quoteSnbt(text: string): string`、`type SnbtLangValue = string | readonly string[]`、`writeSnbtLang(entries: readonly (readonly [string, SnbtLangValue])[]): string`
  - `QUEST_LAYOUTS = ['single', 'split'] as const`、`type QuestLayout`
  - `QUEST_LANG_DIR = 'config/ftbquests/quests/lang'`、`questLangPath(layout: QuestLayout): string`
  - `interface QuestLangRead { texts: Readonly<Record<string, string>>; skipped: number }`、`readQuestLang(c: SnbtCompound): QuestLangRead`
  - `questLangText(translations: Readonly<Record<string, string>>): string`

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/langFile.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  isListKey, isQuestKey, joinLines, parseSnbt, questKey, questLangPath, questLangText, readQuestLang, splitLines, writeSnbtLang,
} from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const CHAPTER = 'chapter.1A2B3C4D5E6F7081.title';

describe('quest keys', () => {
  it('accepts only the four object types and four fields with a 16-digit upper-case id', () => {
    expect(isQuestKey(TITLE)).toBe(true);
    expect(isQuestKey('chapter_group.0F0F0F0F0F0F0F0F.title')).toBe(true);
    expect(isQuestKey('file.0000000000000001.title')).toBe(true);
    for (const bad of ['quest.44a5523f7a909209.title', 'quest.44A5523F7A90920.title', 'task.44A5523F7A909209.title', 'reward_table.44A5523F7A909209.title', 'quest.44A5523F7A909209.description']) {
      expect(isQuestKey(bad)).toBe(false);
    }
  });

  it('knows which fields are lists and joins or splits lines', () => {
    expect(isListKey(DESC)).toBe(true);
    expect(isListKey('chapter.1A2B3C4D5E6F7081.chapter_subtitle')).toBe(true);
    expect(isListKey(TITLE)).toBe(false);
    expect(questKey('chapter', '1A2B3C4D5E6F7081', 'title')).toBe(CHAPTER);
    expect(joinLines(['a', '', 'b'])).toBe('a\n\nb');
    expect(splitLines('a\r\nb\n\nc')).toEqual(['a', 'b', '', 'c']);
  });
});

describe('writeSnbtLang', () => {
  it('writes quoted keys, escaped strings and string lists separated by commas', () => {
    expect(writeSnbtLang([[TITLE, 'Say "hi" \\ bye'], [DESC, ['a', 'b']]])).toBe(
      `{\n\t"${TITLE}": "Say \\"hi\\" \\\\ bye",\n\t"${DESC}": [\n\t\t"a",\n\t\t"b"\n\t]\n}\n`,
    );
    expect(writeSnbtLang([[DESC, []]])).toBe(`{\n\t"${DESC}": []\n}\n`);
    expect(writeSnbtLang([])).toBe('{\n}\n');
  });
});

describe('readQuestLang', () => {
  it('joins list fields with \\n and drops empty strings and empty lists', () => {
    const c = parseSnbt([
      '{',
      `\t${TITLE}: "Welcome"`,
      `\t${DESC}: ["Line one", "", "Line two"]`,
      `\t${CHAPTER}: ""`,
      '\tchapter.1A2B3C4D5E6F7081.chapter_subtitle: []',
      '}',
    ].join('\n'));
    expect(readQuestLang(c)).toEqual({ texts: { [TITLE]: 'Welcome', [DESC]: 'Line one\n\nLine two' }, skipped: 0 });
  });

  it('skips prototype-named and out-of-scope keys and values of the wrong type', () => {
    const c = parseSnbt([
      '{',
      '\t__proto__: "x"',
      '\tconstructor: "y"',
      '\ttask.5555555555555555.title: "Task"',
      '\treward_table.6666666666666666.title: "Loot"',
      `\t${TITLE}: ["not", "a string"]`,
      `\t${DESC}: "not a list"`,
      '\tquest.7777777777777777.quest_desc: ["ok", 1]',
      `\t${CHAPTER}: "Kept"`,
      '}',
    ].join('\n'));
    const read = readQuestLang(c);
    expect(read).toEqual({ texts: { [CHAPTER]: 'Kept' }, skipped: 7 });
    expect(Object.getPrototypeOf(read.texts)).toBe(Object.prototype);
  });
});

describe('questLangText', () => {
  it('writes list fields back as string lists and skips empty or invalid entries', () => {
    const text = questLangText({ [TITLE]: '歡迎', [DESC]: '第一行\n第二行', [CHAPTER]: '', 'task.5555555555555555.title': 'x' });
    expect(text).toBe(`{\n\t"${TITLE}": "歡迎",\n\t"${DESC}": [\n\t\t"第一行",\n\t\t"第二行"\n\t]\n}\n`);
    expect(JSON.parse(text)).toEqual({ [TITLE]: '歡迎', [DESC]: ['第一行', '第二行'] });
  });

  it('round-trips quotes, backslashes, tabs, CRLF and blank lines', () => {
    const translations = {
      [TITLE]: 'Tab\there "q" \\& back\\slash',
      [DESC]: '第一行\r\n第二行\n\n{@pagebreak}\n{"text":"點我","color":"gold"}',
      [CHAPTER]: 'Two\r\nlines',
    };
    expect(readQuestLang(parseSnbt(questLangText(translations))).texts).toEqual({
      [TITLE]: 'Tab\there "q" \\& back\\slash',
      [DESC]: '第一行\n第二行\n\n{@pagebreak}\n{"text":"點我","color":"gold"}',
      [CHAPTER]: 'Two\nlines',
    });
  });
});

describe('questLangPath', () => {
  it('uses the single file or the split folder', () => {
    expect(questLangPath('single')).toBe('config/ftbquests/quests/lang/zh_tw.snbt');
    expect(questLangPath('split')).toBe('config/ftbquests/quests/lang/zh_tw/modlangforge.snbt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/langFile.test.ts`
Expected: FAIL — `isQuestKey is not a function`（尚未匯出）。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/ftbquests/keys.ts`**

```ts
export const QUEST_OBJECT_TYPES = ['quest', 'chapter', 'chapter_group', 'file'] as const;
export const QUEST_FIELDS = ['title', 'quest_subtitle', 'quest_desc', 'chapter_subtitle'] as const;

export type QuestObjectType = (typeof QUEST_OBJECT_TYPES)[number];
export type QuestField = (typeof QUEST_FIELDS)[number];

/**
 * `<類型>.<16 位十六進位 ID>.<欄位>`：FTB Quests TranslationManager.makeKey 為 `%s.%s.%s`，
 * ID 由 QuestObjectBase.getCodeString 以 `%016X` 輸出（大寫、補零到 16 位）。
 */
export const QUEST_KEY_PATTERN = /^(quest|chapter|chapter_group|file)\.[0-9A-F]{16}\.(title|quest_subtitle|quest_desc|chapter_subtitle)$/;

/** TranslationKey 中值為字串清單的欄位 */
const LIST_SUFFIXES = ['.quest_desc', '.chapter_subtitle'] as const;

export function isQuestKey(key: string): boolean {
  return QUEST_KEY_PATTERN.test(key);
}

export function isListKey(key: string): boolean {
  return LIST_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

export function questKey(type: QuestObjectType, id: string, field: QuestField): string {
  return `${type}.${id}.${field}`;
}

/** 清單欄位合併成一條文字（一行一個元素） */
export function joinLines(lines: readonly string[]): string {
  return lines.join('\n');
}

/** 一條文字拆回清單；\r\n 視同 \n */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}
```

- [ ] **Step 4: Create `packages/core/src/ftbquests/snbtWrite.ts`**

```ts
export type SnbtLangValue = string | readonly string[];

/** FTB Library SNBTUtils 的跳脫字元（\" \\ \t \b \n \r \f）；其餘字元原樣輸出 */
const ESCAPE_OUT: Readonly<Record<string, string>> = {
  '"': '\\"', '\\': '\\\\', '\t': '\\t', '\b': '\\b', '\n': '\\n', '\r': '\\r', '\f': '\\f',
};
const NEEDS_ESCAPE = /["\\\t\b\n\r\f]/g;

export function quoteSnbt(text: string): string {
  return `"${text.replace(NEEDS_ESCAPE, (c) => ESCAPE_OUT[c] ?? c)}"`;
}

function listText(lines: readonly string[]): string {
  return lines.length === 0 ? '[]' : `[\n${lines.map((line) => `\t\t${quoteSnbt(line)}`).join(',\n')}\n\t]`;
}

/**
 * 輸出 FTB 任務 lang 檔：key 一律加引號、項目以逗號分隔，
 * 因此同時是 FTB Library SNBT、JSON5（FTB Quests 26.x 的 lang 資料夾）與 JSON 都能讀的格式。
 */
export function writeSnbtLang(entries: readonly (readonly [string, SnbtLangValue])[]): string {
  if (entries.length === 0) return '{\n}\n';
  const body = entries.map(([key, value]) => `\t${quoteSnbt(key)}: ${typeof value === 'string' ? quoteSnbt(value) : listText(value)}`);
  return `{\n${body.join(',\n')}\n}\n`;
}
```

- [ ] **Step 5: Create `packages/core/src/ftbquests/schema.ts`**

```ts
/** single：lang/<locale>.snbt；split：lang/<locale>/ 資料夾（FTB Quests 26.x） */
export const QUEST_LAYOUTS = ['single', 'split'] as const;

export type QuestLayout = (typeof QUEST_LAYOUTS)[number];
```

- [ ] **Step 6: Create `packages/core/src/ftbquests/langFile.ts`**

```ts
import { isListKey, isQuestKey, joinLines, splitLines } from './keys';
import type { QuestLayout } from './schema';
import type { SnbtCompound, SnbtValue } from './snbt';
import { type SnbtLangValue, writeSnbtLang } from './snbtWrite';

export const QUEST_LANG_DIR = 'config/ftbquests/quests/lang';

/** 本站輸出的任務檔：single → lang/zh_tw.snbt；split → lang/zh_tw/modlangforge.snbt（與整合包自己的檔案並存） */
export function questLangPath(layout: QuestLayout): string {
  return layout === 'split' ? `${QUEST_LANG_DIR}/zh_tw/modlangforge.snbt` : `${QUEST_LANG_DIR}/zh_tw.snbt`;
}

export interface QuestLangRead {
  readonly texts: Readonly<Record<string, string>>;
  /** 不在翻譯範圍（例如 task、reward_table）或型別不符而略過的條目數 */
  readonly skipped: number;
}

/** 字串欄位必須是字串；清單欄位必須是全為字串的清單；其他回傳 null */
function entryText(key: string, value: SnbtValue): string | null {
  if (!isListKey(key)) return value.kind === 'string' ? value.value : null;
  if (value.kind !== 'list') return null;
  const lines = value.items.flatMap((i) => (i.kind === 'string' ? [i.value] : []));
  return lines.length === value.items.length ? joinLines(lines) : null;
}

/** lang 檔 → key→文字；清單欄位以 \n 合併；空字串與空清單不收錄 */
export function readQuestLang(c: SnbtCompound): QuestLangRead {
  const read = Object.entries(c.entries).map(([key, value]) => [key, isQuestKey(key) ? entryText(key, value) : null] as const);
  return {
    texts: Object.fromEntries(read.filter((r): r is readonly [string, string] => r[1] !== null && r[1] !== '')),
    skipped: read.filter(([, text]) => text === null).length,
  };
}

/** 譯文 → lang 檔文字；清單欄位依 \n 拆回字串清單；空字串與不符規則的 key 不輸出；\r\n 統一為 \n */
export function questLangText(translations: Readonly<Record<string, string>>): string {
  const entries = Object.entries(translations)
    .filter(([key, text]) => isQuestKey(key) && text !== '')
    .map(([key, text]): readonly [string, SnbtLangValue] => [key, isListKey(key) ? splitLines(text) : text.replace(/\r\n/g, '\n')]);
  return writeSnbtLang(entries);
}
```

- [ ] **Step 7: Export** — `packages/core/src/ftbquests/index.ts` 改為

```ts
export * from './snbt';
export * from './keys';
export * from './snbtWrite';
export * from './schema';
export * from './langFile';
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/ftbquests && npm run typecheck -w @mlf/core`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/ftbquests
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): read and write FTB Quests lang files"
```

---

### Task 3: 任務格式碼、任務專案 ID 與進度警告（pure core (full code given)）

**Files:**
- Create: `packages/core/src/ftbquests/formatCodes.ts`
- Create: `packages/core/src/ftbquests/ids.ts`
- Modify: `packages/core/src/ftbquests/index.ts`
- Modify: `packages/core/src/merge/stats.ts`（任務專案以任務格式碼計算 `warnings`）
- Test: `packages/core/src/ftbquests/formatCodes.test.ts`

**Interfaces:**
- Consumes: `checkTokens`、`checkFormat`、`FormatIssue`（`validate/formatCodes`）、`isValidModpackId`（`modpack/schema`）、`TranslationEntry`（`types`）
- Produces:
  - `PAGEBREAK = '{@pagebreak}'`、`PAGEBREAK_INLINE = '{@pagebreak}（需獨立一行）'`、`JSON_LINE = '整行 JSON 文字元件'`
  - `extractQuestTokens(text: string): string[]`、`checkQuestFormat(source: string, target: string): FormatIssue | null`、`hasQuestWarning(e: TranslationEntry): boolean`
  - `type FormatCheck = (source: string, target: string) => FormatIssue | null`、`formatCheckFor(projectId: string): FormatCheck`
  - `QUEST_PROJECT_PREFIX = 'modpack-quests'`、`questProjectId(modpackId: string): string`、`parseQuestProjectId(id: string): { modpackId: string } | null`、`isQuestProjectId(id: string): boolean`
  - `projectStats(p)`：`isQuestProjectId(p.id)` 時以 `hasQuestWarning` 計算 warnings（其餘不變）

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/formatCodes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildProject, projectStats } from '../merge';
import type { DetectedMod } from '../types';
import { checkFormat } from '../validate';
import {
  checkQuestFormat, extractQuestTokens, formatCheckFor, hasQuestWarning, isQuestProjectId, JSON_LINE, PAGEBREAK, PAGEBREAK_INLINE, parseQuestProjectId,
  questProjectId,
} from './index';

describe('extractQuestTokens', () => {
  it('finds colour codes, escaped ampersands, images and translation references', () => {
    expect(extractQuestTokens('&aHello &#FF00AA\\&b {image:ftbquests:textures/a.png width:50} {my.mod.key} {0} §Lbold &z')).toEqual([
      '&a', '&#ff00aa', '\\&', '{image:ftbquests:textures/a.png width:50}', '{my.mod.key}', '§l', '&z',
    ]);
  });

  it('only counts a page break that sits on its own line and marks whole-line JSON components', () => {
    expect(extractQuestTokens('Intro\n  {@pagebreak}  \nText {@pagebreak} more\n{"text":"Click","color":"gold"}\n["", {"text":"x"}]')).toEqual([
      PAGEBREAK, PAGEBREAK_INLINE, JSON_LINE, JSON_LINE,
    ]);
  });
});

describe('checkQuestFormat', () => {
  it('ignores the number of lines', () => {
    expect(checkQuestFormat('Line one\nLine two\nLine three', '第一行')).toBeNull();
  });

  it('reports missing colour codes, case-insensitively', () => {
    expect(checkQuestFormat('&aGreen', '綠色')).toEqual({ missing: ['&a'], extra: [] });
    expect(checkQuestFormat('&AGreen', '&a綠色')).toBeNull();
  });

  it('warns when a page break or JSON line no longer stands on its own line', () => {
    expect(checkQuestFormat('Intro\n{@pagebreak}\nMore', '介紹 {@pagebreak} 更多')).toEqual({ missing: [PAGEBREAK], extra: [PAGEBREAK_INLINE] });
    expect(checkQuestFormat('{"text":"Click"}', '請點 {"text":"點我"}')).toEqual({ missing: [JSON_LINE], extra: [] });
  });

  it('accepts an empty translation and ignores printf-like percent signs', () => {
    expect(checkQuestFormat('&aGreen', '')).toBeNull();
    expect(checkQuestFormat('50% chance', '50% 機率')).toBeNull();
  });

  it('flags entries and picks the checker by project id', () => {
    expect(hasQuestWarning({ key: 'k', source: '&aGo', target: '走', status: 'translated' })).toBe(true);
    expect(formatCheckFor('modpack-quests:example-pack')).toBe(checkQuestFormat);
    expect(formatCheckFor('create')).toBe(checkFormat);
    expect(formatCheckFor('modpack:example-pack:kubejs')).toBe(checkFormat);
  });
});

describe('quest project ids', () => {
  it('round-trips modpack-quests:<id>', () => {
    expect(questProjectId('example-pack')).toBe('modpack-quests:example-pack');
    expect(parseQuestProjectId('modpack-quests:example-pack')).toEqual({ modpackId: 'example-pack' });
    expect(isQuestProjectId('modpack-quests:example-pack')).toBe(true);
  });

  it.each([['create'], ['modpack-quests:'], ['modpack-quests:..'], ['modpack-quests:index'], ['modpack-quests:a:b'], ['modpack:a:b'], ['modpack-quests:A']])(
    'rejects %s', (id) => {
      expect(parseQuestProjectId(id)).toBeNull();
    },
  );
});

describe('projectStats for quest projects', () => {
  const detected: DetectedMod = {
    modId: 'ftbquests', name: 'q', version: '1', jarName: '', format: 'json',
    source: { a: 'Line one\nLine two' }, order: ['a'], zhTw: { a: '一行' },
  };

  it('uses the quest checker so a different number of lines is not a warning', () => {
    const plain = buildProject(detected, 1);
    expect(projectStats(plain).warnings).toBe(1);
    expect(projectStats({ ...plain, id: questProjectId('example-pack') }).warnings).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/formatCodes.test.ts`
Expected: FAIL — `extractQuestTokens is not a function`（尚未匯出）。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/ftbquests/ids.ts`**

```ts
import { isValidModpackId } from '../modpack/schema';

export const QUEST_PROJECT_PREFIX = 'modpack-quests';

/** 翻譯工具中整合包 FTB 任務專案的 ID；與模組（modId）及 KubeJS（modpack:<id>:<ns>）不會撞名 */
export function questProjectId(modpackId: string): string {
  return `${QUEST_PROJECT_PREFIX}:${modpackId}`;
}

export function parseQuestProjectId(id: string): { readonly modpackId: string } | null {
  const parts = id.split(':');
  if (parts.length !== 2 || parts[0] !== QUEST_PROJECT_PREFIX) return null;
  const modpackId = parts[1] ?? '';
  return isValidModpackId(modpackId) ? { modpackId } : null;
}

export function isQuestProjectId(id: string): boolean {
  return parseQuestProjectId(id) !== null;
}
```

- [ ] **Step 4: Create `packages/core/src/ftbquests/formatCodes.ts`**

```ts
import type { TranslationEntry } from '../types';
import { checkFormat, checkTokens, type FormatIssue } from '../validate/formatCodes';
import { isQuestProjectId } from './ids';

export const PAGEBREAK = '{@pagebreak}';
export const PAGEBREAK_INLINE = '{@pagebreak}（需獨立一行）';
export const JSON_LINE = '整行 JSON 文字元件';

/**
 * 行內格式碼：\&（字面 &，需先比對）、&#RRGGBB、&x 顏色／樣式碼（含 &z 彩虹）、§ 碼、
 * {@pagebreak}、{image:…}、含點的 {翻譯.key} 引用。不比對 %s 等 printf 佔位符（任務文字的 50% 不是格式碼）。
 */
const INLINE_TOKEN = /\\&|&#[0-9a-fA-F]{6}|&[0-9a-fk-orzA-FK-ORZ]|§#[0-9a-fA-F]{6}|§[0-9a-fk-orzA-FK-ORZ]|\{@pagebreak\}|\{image:[^{}\n]*\}|\{[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+\}/g;
const COLOR = /^[&§]/;
const JSON_START = /^\s*[{[]"/;

function normalize(token: string): string {
  if (token === PAGEBREAK) return PAGEBREAK_INLINE;
  return COLOR.test(token) ? token.toLowerCase() : token;
}

/** 單獨一行的 {@pagebreak} 才算換頁；以 {" 或 [" 開頭的行算一個整行 JSON 文字元件 */
function lineTokens(line: string): string[] {
  if (line.trim() === PAGEBREAK) return [PAGEBREAK];
  const json = JSON_START.test(line) ? [JSON_LINE] : [];
  return [...json, ...(line.match(INLINE_TOKEN) ?? []).map(normalize)];
}

/** 換行本身不是格式碼：中文行數可與英文不同 */
export function extractQuestTokens(text: string): string[] {
  return text.split(/\r?\n/).flatMap(lineTokens);
}

export function checkQuestFormat(source: string, target: string): FormatIssue | null {
  return checkTokens(source, target, extractQuestTokens);
}

export function hasQuestWarning(e: TranslationEntry): boolean {
  return checkQuestFormat(e.source, e.target) !== null;
}

export type FormatCheck = (source: string, target: string) => FormatIssue | null;

/** 語言檔條目的格式碼檢查：FTB 任務專案用任務格式碼，其餘用一般格式碼 */
export function formatCheckFor(projectId: string): FormatCheck {
  return isQuestProjectId(projectId) ? checkQuestFormat : checkFormat;
}
```

- [ ] **Step 5: Export** — `packages/core/src/ftbquests/index.ts` 改為

```ts
export * from './snbt';
export * from './keys';
export * from './snbtWrite';
export * from './schema';
export * from './langFile';
export * from './formatCodes';
export * from './ids';
```

- [ ] **Step 6: Use the quest checker in project stats** — `packages/core/src/merge/stats.ts`

在 import 區加入：

```ts
import { hasQuestWarning } from '../ftbquests/formatCodes';
import { isQuestProjectId } from '../ftbquests/ids';
```

把

```ts
/** 語言檔完成度（不含手冊） */
export function projectStats(p: ModProject): ProjectStats {
  return computeStats(p.entries, hasWarning);
}
```

改為

```ts
/** 語言檔完成度（不含手冊）；FTB 任務專案以任務格式碼判斷 warnings */
export function projectStats(p: ModProject): ProjectStats {
  return computeStats(p.entries, isQuestProjectId(p.id) ? hasQuestWarning : hasWarning);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core`
Expected: PASS（新測試與既有 merge／modpack 測試全過），typecheck 無錯誤

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ftbquests packages/core/src/merge/stats.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): check FTB Quests format codes and quest project ids"
```

---

### Task 4: 舊式章節檔抽取（pure core (full code given)）

**Files:**
- Create: `packages/core/src/ftbquests/extract.ts`
- Modify: `packages/core/src/ftbquests/index.ts`
- Test: `packages/core/src/ftbquests/extract.test.ts`

**Interfaces:**
- Consumes: `SnbtCompound`、`SnbtValue`、`field`、`stringField`、`listField`、`compounds`、`parseSnbt`（Task 1）、`questKey`、`joinLines`、`QuestField`、`QuestObjectType`（Task 2）
- Produces:
  - `FILE_OBJECT_ID = '0000000000000001'`
  - `questIdHex(value: SnbtValue | undefined): string | null`
  - `interface LegacyQuestBook { data?: SnbtCompound; chapterGroups?: SnbtCompound; chapters: readonly SnbtCompound[] }`
  - `interface LegacyQuests { texts: Readonly<Record<string, string>>; notes: readonly string[] }`
  - `extractLegacyQuests(book: LegacyQuestBook): LegacyQuests`（依 `data` → 章節群組 → 章節（依傳入順序）→ 各章節的任務的順序輸出）

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/extract.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { extractLegacyQuests, parseSnbt, questIdHex } from './index';

const DATA = parseSnbt('{\n\tversion: 13\n\ttitle: "Example Book"\n}');
const GROUPS = parseSnbt('{\n\tchapter_groups: [\n\t\t{ id: "0F0F0F0F0F0F0F0F", title: "Main" }\n\t\t{ id: "0E0E0E0E0E0E0E0E", title: "" }\n\t]\n}');
const CHAPTER = parseSnbt([
  '{',
  '\tid: "1A2B3C4D5E6F7081"',
  '\tgroup: "0F0F0F0F0F0F0F0F"',
  '\ttitle: "Getting Started"',
  '\tsubtitle: ["Your first steps", "in the pack"]',
  '\tquests: [',
  '\t\t{',
  '\t\t\tid: "44A5523F7A909209"',
  '\t\t\ttitle: "&aWelcome"',
  '\t\t\tsubtitle: "Read me"',
  '\t\t\tdescription: ["Line one", "", "{@pagebreak}", "Line two"]',
  '\t\t\ttasks: [{ id: "5555555555555555", type: "item", title: "Task title" }]',
  '\t\t}',
  '\t\t{ id: "#2b2b2b2b2b2b2b2b", title: "Lowercase id" }',
  '\t\t{ id: 255L, title: "Numeric id" }',
  '\t\t{ title: "No id" }',
  '\t\t{ id: "1", title: "Reserved id" }',
  '\t\t{ id: "44A5523F7A909209", title: "Duplicate" }',
  '\t\t{ id: "8000000000000000", title: "Too large" }',
  '\t\t{ id: "33333333333333333", title: "Too long" }',
  '\t\t{ id: "3333333333333333", subtitle: ["not a string"], description: "not a list" }',
  '\t]',
  '}',
].join('\n'));

describe('extractLegacyQuests', () => {
  it('moves inline text into keys like FTB Quests does on load', () => {
    const { texts } = extractLegacyQuests({ data: DATA, chapterGroups: GROUPS, chapters: [CHAPTER] });
    expect(Object.keys(texts)).toEqual([
      'file.0000000000000001.title',
      'chapter_group.0F0F0F0F0F0F0F0F.title',
      'chapter.1A2B3C4D5E6F7081.title',
      'chapter.1A2B3C4D5E6F7081.chapter_subtitle',
      'quest.44A5523F7A909209.title',
      'quest.44A5523F7A909209.quest_subtitle',
      'quest.44A5523F7A909209.quest_desc',
      'quest.2B2B2B2B2B2B2B2B.title',
      'quest.00000000000000FF.title',
    ]);
    expect(texts).toMatchObject({
      'file.0000000000000001.title': 'Example Book',
      'chapter.1A2B3C4D5E6F7081.chapter_subtitle': 'Your first steps\nin the pack',
      'quest.44A5523F7A909209.title': '&aWelcome',
      'quest.44A5523F7A909209.quest_desc': 'Line one\n\n{@pagebreak}\nLine two',
    });
  });

  it('follows FTB readID for ids and reports objects whose text cannot be matched', () => {
    expect(extractLegacyQuests({ chapters: [CHAPTER] }).notes).toEqual([
      '略過 4 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）',
      '略過 1 個 ID 重複的任務物件',
    ]);
  });

  it('ignores fields of the wrong type like FTB does', () => {
    const chapter = parseSnbt('{ id: "1A2B3C4D5E6F7081", subtitle: "a string", quests: [{ id: "44A5523F7A909209", subtitle: ["a", "list"] }] }');
    expect(extractLegacyQuests({ chapters: [chapter] })).toEqual({ texts: {}, notes: [] });
  });

  it('returns nothing for an empty book', () => {
    expect(extractLegacyQuests({ chapters: [] })).toEqual({ texts: {}, notes: [] });
  });
});

describe('questIdHex', () => {
  it.each([
    [{ kind: 'string', value: '44A5523F7A909209' } as const, '44A5523F7A909209'],
    [{ kind: 'string', value: '#ff' } as const, '00000000000000FF'],
    [{ kind: 'number', raw: '255L' } as const, '00000000000000FF'],
    [{ kind: 'number', raw: '1' } as const, null],
    [{ kind: 'number', raw: '-5L' } as const, null],
    [{ kind: 'number', raw: '1.5d' } as const, null],
    [{ kind: 'string', value: 'xyz' } as const, null],
    [{ kind: 'boolean', value: true } as const, null],
    [undefined, null],
  ])('reads %j as %s', (value, expected) => {
    expect(questIdHex(value)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/extract.test.ts`
Expected: FAIL — `extractLegacyQuests is not a function`（尚未匯出）。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/ftbquests/extract.ts`**

```ts
import { joinLines, questKey, type QuestField, type QuestObjectType } from './keys';
import { compounds, field, listField, type SnbtCompound, type SnbtValue, stringField } from './snbt';

/** 任務書本身的 ID（FTB Quests BaseQuestFile 的 super(1L)） */
export const FILE_OBJECT_ID = '0000000000000001';
const MAX_ID = 0x7fffffffffffffffn;
const HEX_ID = /^#?([0-9A-Fa-f]{1,16})$/;
const INT_ID = /^-?\d+[bBsSlL]?$/;

function idValue(value: SnbtValue | undefined): bigint | null {
  if (value?.kind === 'string') {
    const hex = HEX_ID.exec(value.value)?.[1];
    return hex === undefined ? null : BigInt(`0x${hex}`);
  }
  if (value?.kind === 'number' && INT_ID.test(value.raw)) return BigInt(value.raw.replace(/[bBsSlL]$/, ''));
  return null;
}

/**
 * 依 FTB Quests BaseQuestFile.readID：字串以十六進位解析（可有前綴 #）、數字 tag 直接使用。
 * 缺少、無法解析、0、1 或超出 long 範圍時遊戲會產生隨機新 ID，翻譯無法對應，因此回傳 null。
 */
export function questIdHex(value: SnbtValue | undefined): string | null {
  const id = idValue(value);
  return id === null || id <= 1n || id > MAX_ID ? null : id.toString(16).toUpperCase().padStart(16, '0');
}

export interface LegacyQuestBook {
  /** data.snbt */
  readonly data?: SnbtCompound;
  /** chapter_groups.snbt */
  readonly chapterGroups?: SnbtCompound;
  /** chapters/*.snbt，依路徑排序 */
  readonly chapters: readonly SnbtCompound[];
}

export interface LegacyQuests {
  readonly texts: Readonly<Record<string, string>>;
  readonly notes: readonly string[];
}

interface QuestObject {
  readonly type: QuestObjectType;
  readonly id: string | null;
  readonly texts: readonly (readonly [QuestField, string | undefined])[];
}

/** FTB 以 getList(…, TAG_STRING) 讀清單：元素不全是字串時視為沒有 */
function textLines(items: readonly SnbtValue[] | undefined): string | undefined {
  if (!items) return undefined;
  const lines = items.flatMap((i) => (i.kind === 'string' ? [i.value] : []));
  return lines.length === items.length ? joinLines(lines) : undefined;
}

/** handleLegacyChapterNBT（title 字串、subtitle 清單）與 handleLegacyQuestNBT（title、subtitle 字串、description 清單） */
function chapterObjects(c: SnbtCompound): QuestObject[] {
  const chapter: QuestObject = {
    type: 'chapter',
    id: questIdHex(field(c, 'id')),
    texts: [['title', stringField(c, 'title')], ['chapter_subtitle', textLines(listField(c, 'subtitle'))]],
  };
  const quests = compounds(listField(c, 'quests')).map((q): QuestObject => ({
    type: 'quest',
    id: questIdHex(field(q, 'id')),
    texts: [['title', stringField(q, 'title')], ['quest_subtitle', stringField(q, 'subtitle')], ['quest_desc', textLines(listField(q, 'description'))]],
  }));
  return [chapter, ...quests];
}

function bookObjects(book: LegacyQuestBook): QuestObject[] {
  const file: QuestObject[] = book.data ? [{ type: 'file', id: FILE_OBJECT_ID, texts: [['title', stringField(book.data, 'title')]] }] : [];
  const groups = compounds(book.chapterGroups ? listField(book.chapterGroups, 'chapter_groups') : undefined).map((g): QuestObject => ({
    type: 'chapter_group',
    id: questIdHex(field(g, 'id')),
    texts: [['title', stringField(g, 'title')]],
  }));
  return [...file, ...groups, ...book.chapters.flatMap(chapterObjects)];
}

const isText = (t: string | undefined): t is string => t !== undefined && t !== '';
const hasText = (o: QuestObject): boolean => o.texts.some(([, t]) => isText(t));

/** 只有章節檔（未附 lang）的整合包：依 FTB 載入時自動轉換的規則抽出英文 */
export function extractLegacyQuests(book: LegacyQuestBook): LegacyQuests {
  const seen = new Set<string>();
  const kept: (QuestObject & { readonly id: string })[] = [];
  let missing = 0;
  let duplicate = 0;
  for (const o of bookObjects(book)) {
    if (o.id === null) {
      if (hasText(o)) missing += 1;
    } else if (seen.has(o.id)) {
      if (hasText(o)) duplicate += 1;
    } else {
      seen.add(o.id);
      kept.push({ ...o, id: o.id });
    }
  }
  const texts = Object.fromEntries(kept.flatMap((o) => o.texts.flatMap(([f, t]) => (isText(t) ? [[questKey(o.type, o.id, f), t] as const] : []))));
  const notes = [
    ...(missing > 0 ? [`略過 ${missing} 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）`] : []),
    ...(duplicate > 0 ? [`略過 ${duplicate} 個 ID 重複的任務物件`] : []),
  ];
  return { texts, notes };
}
```

- [ ] **Step 4: Export** — `packages/core/src/ftbquests/index.ts` 最後加入

```ts
export * from './extract';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/ftbquests && npm run typecheck -w @mlf/core`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ftbquests
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): extract inline FTB Quests text from chapter files"
```

---

### Task 5: `modpack.json` 的 `ftbquests` 欄位與任務文字驗證（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/ftbquests/schema.ts`
- Create: `packages/core/src/ftbquests/validate.ts`
- Modify: `packages/core/src/ftbquests/index.ts`
- Modify: `packages/core/src/catalog/validateMod.ts`（`translationKeyIssues` 新增選填的格式碼檢查參數）
- Modify: `packages/core/src/modpack/schema.ts`（`ftbquests` 欄位）
- Modify: `packages/core/src/modpack/types.ts`（`QuestData`）
- Modify: `packages/core/src/modpack/validate.ts`（`ftbquests/…` 問題路徑、MC 版本一致性）
- Test: `packages/core/src/ftbquests/validate.test.ts`（既有 `modpack/*.test.ts`、`catalog/*.test.ts` 不改，必須維持通過）

**Interfaces:**
- Consumes: `isQuestKey`（Task 2）、`checkQuestFormat`（Task 3）、`langIssues`、`translationKeyIssues`（`catalog/validateMod`）、`GlossaryTerm`、`FormatIssue`、`checkFormat`
- Produces:
  - `QUEST_STATUSES`、`type QuestStatus`、`ftbquestsMetaSchema`（`{ status: 'supported'; layout } | { status: 'unsupported-version' }`，兩者皆 strict）、`type FtbquestsMeta`
  - `MIN_QUEST_MC_VERSION = '1.21'`、`supportsQuestLang(mcVersion: string): boolean`
  - `questKeySchema`、`questRecordSchema`、`questApiSchema`（`{ status: 'supported'; layout; en_us; zh_tw } | { status: 'unsupported-version' }`）、`type QuestApiBody`
  - `QUESTS_DIR = 'ftbquests'`、`QUEST_EN_FILE = 'en_us.json'`、`QUEST_ZH_FILE = 'zh_tw.json'`、`questFile(name: string): ModpackIssue['file']`
  - `validateQuestData(en: unknown, zh: unknown, terms?: readonly GlossaryTerm[]): ModpackIssue[]`
  - `translationKeyIssues(en, zh, terms, check?: (source: string, target: string) => FormatIssue | null)`（預設 `checkFormat`，行為不變）
  - `catalogModpackSchema` 新增 `ftbquests?: FtbquestsMeta`；`interface QuestData { layout: QuestLayout; en: Readonly<Record<string, string>>; zh: Readonly<Record<string, string>> }`（`modpack/types.ts`）
  - `ModpackIssue['file']` 新增 `` `ftbquests/${string}` ``；`validateModpackMeta` 另檢查 `supported` 須 MC ≥ 1.21、`unsupported-version` 須 MC < 1.21

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/validate.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { catalogModpackSchema, validateModpackMeta } from '../modpack';
import { questApiSchema, supportsQuestLang, validateQuestData } from './index';

const META = {
  id: 'example-quests', name: 'Example Quests', summary: '簡介', authors: ['someone'],
  links: { modrinth: 'https://modrinth.com/modpack/example-quests' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.21.1', loader: 'neoforge' },
  mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: '機器翻譯', url: null } },
  updatedAt: '2026-10-17',
};
const OLD_SOURCE = { ...META.source, mcVersion: '1.20.1', loader: 'forge' };
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const EN = 'ftbquests/en_us.json';
const ZH = 'ftbquests/zh_tw.json';

function messages(raw: unknown): string[] {
  const result = catalogModpackSchema.safeParse(raw);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}：${i.message}`);
}

describe('ftbquests in modpack.json', () => {
  it('accepts supported with a layout, unsupported-version without one, or no field at all', () => {
    expect(messages({ ...META, ftbquests: { status: 'supported', layout: 'split' } })).toEqual([]);
    expect(messages({ ...META, source: OLD_SOURCE, ftbquests: { status: 'unsupported-version' } })).toEqual([]);
    expect(catalogModpackSchema.parse(META).ftbquests).toBeUndefined();
  });

  it('rejects a missing layout, a layout on unsupported-version and unknown values', () => {
    for (const ftbquests of [{ status: 'supported' }, { status: 'unsupported-version', layout: 'single' }, { status: 'supported', layout: 'flat' }, { status: 'maybe' }]) {
      expect(messages({ ...META, ftbquests })[0]).toMatch(/^ftbquests/);
    }
  });

  it('checks the Minecraft version against the status', () => {
    expect(validateModpackMeta('example-quests', { ...META, ftbquests: { status: 'supported', layout: 'single' } })).toEqual([]);
    expect(validateModpackMeta('example-quests', { ...META, source: OLD_SOURCE, ftbquests: { status: 'supported', layout: 'single' } })).toEqual([
      { level: 'error', file: 'modpack.json', message: 'ftbquests 為 supported 時，source.mcVersion 必須是 1.21 以上' },
    ]);
    expect(validateModpackMeta('example-quests', { ...META, ftbquests: { status: 'unsupported-version' } })).toEqual([
      { level: 'error', file: 'modpack.json', message: 'ftbquests 為 unsupported-version 時，source.mcVersion 必須低於 1.21' },
    ]);
  });
});

describe('supportsQuestLang', () => {
  it.each([['1.20.1', false], ['1.12.2', false], ['0.21', false], ['abc', false], ['1.21', true], ['1.21.1', true], ['1.21.8', true], ['26.1.2', true]])(
    '%s → %s', (version, expected) => {
      expect(supportsQuestLang(version)).toBe(expected);
    },
  );
});

describe('questApiSchema', () => {
  it('validates quest keys and the layout of supported payloads', () => {
    expect(questApiSchema.safeParse({ status: 'supported', layout: 'single', en_us: { [TITLE]: 'Hi' }, zh_tw: {} }).success).toBe(true);
    expect(questApiSchema.safeParse({ status: 'unsupported-version' }).success).toBe(true);
    expect(questApiSchema.safeParse({ status: 'supported', layout: '../x', en_us: {}, zh_tw: {} }).success).toBe(false);
    expect(questApiSchema.safeParse({ status: 'supported', layout: 'single', en_us: { 'task.5555555555555555.title': 'x' }, zh_tw: {} }).success).toBe(false);
  });
});

describe('validateQuestData', () => {
  it('accepts matching texts, ignoring a different number of lines', () => {
    expect(validateQuestData({ [TITLE]: '&aHi', [DESC]: 'a\nb\nc' }, { [TITLE]: '&a嗨', [DESC]: '一行' })).toEqual([]);
  });

  it('reports malformed files as errors', () => {
    expect(validateQuestData([], {})).toEqual([{ level: 'error', file: EN, message: '語言檔頂層必須是物件' }]);
    expect(validateQuestData({ [TITLE]: 'a' }, { [TITLE]: 1 })).toEqual([{ level: 'error', file: ZH, key: TITLE, message: '值必須是字串' }]);
  });

  it('rejects keys that do not follow the FTB key format', () => {
    expect(validateQuestData({ 'task.5555555555555555.title': 'x', [TITLE]: 'y' }, {})).toEqual([
      { level: 'error', file: EN, key: 'task.5555555555555555.title', message: 'key 格式不符（應為 <類型>.<16 位十六進位 ID>.<欄位>）' },
    ]);
  });

  it('rejects unknown translated keys and warns about quest format codes', () => {
    expect(validateQuestData({ [TITLE]: '&aHi', [DESC]: 'a\nb' }, { [DESC]: '一', 'quest.1111111111111111.title': 'x', [TITLE]: '嗨' })).toEqual([
      { level: 'error', file: ZH, key: 'quest.1111111111111111.title', message: 'en_us.json 中沒有此 key' },
      { level: 'warning', file: ZH, key: TITLE, message: '格式碼不一致：缺少 &a' },
    ]);
  });

  it('applies the glossary with the term level', () => {
    const terms: GlossaryTerm[] = [{ en: 'Redstone', zh: '紅石', level: 'error' }];
    expect(validateQuestData({ [TITLE]: 'Redstone Dust' }, { [TITLE]: '紅色粉末' }, terms)).toEqual([
      { level: 'error', file: ZH, key: TITLE, message: '術語「Redstone」應譯為「紅石」' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/validate.test.ts`
Expected: FAIL — `supportsQuestLang is not a function`（尚未匯出）。記錄 RED。

- [ ] **Step 3: Replace `packages/core/src/ftbquests/schema.ts`**

```ts
import { z } from 'zod';
import { isQuestKey } from './keys';

/** single：lang/<locale>.snbt；split：lang/<locale>/ 資料夾（FTB Quests 26.x） */
export const QUEST_LAYOUTS = ['single', 'split'] as const;
export const QUEST_STATUSES = ['supported', 'unsupported-version'] as const;

export type QuestLayout = (typeof QUEST_LAYOUTS)[number];
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** modpack.json 的 ftbquests；layout 只在 supported 時存在 */
export const ftbquestsMetaSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('supported'), layout: z.enum(QUEST_LAYOUTS) }),
  z.strictObject({ status: z.literal('unsupported-version') }),
]);

export type FtbquestsMeta = z.infer<typeof ftbquestsMetaSchema>;

/** FTB Quests 2100（MC 1.21）起任務文字才放在 lang 檔 */
export const MIN_QUEST_MC_VERSION = '1.21';

export function supportsQuestLang(mcVersion: string): boolean {
  const parts = mcVersion.split('.').map(Number);
  if (parts.some((n) => !Number.isInteger(n))) return false;
  const [major = 0, minor = 0] = parts;
  return major > 1 || (major === 1 && minor >= 21);
}

export const questKeySchema = z.string().refine(isQuestKey, { message: 'FTB 任務 key 格式不符' });
export const questRecordSchema = z.record(questKeySchema, z.string());

/** /api/v1/modpacks/<id>.json 的 ftbquests；網站產生、瀏覽器端讀取時驗證 */
export const questApiSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('supported'), layout: z.enum(QUEST_LAYOUTS), en_us: questRecordSchema, zh_tw: questRecordSchema }),
  z.object({ status: z.literal('unsupported-version') }),
]);

export type QuestApiBody = z.infer<typeof questApiSchema>;
```

- [ ] **Step 4: Let `translationKeyIssues` take a format checker** — `packages/core/src/catalog/validateMod.ts`

把

```ts
export function translationKeyIssues(
  en: Record<string, string>,
  zh: Record<string, string>,
  terms: readonly GlossaryTerm[],
): { level: 'error' | 'warning'; key: string; message: string }[] {
```

改為

```ts
export function translationKeyIssues(
  en: Record<string, string>,
  zh: Record<string, string>,
  terms: readonly GlossaryTerm[],
  check: (source: string, target: string) => FormatIssue | null = checkFormat,
): { level: 'error' | 'warning'; key: string; message: string }[] {
```

並把函式內的 `const issue = checkFormat(source, target);` 改為 `const issue = check(source, target);`（其餘不變；`translationKeyIssues` 上方註解改為「zh 中每個 key 的問題（未知 key → error、格式碼 → warning、術語 → 術語等級）；check 預設為一般格式碼檢查；不含 file」）。

- [ ] **Step 5: Create `packages/core/src/ftbquests/validate.ts`**

```ts
import { langIssues, translationKeyIssues } from '../catalog/validateMod';
import type { GlossaryTerm } from '../glossary/schema';
import type { ModpackIssue } from '../modpack/validate';
import { checkQuestFormat } from './formatCodes';
import { isQuestKey } from './keys';

export const QUESTS_DIR = 'ftbquests';
export const QUEST_EN_FILE = 'en_us.json';
export const QUEST_ZH_FILE = 'zh_tw.json';

const KEY_MESSAGE = 'key 格式不符（應為 <類型>.<16 位十六進位 ID>.<欄位>）';

export function questFile(name: string): ModpackIssue['file'] {
  return `${QUESTS_DIR}/${name}`;
}

/** 驗證 ftbquests/ 的英文與譯文；zh 為 zh_tw.json 的內容（不存在時傳 {}）；回傳空陣列代表完全合法 */
export function validateQuestData(en: unknown, zh: unknown, terms: readonly GlossaryTerm[] = []): ModpackIssue[] {
  const enFile = questFile(QUEST_EN_FILE);
  const zhFile = questFile(QUEST_ZH_FILE);
  const base: ModpackIssue[] = [...langIssues(enFile, en), ...langIssues(zhFile, zh)];
  if (base.some((i) => i.level === 'error')) return base;
  const enRecord = en as Record<string, string>;
  const zhRecord = zh as Record<string, string>;
  const badKeys = Object.keys(enRecord)
    .filter((key) => !isQuestKey(key))
    .map((key): ModpackIssue => ({ level: 'error', file: enFile, key, message: KEY_MESSAGE }));
  const keyIssues = translationKeyIssues(enRecord, zhRecord, terms, checkQuestFormat).map((i): ModpackIssue => ({ ...i, file: zhFile }));
  return [...badKeys, ...keyIssues];
}
```

- [ ] **Step 6: Export** — `packages/core/src/ftbquests/index.ts` 最後加入

```ts
export * from './validate';
```

- [ ] **Step 7: Add `ftbquests` to `modpack.json`** — `packages/core/src/modpack/schema.ts`

在 import 區加入：

```ts
import { ftbquestsMetaSchema } from '../ftbquests/schema';
```

在 `catalogModpackSchema` 的 `translation: z.object({ … }),` 之後、`updatedAt` 之前加入：

```ts
  /** FTB 任務；沒有任務檔時不寫 */
  ftbquests: ftbquestsMetaSchema.optional(),
```

- [ ] **Step 8: Add `QuestData`** — `packages/core/src/modpack/types.ts` 改為

```ts
import type { QuestLayout } from '../ftbquests/schema';

/** 一個 KubeJS 命名空間的英文原文與譯文 */
export interface KubejsTexts {
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

/** 命名空間 → KubeJS 文字 */
export type KubejsData = Readonly<Record<string, KubejsTexts>>;

/** 整合包的 FTB 任務文字（只在 modpack.json 的 ftbquests 為 supported 時存在） */
export interface QuestData extends KubejsTexts {
  readonly layout: QuestLayout;
}
```

- [ ] **Step 9: Report `ftbquests/…` paths and version mismatches** — `packages/core/src/modpack/validate.ts`

(a) import 區改為：

```ts
import { langIssues, translationKeyIssues } from '../catalog/validateMod';
import { supportsQuestLang } from '../ftbquests/schema';
import type { GlossaryTerm } from '../glossary/schema';
import { type CatalogModpack, catalogModpackSchema, isValidNamespace } from './schema';
```

(b) `ModpackIssue` 的 `file` 改為：

```ts
  readonly file: 'modpack.json' | `kubejs/${string}` | `ftbquests/${string}`;
```

(c) `validateModpackMeta` 最後的 `return [];` 改為 `return questVersionIssues(parsed.data);`，並在 `validateModpackMeta` 之前加入：

```ts
/** ftbquests.status 必須與 Minecraft 版本一致 */
function questVersionIssues(meta: CatalogModpack): ModpackIssue[] {
  const status = meta.ftbquests?.status;
  const supported = supportsQuestLang(meta.source.mcVersion);
  if (status === 'supported' && !supported) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 supported 時，source.mcVersion 必須是 1.21 以上' }];
  }
  if (status === 'unsupported-version' && supported) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 unsupported-version 時，source.mcVersion 必須低於 1.21' }];
  }
  return [];
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core`
Expected: PASS（新測試與既有 catalog／modpack／node 測試全過），typecheck 無錯誤

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/ftbquests packages/core/src/catalog/validateMod.ts packages/core/src/modpack
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): validate FTB Quests data and the ftbquests field"
```

---

### Task 6: 載入 `data/modpacks/<id>/ftbquests/`（pure core (full code given)）

**Files:**
- Create: `packages/core/src/node/modpackFs.ts`（自 `loadModpacks.ts` 原樣搬出 `listEntries`、`JsonRead`、`readJson`，不複製）
- Create: `packages/core/src/node/loadQuests.ts`
- Modify: `packages/core/src/node/loadModpacks.ts`
- Test: `packages/core/src/node/loadModpacks.test.ts`（新增 describe；既有測試不改）

**Interfaces:**
- Consumes: `isMissing`、`parseJsonText`（`node/fsErrors`）、`validateQuestData`、`questFile`、`QUESTS_DIR`、`QUEST_EN_FILE`、`QUEST_ZH_FILE`（Task 5）、`QuestData`、`CatalogModpack`、`MODPACK_FILE`、`ModpackIssue`
- Produces:
  - `listEntries(dir: string): Promise<Dirent[] | null>`、`type JsonRead`、`readJson(path, file, optional): Promise<JsonRead | null>`（`node/modpackFs.ts`）
  - `interface QuestDirLoad { present: boolean; hasEnglish: boolean; texts?: KubejsTexts; issues: readonly ModpackIssue[] }`、`loadQuestDir(dir: string, terms: readonly GlossaryTerm[]): Promise<QuestDirLoad>`、`questMetaIssues(meta: CatalogModpack, load: QuestDirLoad): ModpackIssue[]`（`node/loadQuests.ts`）
  - `LoadedModpack` 新增 `quests?: QuestData`（只在 `ftbquests.status === 'supported'` 且資料無 error 時存在）

- [ ] **Step 1: Write the failing test** — 在 `packages/core/src/node/loadModpacks.test.ts` 最後加入（沿用檔案內的 `writePack`、`dir`、`meta`）

```ts
const questMeta = (id: string, ftbquests?: unknown) => ({
  ...meta(id),
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.21.1', loader: 'neoforge' },
  ...(ftbquests ? { ftbquests } : {}),
});
const TITLE = 'quest.44A5523F7A909209.title';
const SUPPORTED = { status: 'supported', layout: 'split' };

describe('loadAllModpacks: FTB quests', () => {
  it('loads quest texts with the layout from modpack.json', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: '&aWelcome' }),
      'ftbquests/zh_tw.json': '﻿' + JSON.stringify({ [TITLE]: '&a歡迎' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(issues).toEqual([]);
    expect(modpacks[0]?.quests).toEqual({ layout: 'split', en: { [TITLE]: '&aWelcome' }, zh: { [TITLE]: '&a歡迎' } });
  });

  it('has no quests when modpack.json has no ftbquests field or marks the version unsupported', async () => {
    await writePack('alpha', { 'modpack.json': JSON.stringify(questMeta('alpha')) });
    await writePack('beta', { 'modpack.json': JSON.stringify({ ...meta('beta'), ftbquests: { status: 'unsupported-version' } }) });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(issues).toEqual([]);
    expect(modpacks.map((p) => [p.meta.id, p.quests])).toEqual([['alpha', undefined], ['beta', undefined]]);
  });

  it('reports a status that does not match the files and skips the modpack', async () => {
    await writePack('alpha', { 'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)) });
    await writePack('beta', {
      'modpack.json': JSON.stringify({ ...meta('beta'), ftbquests: { status: 'unsupported-version' } }),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi' }),
    });
    await writePack('gamma', { 'modpack.json': JSON.stringify(questMeta('gamma')), 'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi' }) });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.modpackId, i.file, i.message])).toEqual([
      ['alpha', 'ftbquests/en_us.json', 'modpack.json 的 ftbquests 為 supported，但沒有 ftbquests/en_us.json'],
      ['beta', 'modpack.json', 'ftbquests 為 unsupported-version 時不可有 ftbquests/ 資料夾'],
      ['gamma', 'modpack.json', '有 ftbquests/ 資料夾，但 modpack.json 沒有 ftbquests 欄位'],
    ]);
  });

  it('reports broken files, extra files, bad keys and unknown translations', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi', 'task.5555555555555555.title': 'x' }),
      'ftbquests/zh_tw.json': JSON.stringify({ 'quest.1111111111111111.title': '孤兒' }),
      'ftbquests/notes.md': 'x',
    });
    await writePack('beta', { 'modpack.json': JSON.stringify(questMeta('beta', SUPPORTED)), 'ftbquests/en_us.json': '{' });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.modpackId, i.file, i.key, i.level])).toEqual([
      ['alpha', 'ftbquests/notes.md', undefined, 'error'],
      ['alpha', 'ftbquests/en_us.json', 'task.5555555555555555.title', 'error'],
      ['alpha', 'ftbquests/zh_tw.json', 'quest.1111111111111111.title', 'error'],
      ['beta', 'ftbquests/en_us.json', undefined, 'error'],
    ]);
    expect(issues[3]?.message).toMatch(/^JSON 解析失敗：/);
  });

  it('keeps modpacks whose quest texts only have warnings and formats ftbquests paths', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: '&aHi' }),
      'ftbquests/zh_tw.json': JSON.stringify({ [TITLE]: '嗨' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks.map((p) => p.meta.id)).toEqual(['alpha']);
    expect(formatModpackIssues(issues, 'data')).toEqual([
      `::warning file=data/modpacks/alpha/ftbquests/zh_tw.json::[modpack:alpha] ${TITLE}：格式碼不一致：缺少 &a`,
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/node/loadModpacks.test.ts`
Expected: FAIL — `loads quest texts…` 的 `modpacks[0]?.quests` 為 `undefined`、`reports a status…` 沒有任何 issue（尚未讀取 `ftbquests/`）。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/node/modpackFs.ts`**（把 `loadModpacks.ts` 中的 `listEntries`、`JsonRead`、`readJson` 原樣搬過來並加上 `export`）

```ts
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import type { ModpackIssue } from '../modpack/validate';
import { isMissing, parseJsonText } from './fsErrors';

export async function listEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

export type JsonRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ModpackIssue };

/** optional 為 true 時檔案不存在回傳 null；否則回報「檔案不存在」 */
export async function readJson(path: string, file: ModpackIssue['file'], optional: boolean): Promise<JsonRead | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (!isMissing(err)) throw err;
    return optional ? null : { ok: false, issue: { level: 'error', file, message: '檔案不存在' } };
  }
  const parsed = parseJsonText(text);
  return parsed.ok ? parsed : { ok: false, issue: { level: 'error', file, message: `JSON 解析失敗：${parsed.reason}` } };
}
```

- [ ] **Step 4: Create `packages/core/src/node/loadQuests.ts`**

```ts
import { join } from 'node:path';
import { QUEST_EN_FILE, QUEST_ZH_FILE, questFile, QUESTS_DIR, validateQuestData } from '../ftbquests/validate';
import type { GlossaryTerm } from '../glossary/schema';
import type { CatalogModpack } from '../modpack/schema';
import type { KubejsTexts } from '../modpack/types';
import { MODPACK_FILE, type ModpackIssue } from '../modpack/validate';
import { listEntries, readJson } from './modpackFs';

export interface QuestDirLoad {
  /** ftbquests/ 資料夾存在 */
  readonly present: boolean;
  /** ftbquests/en_us.json 存在（不論內容是否合法） */
  readonly hasEnglish: boolean;
  /** 只在沒有 error 時存在 */
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

const ALLOWED_FILES: ReadonlySet<string> = new Set([QUEST_EN_FILE, QUEST_ZH_FILE]);

/** 讀取並驗證 <整合包>/ftbquests/；資料夾不存在時 present 為 false */
export async function loadQuestDir(dir: string, terms: readonly GlossaryTerm[]): Promise<QuestDirLoad> {
  const root = join(dir, QUESTS_DIR);
  const entries = await listEntries(root);
  if (entries === null) return { present: false, hasEnglish: false, issues: [] };
  const extra = entries
    .filter((e) => !e.isFile() || !ALLOWED_FILES.has(e.name))
    .map((e): ModpackIssue => ({ level: 'error', file: questFile(e.name), message: '只接受 en_us.json 與 zh_tw.json' }));
  const [en, zh] = await Promise.all([
    readJson(join(root, QUEST_EN_FILE), questFile(QUEST_EN_FILE), true),
    readJson(join(root, QUEST_ZH_FILE), questFile(QUEST_ZH_FILE), true),
  ]);
  const readIssues = [en, zh].flatMap((r) => (r && !r.ok ? [r.issue] : []));
  if (readIssues.length > 0 || !en?.ok) return { present: true, hasEnglish: en !== null, issues: [...extra, ...readIssues] };
  const zhValue = zh?.ok ? zh.value : {};
  const issues = [...extra, ...validateQuestData(en.value, zhValue, terms)];
  if (issues.some((i) => i.level === 'error')) return { present: true, hasEnglish: true, issues };
  return { present: true, hasEnglish: true, texts: { en: en.value as Record<string, string>, zh: zhValue as Record<string, string> }, issues };
}

/** modpack.json 的 ftbquests 與 ftbquests/ 資料夾必須一致 */
export function questMetaIssues(meta: CatalogModpack, load: QuestDirLoad): ModpackIssue[] {
  const status = meta.ftbquests?.status;
  if (status === 'supported' && !load.hasEnglish) {
    return [{ level: 'error', file: questFile(QUEST_EN_FILE), message: 'modpack.json 的 ftbquests 為 supported，但沒有 ftbquests/en_us.json' }];
  }
  if (status === 'unsupported-version' && load.present) {
    return [{ level: 'error', file: MODPACK_FILE, message: 'ftbquests 為 unsupported-version 時不可有 ftbquests/ 資料夾' }];
  }
  if (status === undefined && load.present) {
    return [{ level: 'error', file: MODPACK_FILE, message: '有 ftbquests/ 資料夾，但 modpack.json 沒有 ftbquests 欄位' }];
  }
  return [];
}
```

- [ ] **Step 5: Replace `packages/core/src/node/loadModpacks.ts`**

```ts
import { join } from 'node:path';
import type { GlossaryTerm } from '../glossary/schema';
import { type CatalogModpack, catalogModpackSchema, isValidNamespace } from '../modpack/schema';
import type { KubejsData, KubejsTexts, QuestData } from '../modpack/types';
import {
  KUBEJS_DIR, KUBEJS_EN_FILE, KUBEJS_ZH_FILE, kubejsFile, MODPACK_FILE, type ModpackIssue, validateKubejsData, validateModpackMeta,
} from '../modpack/validate';
import { loadQuestDir, questMetaIssues } from './loadQuests';
import { listEntries, readJson } from './modpackFs';

/** `<dataDir>` 底下的整合包資料夾 */
export const MODPACKS_DIR = 'modpacks';

export interface LoadedModpack {
  readonly meta: CatalogModpack;
  readonly kubejs: KubejsData;
  /** FTB 任務文字；只在 modpack.json 的 ftbquests 為 supported 時存在 */
  readonly quests?: QuestData;
}

export type ModpackDataIssue = ModpackIssue & { readonly modpackId: string };

export interface ModpackLoadResult {
  readonly modpacks: readonly LoadedModpack[];
  readonly issues: readonly ModpackDataIssue[];
}

const ALLOWED_FILES: ReadonlySet<string> = new Set([KUBEJS_EN_FILE, KUBEJS_ZH_FILE]);

const isError = (i: ModpackIssue): boolean => i.level === 'error';

interface NamespaceLoad {
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

async function loadNamespace(root: string, ns: string, terms: readonly GlossaryTerm[]): Promise<NamespaceLoad> {
  if (!isValidNamespace(ns)) return { issues: validateKubejsData(ns, {}, {}) };
  const dir = join(root, ns);
  const extra = ((await listEntries(dir)) ?? [])
    .filter((e) => !e.isFile() || !ALLOWED_FILES.has(e.name))
    .map((e): ModpackIssue => ({ level: 'error', file: kubejsFile(ns, e.name), message: '只接受 en_us.json 與 zh_tw.json' }));
  const [en, zh] = await Promise.all([
    readJson(join(dir, KUBEJS_EN_FILE), kubejsFile(ns, KUBEJS_EN_FILE), false),
    readJson(join(dir, KUBEJS_ZH_FILE), kubejsFile(ns, KUBEJS_ZH_FILE), true),
  ]);
  const readIssues = [en, zh].flatMap((r) => (r && !r.ok ? [r.issue] : []));
  if (readIssues.length > 0 || !en?.ok) return { issues: [...extra, ...readIssues] };
  const zhValue = zh?.ok ? zh.value : {};
  const issues = [...extra, ...validateKubejsData(ns, en.value, zhValue, terms)];
  if (issues.some(isError)) return { issues };
  return { texts: { en: en.value as Record<string, string>, zh: zhValue as Record<string, string> }, issues };
}

async function loadKubejs(dir: string, terms: readonly GlossaryTerm[]): Promise<{ kubejs: KubejsData; issues: readonly ModpackIssue[] }> {
  const root = join(dir, KUBEJS_DIR);
  const entries = await listEntries(root);
  if (entries === null) return { kubejs: {}, issues: [] };
  const stray = entries
    .filter((e) => !e.isDirectory())
    .map((e): ModpackIssue => ({ level: 'error', file: `kubejs/${e.name}`, message: 'kubejs/ 底下只能放命名空間資料夾' }));
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const loads = await Promise.all(names.map((ns) => loadNamespace(root, ns, terms)));
  const kubejs = Object.fromEntries(names.flatMap((ns, i) => {
    const texts = loads[i]?.texts;
    return texts ? [[ns, texts] as const] : [];
  }));
  return { kubejs, issues: [...stray, ...loads.flatMap((l) => l.issues)] };
}

function questData(meta: CatalogModpack, texts: KubejsTexts | undefined): QuestData | undefined {
  return meta.ftbquests?.status === 'supported' && texts ? { layout: meta.ftbquests.layout, ...texts } : undefined;
}

async function loadOne(root: string, id: string, terms: readonly GlossaryTerm[]): Promise<{ modpack?: LoadedModpack; issues: ModpackDataIssue[] }> {
  const dir = join(root, id);
  const [meta, kubejs, quests] = await Promise.all([
    readJson(join(dir, MODPACK_FILE), MODPACK_FILE, false),
    loadKubejs(dir, terms),
    loadQuestDir(dir, terms),
  ]);
  const metaIssues = !meta ? [] : meta.ok ? validateModpackMeta(id, meta.value) : [meta.issue];
  const parsed = meta?.ok && metaIssues.length === 0 ? catalogModpackSchema.parse(meta.value) : null;
  const consistency = parsed ? questMetaIssues(parsed, quests) : [];
  const tagged = [...metaIssues, ...kubejs.issues, ...quests.issues, ...consistency].map((i) => ({ ...i, modpackId: id }));
  if (!parsed || tagged.some(isError)) return { issues: tagged };
  const data = questData(parsed, quests.texts);
  return { modpack: { meta: parsed, kubejs: kubejs.kubejs, ...(data ? { quests: data } : {}) }, issues: tagged };
}

/** 讀取 `<dataDir>/modpacks/*`；有 error 的整合包不會出現在 modpacks 中；terms 為全域術語 */
export async function loadAllModpacks(dataDir: string, terms: readonly GlossaryTerm[] = []): Promise<ModpackLoadResult> {
  const root = join(dataDir, MODPACKS_DIR);
  const entries = await listEntries(root);
  if (entries === null) return { modpacks: [], issues: [] };
  const names = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const results = await Promise.all(names.map((id) => loadOne(root, id, terms)));
  return {
    modpacks: results.flatMap((r) => (r.modpack ? [r.modpack] : [])),
    issues: results.flatMap((r) => r.issues),
  };
}

/** 轉為 GitHub Actions 註記格式 */
export function formatModpackIssues(issues: readonly ModpackDataIssue[], dataDirLabel: string): string[] {
  return issues.map((i) => {
    const where = i.key ? `${i.key}：` : '';
    return `::${i.level} file=${dataDirLabel}/${MODPACKS_DIR}/${i.modpackId}/${i.file}::[modpack:${i.modpackId}] ${where}${i.message}`;
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/node && npm run typecheck -w @mlf/core && npm run validate:data`
Expected: PASS（新舊 loadModpacks 測試全過），typecheck 無錯誤；`validate:data` 仍為 0 個錯誤（`example-pack` 尚無 `ftbquests`）

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/node
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): load and validate modpack FTB Quests data"
```

---

### Task 7: 翻譯工具的任務專案與任務進度（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/types.ts`（`ModProject.questLayout?`）
- Create: `packages/core/src/ftbquests/project.ts`
- Modify: `packages/core/src/ftbquests/index.ts`
- Test: `packages/core/src/ftbquests/project.test.ts`

**Interfaces:**
- Consumes: `buildProject`、`mergeProject`、`projectStats`、`updateEntry`（`merge`）、`ModpackRef`（`modpack/project`）、`QuestData`（Task 5）、`questProjectId`（Task 3）、`QuestLayout`
- Produces:
  - `ModProject.questLayout?: QuestLayout`（只有任務專案有；IndexedDB 舊資料可能沒有）
  - `QUEST_MOD_ID = 'ftbquests'`、`questProjectName(name: string): string`（`<名稱>（FTB 任務）`）
  - `questProject(pack: ModpackRef, data: QuestData, now: number): ModProject`
  - `mergeQuestProject(existing: ModProject, pack: ModpackRef, data: QuestData, now: number): ModProject`（合併規則同 `mergeProject`，layout 改用 `data.layout`）
  - `questLayoutOf(p: Pick<ModProject, 'questLayout'>): QuestLayout`（沒有或不認得時為 `single`）
  - `questTranslations(p: ModProject): Record<string, string>`（非 obsolete 且已翻譯的條目）
  - `questStats(pack: ModpackRef, data: QuestData): ProjectStats`

- [ ] **Step 1: Write the failing test** — `packages/core/src/ftbquests/project.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { updateEntry } from '../merge';
import type { QuestData } from '../modpack';
import { mergeQuestProject, questLayoutOf, questProject, questStats, questTranslations } from './index';

const pack = { id: 'example-quests', name: 'Example Quests', version: '1.0.0' };
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const CHAPTER = 'chapter.1A2B3C4D5E6F7081.title';
const data: QuestData = { layout: 'single', en: { [TITLE]: '&aWelcome', [DESC]: 'Line one\nLine two', [CHAPTER]: 'Start' }, zh: { [TITLE]: '&a歡迎' } };

describe('questProject', () => {
  it('builds one project per modpack with the shipped translations and the layout', () => {
    const p = questProject(pack, data, 5);
    expect(p).toMatchObject({
      id: 'modpack-quests:example-quests', modId: 'ftbquests', name: 'Example Quests（FTB 任務）',
      version: '1.0.0', jarName: '', format: 'json', updatedAt: 5, questLayout: 'single',
    });
    expect(p.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      [TITLE, '&a歡迎', 'translated'], [DESC, '', 'untranslated'], [CHAPTER, '', 'untranslated'],
    ]);
  });

  it('merges a reloaded modpack like a re-uploaded mod and follows the new layout', () => {
    const edited = updateEntry(questProject(pack, data, 1), DESC, '第一行\n第二行\n第三行', 2);
    const next = mergeQuestProject(edited, { ...pack, version: '1.1.0' }, { layout: 'split', en: { [DESC]: 'Line one\nLine two', [CHAPTER]: 'Begin' }, zh: {} }, 3);
    expect(next).toMatchObject({ id: 'modpack-quests:example-quests', version: '1.1.0', questLayout: 'split', updatedAt: 3 });
    expect(next.entries.map((e) => [e.key, e.target, e.status])).toEqual([
      [DESC, '第一行\n第二行\n第三行', 'translated'],
      [CHAPTER, '', 'new'],
      [TITLE, '&a歡迎', 'obsolete'],
    ]);
    expect(questTranslations(next)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('treats stored projects without questLayout as single', () => {
    expect(questLayoutOf({})).toBe('single');
    expect(questLayoutOf({ questLayout: 'split' })).toBe('split');
  });

  it('counts progress with the quest format checker', () => {
    expect(questStats(pack, data)).toEqual({ total: 3, translated: 1, warnings: 0, percent: 33 });
    expect(questStats(pack, { ...data, zh: { [TITLE]: '歡迎' } }).warnings).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/ftbquests/project.test.ts`
Expected: FAIL — `questProject is not a function`（尚未匯出）。記錄 RED。

- [ ] **Step 3: Add `questLayout` to `ModProject`** — `packages/core/src/types.ts`

在檔案開頭加入：

```ts
import type { QuestLayout } from './ftbquests/schema';
```

在 `ModProject` 的 `readonly guide?: ProjectGuide;` 之後加入：

```ts
  /** FTB 任務專案的輸出格式；只有任務專案有，IndexedDB 舊資料可能沒有（視為 single） */
  readonly questLayout?: QuestLayout;
```

- [ ] **Step 4: Create `packages/core/src/ftbquests/project.ts`**

```ts
import { buildProject } from '../merge/buildProject';
import { mergeProject } from '../merge/mergeMod';
import { projectStats, type ProjectStats } from '../merge/stats';
import type { ModpackRef } from '../modpack/project';
import type { QuestData } from '../modpack/types';
import type { DetectedMod, ModProject } from '../types';
import { questProjectId } from './ids';
import type { QuestLayout } from './schema';

/** 任務專案的 modId（只用於顯示；輸出路徑由 questLayout 決定，不會寫到 assets/<modId>/） */
export const QUEST_MOD_ID = 'ftbquests';

export function questProjectName(name: string): string {
  return `${name}（FTB 任務）`;
}

/** 站上任務文字視為一個「jar 偵測結果」，以便沿用 buildProject／mergeProject 的規則 */
function toDetected(pack: ModpackRef, data: QuestData): DetectedMod {
  return {
    modId: QUEST_MOD_ID,
    name: questProjectName(pack.name),
    version: pack.version,
    jarName: '',
    format: 'json',
    source: data.en,
    order: Object.keys(data.en),
    zhTw: data.zh,
  };
}

export function questProject(pack: ModpackRef, data: QuestData, now: number): ModProject {
  return { ...buildProject(toDetected(pack, data), now), id: questProjectId(pack.id), questLayout: data.layout };
}

/** 重新載入同一整合包：原文相同保留譯文、原文變更標 new、移除的 key 標 obsolete；layout 改用新資料 */
export function mergeQuestProject(existing: ModProject, pack: ModpackRef, data: QuestData, now: number): ModProject {
  return { ...mergeProject(existing, toDetected(pack, data), now), questLayout: data.layout };
}

export function questLayoutOf(p: Pick<ModProject, 'questLayout'>): QuestLayout {
  return p.questLayout === 'split' ? 'split' : 'single';
}

/** 已翻譯、未移除的任務條目（未翻譯的由遊戲退回英文） */
export function questTranslations(p: ModProject): Record<string, string> {
  return Object.fromEntries(p.entries.filter((e) => e.status !== 'obsolete' && e.target !== '').map((e) => [e.key, e.target]));
}

export function questStats(pack: ModpackRef, data: QuestData): ProjectStats {
  return projectStats(questProject(pack, data, 0));
}
```

- [ ] **Step 5: Export** — `packages/core/src/ftbquests/index.ts` 最後加入

```ts
export * from './project';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/ftbquests
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): build translator projects for FTB Quests text"
```

---

### Task 8: 兩部分 zip 與任務專案匯出（pure core (full code given)）

**Files:**
- Create: `packages/core/src/export/questBundle.ts`
- Modify: `packages/core/src/export/buildResourcePack.ts`
- Modify: `packages/core/src/export/index.ts`
- Create: `packages/core/src/test/zipFiles.ts`
- Modify: `packages/core/package.json`（`exports` 加入 `./test/zipFiles`）
- Test: `packages/core/src/export/quests.test.ts`（既有 `export.test.ts`、`guide.test.ts`、`namespaces.test.ts` 不改，必須維持通過）

**Interfaces:**
- Consumes: `questLangPath`、`questLangText`（Task 2）、`isQuestProjectId`、`parseQuestProjectId`（Task 3）、`questLayoutOf`、`questTranslations`、`questProject`（Task 7）、`mergeSameNamespace`、`buildLangText`、`langFileName`、`packFormatFor`
- Produces:
  - `INSTALL_GUIDE_FILE = '安裝說明.txt'`、`RESOURCEPACKS_DIR = 'resourcepacks'`
  - `interface QuestPart { modpackId: string; layout: QuestLayout; translations: Readonly<Record<string, string>> }`
  - `interface BundleResourcePack { fileName: string; bytes: Uint8Array }`、`interface BundleOptions { title: string; resourcePack: BundleResourcePack | null; quests: readonly QuestPart[] }`
  - `questBundleFiles(parts: readonly QuestPart[]): [string, string][]`（略過沒有已翻條目的整合包；超過一個整合包時各放在 `<modpackId>/` 底下）
  - `installGuide(title: string, resourcePack: string | null, hasQuests: boolean): string`
  - `buildBundle(opts: BundleOptions): Promise<Blob>`
  - `exportProjects` 遇到任務專案：`merged-pack` → 兩部分結構（`ModLangForge-zh_tw.zip`，資源包在 `resourcepacks/ModLangForge-zh_tw.zip`）；`separate-packs` → 外層 zip 另加任務檔；`lang-files` → 一律為 `ModLangForge-lang.zip`，含任務檔。任務檔一律只含已翻譯條目（不受「還沒翻的文字」選項影響）；沒有任務專案時行為完全不變。
  - `zipFileNames(zip: JSZip): string[]`（測試用；不含資料夾項目、已排序；`@mlf/core/test/zipFiles`）

- [ ] **Step 1: Write the failing test** — `packages/core/src/export/quests.test.ts`

```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseSnbt, questProject, readQuestLang } from '../ftbquests';
import { buildProject, updateEntry } from '../merge';
import type { ModProject } from '../types';
import { zipFileNames } from '../test/zipFiles';
import { buildBundle, type ExportOptions, exportProjects, INSTALL_GUIDE_FILE, installGuide, questBundleFiles } from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const SINGLE = 'config/ftbquests/quests/lang/zh_tw.snbt';
const SPLIT = 'config/ftbquests/quests/lang/zh_tw/modlangforge.snbt';

const mod = updateEntry(buildProject({ modId: 'a', name: 'A', version: '1', jarName: 'a.jar', format: 'json', source: { k: 'Key' }, order: ['k'] }, 1), 'k', '鍵', 2);

function quests(id: string, layout: 'single' | 'split' = 'single'): ModProject {
  const p = questProject({ id, name: id, version: '1' }, { layout, en: { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' }, zh: {} }, 1);
  return updateEntry(p, DESC, '第一行\n第二行\n第三行', 2);
}

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.21.1', description: '測試', ...o });

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function questTexts(zip: JSZip, path: string): Promise<Readonly<Record<string, string>>> {
  return readQuestLang(parseSnbt((await zip.file(path)?.async('string')) ?? '')).texts;
}

describe('questBundleFiles', () => {
  it('writes translated entries only, at the path of each layout', () => {
    const files = questBundleFiles([{ modpackId: 'p', layout: 'split', translations: { [DESC]: '一\n二', [TITLE]: '' } }]);
    expect(files.map(([path]) => path)).toEqual([SPLIT]);
    expect(readQuestLang(parseSnbt(files[0]?.[1] ?? '')).texts).toEqual({ [DESC]: '一\n二' });
  });

  it('skips modpacks without translations and nests several modpacks in their own folders', () => {
    expect(questBundleFiles([{ modpackId: 'p', layout: 'single', translations: {} }])).toEqual([]);
    const two = questBundleFiles([
      { modpackId: 'p', layout: 'single', translations: { [TITLE]: '甲' } },
      { modpackId: 'q', layout: 'split', translations: { [TITLE]: '乙' } },
      { modpackId: 'r', layout: 'single', translations: {} },
    ]);
    expect(two.map(([path]) => path)).toEqual([`p/${SINGLE}`, `q/${SPLIT}`]);
  });
});

describe('buildBundle / installGuide', () => {
  it('puts the resource pack under resourcepacks/ next to the quest files and the install guide', async () => {
    const zip = await unzip(await buildBundle({
      title: 'ModLangForge 繁中翻譯 · Pack', resourcePack: { fileName: 'pack-zh_tw.zip', bytes: new Uint8Array([1, 2, 3]) },
      quests: [{ modpackId: 'pack', layout: 'single', translations: { [TITLE]: '歡迎' } }],
    }));
    expect(zipFileNames(zip)).toEqual([SINGLE, 'resourcepacks/pack-zh_tw.zip', INSTALL_GUIDE_FILE]);
    expect(await zip.file('resourcepacks/pack-zh_tw.zip')?.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
    const guide = (await zip.file(INSTALL_GUIDE_FILE)?.async('string')) ?? '';
    expect(guide).toBe(installGuide('ModLangForge 繁中翻譯 · Pack', 'pack-zh_tw.zip', true));
  });

  it('explains every part in player-friendly words and leaves out missing parts', () => {
    const full = installGuide('標題', 'pack-zh_tw.zip', true);
    expect(full.split('\n')[0]).toBe('標題');
    expect(full).toContain('解壓縮到整合包的資料夾');
    expect(full).toContain('「選項 → 資源包」');
    expect(full).toContain('伺服器的 config 資料夾');
    const packOnly = installGuide('標題', 'pack-zh_tw.zip', false);
    expect(packOnly).not.toContain('FTB 任務');
    expect(installGuide('標題', null, true)).not.toContain('資源包」');
  });
});

describe('exportProjects with quest projects', () => {
  it('merged-pack: nests the resource pack and adds the quest file', async () => {
    const result = await exportProjects([mod, quests('pack')], opts());
    expect(result.fileName).toBe('ModLangForge-zh_tw.zip');
    const zip = await unzip(result.blob);
    expect(zipFileNames(zip)).toEqual([SINGLE, 'resourcepacks/ModLangForge-zh_tw.zip', INSTALL_GUIDE_FILE]);
    const inner = await JSZip.loadAsync((await zip.file('resourcepacks/ModLangForge-zh_tw.zip')?.async('uint8array')) ?? new Uint8Array());
    expect(zipFileNames(inner)).toEqual(['assets/a/lang/zh_tw.json', 'pack.mcmeta']);
    expect(await questTexts(zip, SINGLE)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('merged-pack with only quests has no resource pack', async () => {
    const zip = await unzip((await exportProjects([quests('pack', 'split')], opts())).blob);
    expect(zipFileNames(zip)).toEqual([SPLIT, INSTALL_GUIDE_FILE]);
  });

  it('separate-packs and lang-files add the quest files', async () => {
    const separate = await unzip((await exportProjects([mod, quests('pack')], opts({ kind: 'separate-packs' }))).blob);
    expect(zipFileNames(separate)).toEqual(['a-zh_tw.zip', SINGLE]);
    const lang = await exportProjects([quests('pack')], opts({ kind: 'lang-files', untranslated: 'keep-source' }));
    expect(lang.fileName).toBe('ModLangForge-lang.zip');
    const langZip = await unzip(lang.blob);
    expect(zipFileNames(langZip)).toEqual([SINGLE]);
    expect(await questTexts(langZip, SINGLE)).toEqual({ [DESC]: '第一行\n第二行\n第三行' });
  });

  it('keeps two modpacks apart', async () => {
    const zip = await unzip((await exportProjects([quests('p'), quests('q', 'split')], opts())).blob);
    expect(zipFileNames(zip)).toEqual([`p/${SINGLE}`, `q/${SPLIT}`, INSTALL_GUIDE_FILE]);
  });

  it('defaults to the single layout for stored projects without questLayout', async () => {
    const { questLayout: _layout, ...stored } = quests('pack', 'split');
    const zip = await unzip((await exportProjects([stored], opts())).blob);
    expect(zipFileNames(zip)).toEqual([SINGLE, INSTALL_GUIDE_FILE]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/export/quests.test.ts`
Expected: FAIL — `Failed to resolve import "../test/zipFiles"`／`buildBundle is not a function`。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/test/zipFiles.ts`**

```ts
import type JSZip from 'jszip';

/** 測試用：壓縮檔內的檔案路徑（不含資料夾項目），已排序 */
export function zipFileNames(zip: JSZip): string[] {
  return Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
}
```

`packages/core/package.json` 的 `exports` 改為：

```json
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*/index.ts",
    "./test/makeJar": "./src/test/makeJar.ts",
    "./test/zipFiles": "./src/test/zipFiles.ts"
  },
```

- [ ] **Step 4: Create `packages/core/src/export/questBundle.ts`**

```ts
import JSZip from 'jszip';
import { questLangPath, questLangText } from '../ftbquests/langFile';
import type { QuestLayout } from '../ftbquests/schema';

export const INSTALL_GUIDE_FILE = '安裝說明.txt';
export const RESOURCEPACKS_DIR = 'resourcepacks';

/** 一個整合包的任務譯文 */
export interface QuestPart {
  readonly modpackId: string;
  readonly layout: QuestLayout;
  readonly translations: Readonly<Record<string, string>>;
}

export interface BundleResourcePack {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface BundleOptions {
  /** 安裝說明的第一行 */
  readonly title: string;
  /** 沒有任何資源包內容時為 null */
  readonly resourcePack: BundleResourcePack | null;
  readonly quests: readonly QuestPart[];
}

/** 任務檔（路徑 → 內容）；沒有已翻條目的整合包略過；多個整合包時各放在 <modpackId>/ 底下以免互相覆蓋 */
export function questBundleFiles(parts: readonly QuestPart[]): [string, string][] {
  const filled = parts.filter((p) => Object.values(p.translations).some((text) => text !== ''));
  const prefix = (p: QuestPart): string => (filled.length > 1 ? `${p.modpackId}/` : '');
  return filled.map((p): [string, string] => [`${prefix(p)}${questLangPath(p.layout)}`, questLangText(p.translations)]);
}

/** 台灣繁中、玩家用語的安裝說明 */
export function installGuide(title: string, resourcePack: string | null, hasQuests: boolean): string {
  const steps = [
    '把這個壓縮檔解壓縮到整合包的資料夾（有 mods、config 資料夾的那一層）。',
    ...(resourcePack
      ? [`${RESOURCEPACKS_DIR} 資料夾裡的 ${resourcePack} 不用再解壓縮；進遊戲後到「選項 → 資源包」啟用它，語言選「繁體中文（台灣）」。`]
      : []),
    ...(hasQuests
      ? [
        'config 資料夾裡是 FTB 任務的翻譯，放好後重新進入世界就會顯示中文；還沒翻的任務會維持英文。',
        '在伺服器上玩時，FTB 任務的翻譯要放到伺服器的 config 資料夾（請伺服器管理員放置）。',
      ]
      : []),
  ];
  return [title, '', '安裝方式：', ...steps.map((step, i) => `${i + 1}. ${step}`), ''].join('\n');
}

/** 兩部分的下載檔：resourcepacks/ 放資源包、config/ 放任務翻譯，另附安裝說明 */
export async function buildBundle(opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  const quests = questBundleFiles(opts.quests);
  zip.file(INSTALL_GUIDE_FILE, installGuide(opts.title, opts.resourcePack?.fileName ?? null, quests.length > 0));
  if (opts.resourcePack) zip.file(`${RESOURCEPACKS_DIR}/${opts.resourcePack.fileName}`, opts.resourcePack.bytes);
  for (const [path, text] of quests) zip.file(path, text);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
```

- [ ] **Step 5: Replace `packages/core/src/export/buildResourcePack.ts`**

```ts
import JSZip from 'jszip';
import { isQuestProjectId, parseQuestProjectId } from '../ftbquests/ids';
import { questLayoutOf, questTranslations } from '../ftbquests/project';
import type { ModProject } from '../types';
import { buildGuidePackFiles } from './buildGuideFiles';
import { buildLangText, langFileName } from './buildLangFiles';
import { mergeSameNamespace } from './mergeNamespaces';
import { packFormatFor } from './packFormats';
import { buildBundle, questBundleFiles, type QuestPart } from './questBundle';
import type { ExportOptions, ExportResult } from './types';

const ZIP_MIME = 'application/zip';
const MERGED_FILE = 'ModLangForge-zh_tw.zip';
const SEPARATE_FILE = 'ModLangForge-packs.zip';
const LANG_FILE = 'ModLangForge-lang.zip';

function zipBytes(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function zipToBlob(zip: JSZip): Promise<Blob> {
  return new Blob([(await zipBytes(zip)) as BlobPart], { type: ZIP_MIME });
}

function packMcmeta(opts: ExportOptions): string {
  const meta = { pack: { pack_format: packFormatFor(opts.mcVersion), description: opts.description } };
  return JSON.stringify(meta, null, 2) + '\n';
}

function buildPackZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  zip.file('pack.mcmeta', packMcmeta(opts));
  for (const p of projects) {
    zip.file(`assets/${p.modId}/lang/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
    for (const [path, text] of buildGuidePackFiles(p)) zip.file(path, text);
  }
  return zip;
}

async function separateZip(projects: readonly ModProject[], opts: ExportOptions): Promise<JSZip> {
  const outer = new JSZip();
  const used = new Map<string, number>();
  for (const p of projects) {
    const inner = await zipBytes(buildPackZip([p], opts));
    const count = (used.get(p.modId) ?? 0) + 1;
    used.set(p.modId, count);
    outer.file(count === 1 ? `${p.modId}-zh_tw.zip` : `${p.modId}-${count}-zh_tw.zip`, inner);
  }
  return outer;
}

function langZip(projects: readonly ModProject[], opts: ExportOptions): JSZip {
  const zip = new JSZip();
  for (const p of projects) zip.file(`${p.modId}/${langFileName(p.format)}`, buildLangText(p, opts.untranslated));
  return zip;
}

async function langFiles(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  const [only] = projects;
  if (projects.length === 1 && only) {
    const mime = only.format === 'json' ? 'application/json' : 'text/plain';
    const blob = new Blob([buildLangText(only, opts.untranslated)], { type: `${mime};charset=utf-8` });
    return { fileName: langFileName(only.format), blob };
  }
  return { fileName: LANG_FILE, blob: await zipToBlob(langZip(projects, opts)) };
}

function questParts(projects: readonly ModProject[]): QuestPart[] {
  return projects.flatMap((p) => {
    const ref = parseQuestProjectId(p.id);
    return ref ? [{ modpackId: ref.modpackId, layout: questLayoutOf(p), translations: questTranslations(p) }] : [];
  });
}

/** 有任務專案時：任務檔只含已翻譯條目（遊戲自會退回英文），放在 config/ 路徑；資源包部分維持原本規則 */
async function exportWithQuests(others: readonly ModProject[], parts: readonly QuestPart[], opts: ExportOptions): Promise<ExportResult> {
  switch (opts.kind) {
    case 'merged-pack': {
      const resourcePack = others.length === 0
        ? null
        : { fileName: MERGED_FILE, bytes: await zipBytes(buildPackZip(mergeSameNamespace(others), opts)) };
      return { fileName: MERGED_FILE, blob: await buildBundle({ title: opts.description, resourcePack, quests: parts }) };
    }
    case 'separate-packs': {
      const outer = await separateZip(others, opts);
      for (const [path, text] of questBundleFiles(parts)) outer.file(path, text);
      return { fileName: SEPARATE_FILE, blob: await zipToBlob(outer) };
    }
    case 'lang-files': {
      const zip = langZip(mergeSameNamespace(others), opts);
      for (const [path, text] of questBundleFiles(parts)) zip.file(path, text);
      return { fileName: LANG_FILE, blob: await zipToBlob(zip) };
    }
  }
}

export async function exportProjects(projects: readonly ModProject[], opts: ExportOptions): Promise<ExportResult> {
  if (projects.length === 0) throw new Error('No projects selected for export');
  const parts = questParts(projects);
  if (parts.length > 0) return exportWithQuests(projects.filter((p) => !isQuestProjectId(p.id)), parts, opts);
  switch (opts.kind) {
    case 'merged-pack':
      return { fileName: MERGED_FILE, blob: await zipToBlob(buildPackZip(mergeSameNamespace(projects), opts)) };
    case 'separate-packs':
      return { fileName: SEPARATE_FILE, blob: await zipToBlob(await separateZip(projects, opts)) };
    case 'lang-files':
      return langFiles(mergeSameNamespace(projects), opts);
  }
}
```

- [ ] **Step 6: Export** — `packages/core/src/export/index.ts` 最後加入

```ts
export {
  buildBundle, type BundleOptions, type BundleResourcePack, INSTALL_GUIDE_FILE, installGuide, questBundleFiles, type QuestPart, RESOURCEPACKS_DIR,
} from './questBundle';
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core`
Expected: PASS（新測試與既有 export 測試全過），typecheck 無錯誤

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/export packages/core/src/test/zipFiles.ts packages/core/package.json
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): export FTB Quests translations next to resource packs"
```

---

### Task 9: 從整合包壓縮檔讀出任務文字（pure core (full code given)）

**Files:**
- Create: `packages/core/src/modpackImport/archiveContext.ts`（自 `archive.ts` 原樣搬出 `ArchiveReadOptions`、`ArchiveContext`、`loadZip`、`readText`、`openContext`，不複製）
- Create: `packages/core/src/modpackImport/questArchive.ts`
- Modify: `packages/core/src/modpackImport/archive.ts`
- Modify: `packages/core/src/modpackImport/modrinth.ts`、`packages/core/src/modpackImport/curseforge.ts`
- Modify: `packages/core/src/modpackImport/plan.ts`（`ImportedModpack.ftbquests?`）
- Modify: `packages/core/src/modpackImport/index.ts`
- Modify: `packages/core/src/test/modpackFixtures.ts`
- Test: `packages/core/src/modpackImport/questArchive.test.ts`、`packages/core/src/modpackImport/modrinth.test.ts`、`packages/core/src/modpackImport/curseforge.test.ts`（各新增測試；既有測試不改）

**Interfaces:**
- Consumes: `parseSnbt`、`SnbtParseError`、`SnbtCompound`（Task 1）、`readQuestLang`（Task 2）、`supportsQuestLang`、`QuestLayout`（Task 5）、`extractLegacyQuests`、`LegacyQuestBook`（Task 4）、`ModpackImportError`、`makeJar`、`fakeFetch`
- Produces:
  - `archiveContext.ts`：`interface ArchiveReadOptions`、`interface ArchiveContext`、`readText(ctx, path): Promise<string>`、`openContext(bytes, name, options?): Promise<ArchiveContext>`
  - `QUESTS_ROOT = 'overrides/config/ftbquests/quests/'`
  - `type ImportedQuests = { status: 'unsupported-version' } | { status: 'supported'; layout: QuestLayout; en: Readonly<Record<string, string>> }`
  - `interface QuestRead { quests: ImportedQuests | null; notes: readonly string[] }`
  - `unsupportedQuestNote(mcVersion: string): string`、`skippedQuestNote(n: number): string`
  - `readQuests(ctx: ArchiveContext, mcVersion: string): Promise<QuestRead>`
  - `readMrpack(...)` 回傳 `{ index, kubejs, ftbquests: QuestRead }`、`readCurseZip(...)` 回傳 `{ manifest, kubejs, ftbquests: QuestRead }`（`ArchiveReadOptions` 仍由 `archive.ts` 轉出）
  - `ImportedModpack.ftbquests?: ImportedQuests`；兩個匯入函式把 `QuestRead.notes` 接在既有 `notes` 之後
  - fixtures：`MR_INDEX_121`、`QUEST_EN`、`QUEST_LANG_SNBT`、`QUEST_CHAPTER_SNBT`、`CF_MANIFEST_121`；`mrpackBytes(extra?, index?)`、`modrinthRoutes(packBytes?)`、`curseZipBytes(manifest?, extra?)`、`curseforgeRoutes(packBytes?)`（不帶參數時與原本相同）

- [ ] **Step 1: Add fixtures** — `packages/core/src/test/modpackFixtures.ts`

(a) 在 `export const KUBEJS_EN = …;` 之後加入：

```ts
export const MR_INDEX_121 = { ...MR_INDEX, dependencies: { minecraft: '1.21.1', neoforge: '21.1.1' } };

/** 任務英文（lang 檔與章節檔抽取的結果相同） */
export const QUEST_EN = {
  'chapter.1A2B3C4D5E6F7081.title': 'Getting Started',
  'quest.44A5523F7A909209.title': 'Welcome',
  'quest.44A5523F7A909209.quest_desc': 'Line one\nLine two',
};

export const QUEST_LANG_SNBT = [
  '{',
  '\tchapter.1A2B3C4D5E6F7081.title: "Getting Started"',
  '\tquest.44A5523F7A909209.title: "Welcome"',
  '\tquest.44A5523F7A909209.quest_desc: [',
  '\t\t"Line one"',
  '\t\t"Line two"',
  '\t]',
  '}',
].join('\n');

export const QUEST_CHAPTER_SNBT = [
  '{',
  '\tid: "1A2B3C4D5E6F7081"',
  '\ttitle: "Getting Started"',
  '\tquests: [',
  '\t\t{',
  '\t\t\tid: "44A5523F7A909209"',
  '\t\t\ttitle: "Welcome"',
  '\t\t\tdescription: [',
  '\t\t\t\t"Line one"',
  '\t\t\t\t"Line two"',
  '\t\t\t]',
  '\t\t}',
  '\t]',
  '}',
].join('\n');
```

(b) 把 `mrpackBytes` 改為：

```ts
export function mrpackBytes(extra: Readonly<Record<string, string>> = {}, index: unknown = MR_INDEX): Promise<Uint8Array> {
  return makeJar({
    'modrinth.index.json': JSON.stringify(index),
    'overrides/kubejs/assets/kubejs/lang/en_us.json': JSON.stringify(KUBEJS_EN),
    ...extra,
  });
}
```

(c) `modrinthRoutes` 的簽名與第一行改為：

```ts
export async function modrinthRoutes(packBytes?: Uint8Array): Promise<Record<string, unknown>> {
  const bytes = packBytes ?? (await mrpackBytes());
```

(d) 在 `export const CF_MANIFEST = { … };` 之後加入：

```ts
export const CF_MANIFEST_121 = { ...CF_MANIFEST, minecraft: { version: '1.21.1', modLoaders: [{ id: 'neoforge-21.1.1', primary: true }] } };
```

把 `curseZipBytes` 改為：

```ts
export function curseZipBytes(manifest: unknown = CF_MANIFEST, extra: Readonly<Record<string, string>> = {}): Promise<Uint8Array> {
  return makeJar({
    'manifest.json': JSON.stringify(manifest),
    'overrides/kubejs/assets/kubejs/lang/en_us.json': JSON.stringify(KUBEJS_EN),
    ...extra,
  });
}
```

(e) `curseforgeRoutes` 的簽名與第一行改為：

```ts
export async function curseforgeRoutes(packBytes?: Uint8Array): Promise<Record<string, unknown>> {
  const bytes = packBytes ?? (await curseZipBytes());
```

- [ ] **Step 2: Write the failing tests**

`packages/core/src/modpackImport/questArchive.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { makeJar } from '../test/makeJar';
import { CF_MANIFEST_121, MR_INDEX, MR_INDEX_121, QUEST_CHAPTER_SNBT, QUEST_EN, QUEST_LANG_SNBT } from '../test/modpackFixtures';
import { readCurseZip, readMrpack, skippedQuestNote, unsupportedQuestNote } from './index';

const ROOT = 'overrides/config/ftbquests/quests';
const BACKSLASH = String.fromCharCode(92);

function pack(files: Readonly<Record<string, string>>, index: unknown = MR_INDEX_121): Promise<Uint8Array> {
  return makeJar({ 'modrinth.index.json': JSON.stringify(index), ...files });
}

async function quests(files: Readonly<Record<string, string>>, index?: unknown) {
  return (await readMrpack(await pack(files, index), 'p.mrpack')).ftbquests;
}

describe('readMrpack: FTB quests', () => {
  it('prefers lang/en_us.snbt (single) and reads nothing else', async () => {
    expect(await quests({
      [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT,
      [`${ROOT}/lang/zh_tw.snbt`]: '{ broken',
      [`${ROOT}/lang/en_us/extra.snbt`]: '{ broken',
      [`${ROOT}/chapters/broken.snbt`]: '{ broken',
    })).toEqual({ quests: { status: 'supported', layout: 'single', en: QUEST_EN }, notes: [] });
  });

  it('matches the locale file name case-insensitively and notes out-of-scope keys', async () => {
    const lang = '{\n\tquest.44A5523F7A909209.title: "Welcome"\n\ttask.5555555555555555.title: "Collect"\n\treward_table.6666666666666666.title: "Loot"\n}';
    expect(await quests({ [`${ROOT}/lang/en_US.snbt`]: lang })).toEqual({
      quests: { status: 'supported', layout: 'single', en: { 'quest.44A5523F7A909209.title': 'Welcome' } },
      notes: [skippedQuestNote(2)],
    });
    expect(skippedQuestNote(2)).toBe('略過 2 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）');
  });

  it('merges every file under lang/en_us/ (split), including JSON5-style files', async () => {
    expect(await quests({
      [`${ROOT}/lang/en_us/chapters/getting_started.snbt`]: '{\n  "chapter.1A2B3C4D5E6F7081.title": "Getting Started",\n}\n',
      [`${ROOT}/lang/en_us/quests.snbt`]: '{\n\tquest.44A5523F7A909209.title: "Welcome"\n\tquest.44A5523F7A909209.quest_desc: ["Line one", "Line two"]\n}',
    })).toEqual({ quests: { status: 'supported', layout: 'split', en: QUEST_EN }, notes: [] });
  });

  it('extracts text from chapter files when there is no lang file (single)', async () => {
    expect(await quests({
      [`${ROOT}/data.snbt`]: '{\n\tversion: 13\n\ttitle: "Example Book"\n}',
      [`${ROOT}/chapters/getting_started.snbt`]: QUEST_CHAPTER_SNBT,
      [`${ROOT}/chapters/nested/ignored.snbt`]: '{ broken',
    })).toEqual({ quests: { status: 'supported', layout: 'single', en: { 'file.0000000000000001.title': 'Example Book', ...QUEST_EN } }, notes: [] });
  });

  it('reads entry names written with backslashes', async () => {
    const name = [ROOT, 'lang', 'en_us.snbt'].join('/').split('/').join(BACKSLASH);
    expect((await quests({ [name]: QUEST_LANG_SNBT })).quests).toEqual({ status: 'supported', layout: 'single', en: QUEST_EN });
  });

  it('skips quest text below Minecraft 1.21 without parsing it', async () => {
    expect(await quests({ [`${ROOT}/chapters/a.snbt`]: '{ broken' }, MR_INDEX)).toEqual({
      quests: { status: 'unsupported-version' }, notes: [unsupportedQuestNote('1.20.1')],
    });
    expect(unsupportedQuestNote('1.20.1')).toBe('整合包為 Minecraft 1.20.1（低於 1.21），FTB 任務文字暫不支援翻譯，已略過');
  });

  it('returns nothing without quest files or without any text', async () => {
    expect(await quests({})).toEqual({ quests: null, notes: [] });
    expect(await quests({ [`${ROOT}/chapters/nested/x.snbt`]: '{}' })).toEqual({ quests: null, notes: [] });
    expect(await quests({ [`${ROOT}/chapters/a.snbt`]: '{ title: "No id" }' })).toEqual({
      quests: null, notes: ['略過 1 個沒有有效 ID 的任務物件（遊戲載入時會重新產生 ID，無法對應翻譯）'],
    });
  });

  it('stops with the file path and line when a quest file cannot be parsed', async () => {
    await expect(quests({ [`${ROOT}/lang/en_us.snbt`]: '{\n\tquest.44A5523F7A909209.title: "x\n}' })).rejects.toThrow(
      `${ROOT}/lang/en_us.snbt 解析失敗：第 2 行：字串缺少結尾的引號（字串不可跨行）`,
    );
  });

  it('counts quest files against the shared decompressed budget', async () => {
    const bytes = await pack({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT });
    const budget = JSON.stringify(MR_INDEX_121).length + 10;
    await expect(readMrpack(bytes, 'p.mrpack', { maxUncompressedBytes: budget })).rejects.toThrow('p.mrpack 解壓後內容超過');
    await expect(readMrpack(bytes, 'p.mrpack')).resolves.toBeDefined();
  });
});

describe('readCurseZip: FTB quests', () => {
  it('reads quest text from a CurseForge zip', async () => {
    const bytes = await makeJar({ 'manifest.json': JSON.stringify(CF_MANIFEST_121), [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT });
    expect((await readCurseZip(bytes, 'p.zip')).ftbquests).toEqual({ quests: { status: 'supported', layout: 'single', en: QUEST_EN }, notes: [] });
  });
});
```

在 `packages/core/src/modpackImport/modrinth.test.ts` 的 import 改為：

```ts
import { KUBEJS_EN, MR_API, MR_INDEX_121, MR_OLD_PACK_URL, modrinthRoutes, mrpackBytes, QUEST_EN, QUEST_LANG_SNBT } from '../test/modpackFixtures';
```

並在 `describe('importFromModrinth', …)` 內最後加入：

```ts
  it('carries FTB quest text from a 1.21 pack', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/lang/en_us.snbt': QUEST_LANG_SNBT }, MR_INDEX_121);
    const result = await importFromModrinth(fakeFetch(await modrinthRoutes(bytes)), { ref: 'example-pack' });
    expect(result).toMatchObject({ mcVersion: '1.21.1', loader: 'neoforge', ftbquests: { status: 'supported', layout: 'single', en: QUEST_EN } });
  });

  it('marks quest files of packs below 1.21 as unsupported and says so', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/chapters/a.snbt': '{}' });
    const result = await importFromModrinth(fakeFetch(await modrinthRoutes(bytes)), { ref: 'example-pack' });
    expect(result.ftbquests).toEqual({ status: 'unsupported-version' });
    expect(result.notes.at(-1)).toBe('整合包為 Minecraft 1.20.1（低於 1.21），FTB 任務文字暫不支援翻譯，已略過');
  });
```

在 `packages/core/src/modpackImport/curseforge.test.ts` 的 import 改為：

```ts
import {
  CF_API, CF_DOWNLOAD, CF_FAKE_KEY, CF_MANIFEST, CF_MANIFEST_121, CF_OLD_DOWNLOAD, curseforgeRoutes, curseZipBytes, KUBEJS_EN, QUEST_EN, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
```

並在 `describe('importFromCurseforge', …)` 內最後加入：

```ts
  it('carries FTB quest text after the mod notes', async () => {
    const bytes = await curseZipBytes(CF_MANIFEST_121, { 'overrides/config/ftbquests/quests/lang/en_us.snbt': `${QUEST_LANG_SNBT.slice(0, -1)}\ttask.5555555555555555.title: "x"\n}` });
    const result = await importFromCurseforge(fakeFetch(await curseforgeRoutes(bytes)), args);
    expect(result.ftbquests).toEqual({ status: 'supported', layout: 'single', en: QUEST_EN });
    expect(result.notes).toEqual([
      'CurseForge 查不到專案 32274，未列入模組清單', '略過非模組專案 faithful', '略過 1 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）',
    ]);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- src/modpackImport`
Expected: FAIL — `skippedQuestNote is not a function`、`ftbquests` 為 `undefined`（尚未讀取任務檔）；既有測試仍 PASS。記錄 RED。

- [ ] **Step 4: Create `packages/core/src/modpackImport/archiveContext.ts`**（自 `archive.ts` 搬出，內容不變，`readText` 與 `openContext` 加上 `export`）

```ts
import JSZip from 'jszip';
import { MAX_JAR_BYTES, MAX_UNCOMPRESSED_BYTES } from '../jar/errors';
import { ModpackImportError } from './errors';

export interface ArchiveReadOptions {
  /** 解壓後內容總上限（所有讀取的檔案共用），預設 MAX_UNCOMPRESSED_BYTES */
  readonly maxUncompressedBytes?: number;
}

/** 單次讀取的上下文；totalBytes 為所有已讀檔案共用的解壓後累計量（同 jar/readJar 的做法） */
export interface ArchiveContext {
  readonly zip: JSZip;
  readonly name: string;
  readonly limit: number;
  totalBytes: number;
}

const MB = 1024 * 1024;

async function loadZip(bytes: Uint8Array, name: string): Promise<JSZip> {
  if (bytes.byteLength > MAX_JAR_BYTES) throw new ModpackImportError(`${name} 超過 ${MAX_JAR_BYTES} bytes`);
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new ModpackImportError(`${name} 不是有效的壓縮檔`);
  }
}

/** 讀取檔案文字並累計解壓後大小，超過上限即丟錯 */
export async function readText(ctx: ArchiveContext, path: string): Promise<string> {
  const file = ctx.zip.file(path);
  if (!file) throw new ModpackImportError(`${ctx.name} 裡沒有 ${path}`);
  const text = await file.async('string');
  ctx.totalBytes += text.length;
  if (ctx.totalBytes > ctx.limit) {
    throw new ModpackImportError(`${ctx.name} 解壓後內容超過 ${Math.round(ctx.limit / MB)} MB 上限`);
  }
  return text;
}

export async function openContext(bytes: Uint8Array, name: string, options?: ArchiveReadOptions): Promise<ArchiveContext> {
  const zip = await loadZip(bytes, name);
  return { zip, name, limit: options?.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES, totalBytes: 0 };
}
```

- [ ] **Step 5: Create `packages/core/src/modpackImport/questArchive.ts`**

```ts
import { extractLegacyQuests, type LegacyQuestBook } from '../ftbquests/extract';
import { readQuestLang } from '../ftbquests/langFile';
import { type QuestLayout, supportsQuestLang } from '../ftbquests/schema';
import { parseSnbt, type SnbtCompound, SnbtParseError } from '../ftbquests/snbt';
import { type ArchiveContext, readText } from './archiveContext';
import { ModpackImportError } from './errors';

/** 只讀 overrides/ 底下的 FTB Quests 任務書 */
export const QUESTS_ROOT = 'overrides/config/ftbquests/quests/';

export type ImportedQuests =
  | { readonly status: 'unsupported-version' }
  | { readonly status: 'supported'; readonly layout: QuestLayout; readonly en: Readonly<Record<string, string>> };

export interface QuestRead {
  /** 沒有任務檔、或 MC ≥ 1.21 卻沒有任何任務文字時為 null */
  readonly quests: ImportedQuests | null;
  /** 給維護者看的提示 */
  readonly notes: readonly string[];
}

/** FTB Quests 1.21.x 的 LANG_FILE_PAT 為 ^\w+\.snbt$，locale 取檔名並轉小寫 */
const SINGLE_FILE = /^lang\/en_us\.snbt$/i;
/** FTB Quests 26.x 的 TranslationTable.loadAndCombine 以 Files.walk 遞迴讀取 lang/<locale>/ */
const SPLIT_FILE = /^lang\/en_us\/.+\.snbt$/i;
/** BaseQuestFile 以 Files.list 讀 chapters/，不遞迴 */
const CHAPTER_FILE = /^chapters\/[^/]+\.snbt$/;
const NONE: QuestRead = { quests: null, notes: [] };

/** [相對 quests/ 的路徑（反斜線視同 /）, 壓縮檔內原始名稱] */
type QuestFile = readonly [string, string];

export function unsupportedQuestNote(mcVersion: string): string {
  return `整合包為 Minecraft ${mcVersion}（低於 1.21），FTB 任務文字暫不支援翻譯，已略過`;
}

export function skippedQuestNote(n: number): string {
  return `略過 ${n} 條不在翻譯範圍或格式不符的任務文字（例如獎勵表、任務項目的標題）`;
}

function questFiles(ctx: ArchiveContext): QuestFile[] {
  return Object.keys(ctx.zip.files)
    .flatMap((raw): QuestFile[] => {
      const path = raw.replaceAll('\\', '/');
      return path.startsWith(QUESTS_ROOT) && path.endsWith('.snbt') ? [[path.slice(QUESTS_ROOT.length), raw]] : [];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** 經由 readText 讀取，計入共用的解壓大小上限 */
async function readCompound(ctx: ArchiveContext, [rel, raw]: QuestFile): Promise<SnbtCompound> {
  const text = await readText(ctx, raw);
  try {
    return parseSnbt(text);
  } catch (err) {
    if (err instanceof SnbtParseError) throw new ModpackImportError(`${QUESTS_ROOT}${rel} 解析失敗：${err.message}`);
    throw err;
  }
}

/** 逐檔順序讀取以控制記憶體；路徑排序後讀到的同名 key 取代前者 */
async function readLangFiles(ctx: ArchiveContext, files: readonly QuestFile[]): Promise<{ en: Readonly<Record<string, string>>; skipped: number }> {
  let en: Readonly<Record<string, string>> = {};
  let skipped = 0;
  for (const file of files) {
    const read = readQuestLang(await readCompound(ctx, file));
    en = { ...en, ...read.texts };
    skipped += read.skipped;
  }
  return { en, skipped };
}

async function readLegacy(ctx: ArchiveContext, files: readonly QuestFile[]): Promise<{ en: Readonly<Record<string, string>>; notes: readonly string[] }> {
  const optional = async (rel: string): Promise<SnbtCompound | undefined> => {
    const file = files.find(([r]) => r === rel);
    return file ? readCompound(ctx, file) : undefined;
  };
  const data = await optional('data.snbt');
  const chapterGroups = await optional('chapter_groups.snbt');
  const chapters: SnbtCompound[] = [];
  for (const file of files.filter(([rel]) => CHAPTER_FILE.test(rel))) chapters.push(await readCompound(ctx, file));
  const book: LegacyQuestBook = { ...(data ? { data } : {}), ...(chapterGroups ? { chapterGroups } : {}), chapters };
  const { texts, notes } = extractLegacyQuests(book);
  return { en: texts, notes };
}

function supportedRead(layout: QuestLayout, en: Readonly<Record<string, string>>, notes: readonly string[]): QuestRead {
  return Object.keys(en).length === 0 ? { quests: null, notes } : { quests: { status: 'supported', layout, en }, notes };
}

/**
 * 讀取 overrides/config/ftbquests/quests/：lang/en_us.snbt（single）優先，其次 lang/en_us/**.snbt（split），
 * 都沒有時從 data.snbt、chapter_groups.snbt、chapters/*.snbt 抽取（single）。MC < 1.21 不解析，只標記 unsupported-version。
 */
export async function readQuests(ctx: ArchiveContext, mcVersion: string): Promise<QuestRead> {
  const files = questFiles(ctx);
  if (files.length === 0) return NONE;
  if (!supportsQuestLang(mcVersion)) return { quests: { status: 'unsupported-version' }, notes: [unsupportedQuestNote(mcVersion)] };
  const single = files.filter(([rel]) => SINGLE_FILE.test(rel));
  const split = files.filter(([rel]) => SPLIT_FILE.test(rel));
  const lang = single.length > 0 ? single : split;
  if (lang.length > 0) {
    const { en, skipped } = await readLangFiles(ctx, lang);
    return supportedRead(single.length > 0 ? 'single' : 'split', en, skipped > 0 ? [skippedQuestNote(skipped)] : []);
  }
  const legacy = await readLegacy(ctx, files);
  return supportedRead('single', legacy.en, legacy.notes);
}
```

- [ ] **Step 6: Replace `packages/core/src/modpackImport/archive.ts`**

```ts
import { LangParseError, parseJsonLang } from '../lang';
import { stripBom } from '../lang/types';
import { isValidNamespace } from '../modpack/schema';
import { type ArchiveContext, type ArchiveReadOptions, openContext, readText } from './archiveContext';
import { ModpackImportError } from './errors';
import { parseCurseManifest, parseMrpackIndex, type ParsedCurseManifest, type ParsedMrpack } from './manifest';
import { type QuestRead, readQuests } from './questArchive';

export type { ArchiveReadOptions } from './archiveContext';

/** 命名空間 → KubeJS 英文原文 */
export type KubejsEnglish = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const MRPACK_INDEX = 'modrinth.index.json';
export const CURSE_MANIFEST = 'manifest.json';

/** 只讀 overrides/ 底下的 KubeJS 英文語言檔 */
const KUBEJS_LANG = /^overrides\/kubejs\/assets\/([^/]+)\/lang\/en_us\.json$/;

async function readJson(ctx: ArchiveContext, path: string): Promise<unknown> {
  const text = await readText(ctx, path);
  try {
    return JSON.parse(stripBom(text)) as unknown;
  } catch (err) {
    throw new ModpackImportError(`${path} JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readNamespace(ctx: ArchiveContext, ns: string, path: string): Promise<readonly [string, Readonly<Record<string, string>>]> {
  const text = await readText(ctx, path);
  try {
    return [ns, parseJsonLang(text).entries];
  } catch (err) {
    if (err instanceof LangParseError) throw new ModpackImportError(`${path} 讀取失敗：${err.message}`);
    throw err;
  }
}

/** 壓縮檔內的反斜線路徑視同 /；命名空間不合法（含 . 與 ..）或沒有任何字串的檔案略過；非字串值略過；逐檔順序讀取以控制記憶體 */
async function readKubejs(ctx: ArchiveContext): Promise<KubejsEnglish> {
  const found = Object.keys(ctx.zip.files)
    .flatMap((path) => {
      const ns = KUBEJS_LANG.exec(path.replaceAll('\\', '/'))?.[1];
      return ns !== undefined && isValidNamespace(ns) ? [[ns, path] as const] : [];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const entries: (readonly [string, Readonly<Record<string, string>>])[] = [];
  for (const [ns, path] of found) {
    entries.push(await readNamespace(ctx, ns, path));
  }
  return Object.fromEntries(entries.filter(([, en]) => Object.keys(en).length > 0));
}

export async function readMrpack(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ index: ParsedMrpack; kubejs: KubejsEnglish; ftbquests: QuestRead }> {
  const ctx = await openContext(bytes, name, options);
  const index = parseMrpackIndex(await readJson(ctx, MRPACK_INDEX));
  const kubejs = await readKubejs(ctx);
  return { index, kubejs, ftbquests: await readQuests(ctx, index.mcVersion) };
}

export async function readCurseZip(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ manifest: ParsedCurseManifest; kubejs: KubejsEnglish; ftbquests: QuestRead }> {
  const ctx = await openContext(bytes, name, options);
  const manifest = parseCurseManifest(await readJson(ctx, CURSE_MANIFEST));
  const kubejs = await readKubejs(ctx);
  return { manifest, kubejs, ftbquests: await readQuests(ctx, manifest.mcVersion) };
}
```

- [ ] **Step 7: Carry quest text through the importers**

`packages/core/src/modpackImport/plan.ts`：在 import 區加入 `import type { ImportedQuests } from './questArchive';`，並在 `ImportedModpack` 的 `readonly kubejs: KubejsEnglish;` 之後加入：

```ts
  /** FTB 任務；整合包沒有任務檔時省略 */
  readonly ftbquests?: ImportedQuests;
```

`packages/core/src/modpackImport/modrinth.ts`：

- `const { index, kubejs } = await readMrpack(await fetchBytes(fetchImpl, file.url), file.filename);` 改為 `const { index, kubejs, ftbquests } = await readMrpack(await fetchBytes(fetchImpl, file.url), file.filename);`
- `notes` 陣列最後加入一行 `...ftbquests.notes,`
- 回傳物件的 `kubejs,` 之後加入 `...(ftbquests.quests ? { ftbquests: ftbquests.quests } : {}),`

`packages/core/src/modpackImport/curseforge.ts`：

- `const { manifest, kubejs } = await readCurseZip(file.bytes, file.name);` 改為 `const { manifest, kubejs, ftbquests } = await readCurseZip(file.bytes, file.name);`
- 回傳物件的 `kubejs,` 之後加入 `...(ftbquests.quests ? { ftbquests: ftbquests.quests } : {}),`，並把 `notes,` 改為 `notes: [...notes, ...ftbquests.notes],`

`packages/core/src/modpackImport/index.ts` 在 `export * from './archive';` 之後加入：

```ts
export * from './questArchive';
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/modpackImport && npm run typecheck -w @mlf/core`
Expected: PASS（新測試與既有 archive／modrinth／curseforge／plan／run 測試全過），typecheck 無錯誤

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/modpackImport packages/core/src/test/modpackFixtures.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): read FTB Quests text from modpack archives"
```

---

### Task 10: 任務英文的新增／更新計畫（pure core (full code given)）

**Files:**
- Create: `packages/core/src/modpackImport/questPlan.ts`
- Modify: `packages/core/src/modpackImport/plan.ts`
- Modify: `packages/core/src/modpackImport/index.ts`
- Test: `packages/core/src/modpackImport/questPlan.test.ts`、`packages/core/src/modpackImport/plan.test.ts`（新增 describe；既有測試不改）

**Interfaces:**
- Consumes: `findKeyConflicts`、`KeyConflict`（`pipeline/addSourceVersion`）、`checkQuestFormat`（Task 3）、`FtbquestsMeta`、`supportsQuestLang`（Task 5）、`ImportedQuests`（Task 9）、`ModpackImportError`
- Produces:
  - `QUEST_CONFLICT_LABEL = 'FTB 任務'`（衝突清單的 `ns` 欄位；不是合法命名空間，不會與 KubeJS 撞名）
  - `interface QuestChange { created: boolean; addedKeys: readonly string[]; conflicts: readonly KeyConflict[] }`
  - `interface QuestPlanInput { mcVersion; existingMeta: FtbquestsMeta | undefined; existingEn: Readonly<Record<string, string>> | undefined; incoming: ImportedQuests | undefined }`
  - `type QuestPlan = { kind: 'write'; meta: FtbquestsMeta | undefined; en?: Record; change?: QuestChange } | { kind: 'refused'; conflicts: readonly KeyConflict[] }`
  - `planQuestWrite(input: QuestPlanInput): QuestPlan`（既有任務資料而這次 MC < 1.21 時丟出 `ModpackImportError`，不寫入任何檔案）
  - `ExistingModpack.questsEn?`；`ModpackPlan` 的 write 新增 `questsEn?`、`questChange?`；任務格式碼衝突與 KubeJS 衝突合併，整次拒絕

- [ ] **Step 1: Write the failing tests**

`packages/core/src/modpackImport/questPlan.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { planQuestWrite } from './index';

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const EN = { [TITLE]: '&aWelcome', [DESC]: 'Line one\nLine two' };
const SUPPORTED = { status: 'supported', layout: 'single' } as const;
const incoming = (layout: 'single' | 'split' = 'single') => ({ status: 'supported', layout, en: EN }) as const;

describe('planQuestWrite', () => {
  it('creates en_us.json and the supported field for a new pack', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: undefined, existingEn: undefined, incoming: incoming('split') })).toEqual({
      kind: 'write', meta: { status: 'supported', layout: 'split' }, en: EN,
      change: { created: true, addedKeys: [TITLE, DESC], conflicts: [] },
    });
  });

  it('adds new keys, keeps the existing English for changed lines and lists them', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: '&aWelcome!' }, incoming: incoming() })).toEqual({
      kind: 'write', meta: SUPPORTED, en: { [TITLE]: '&aWelcome!', [DESC]: 'Line one\nLine two' },
      change: { created: false, addedKeys: [DESC], conflicts: [{ key: TITLE, existing: '&aWelcome!', incoming: '&aWelcome', formatChanged: false }] },
    });
  });

  it('does not rewrite en_us.json when nothing was added, and a different line count is not a format change', () => {
    const plan = planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: '&aWelcome', [DESC]: 'Line one' }, incoming: incoming() });
    expect(plan).toEqual({
      kind: 'write', meta: SUPPORTED,
      change: { created: false, addedKeys: [], conflicts: [{ key: DESC, existing: 'Line one', incoming: 'Line one\nLine two', formatChanged: false }] },
    });
  });

  it('refuses when a quest format code changed', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: { [TITLE]: 'Welcome' }, incoming: incoming() })).toEqual({
      kind: 'refused', conflicts: [{ key: TITLE, existing: 'Welcome', incoming: '&aWelcome', formatChanged: true }],
    });
  });

  it('marks packs below 1.21 as unsupported', () => {
    expect(planQuestWrite({ mcVersion: '1.20.1', existingMeta: undefined, existingEn: undefined, incoming: { status: 'unsupported-version' } })).toEqual({
      kind: 'write', meta: { status: 'unsupported-version' },
    });
  });

  it('keeps the existing field when the new version has no quest files, dropping a stale unsupported-version on 1.21+', () => {
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: SUPPORTED, existingEn: EN, incoming: undefined })).toEqual({ kind: 'write', meta: SUPPORTED });
    expect(planQuestWrite({ mcVersion: '1.21.1', existingMeta: { status: 'unsupported-version' }, existingEn: undefined, incoming: undefined })).toEqual({ kind: 'write', meta: undefined });
    expect(planQuestWrite({ mcVersion: '1.20.1', existingMeta: { status: 'unsupported-version' }, existingEn: undefined, incoming: undefined })).toEqual({
      kind: 'write', meta: { status: 'unsupported-version' },
    });
  });

  it('stops instead of dropping existing quest data when the new version is below 1.21', () => {
    expect(() => planQuestWrite({ mcVersion: '1.20.1', existingMeta: SUPPORTED, existingEn: EN, incoming: { status: 'unsupported-version' } })).toThrow(
      '這次匯入的是 Minecraft 1.20.1（低於 1.21），但已有 FTB 任務資料（ftbquests/en_us.json）；未寫入任何檔案，請人工確認',
    );
  });
});
```

在 `packages/core/src/modpackImport/plan.test.ts` 最後加入：

```ts
describe('planModpackWrite: FTB quests', () => {
  const TITLE = 'quest.44A5523F7A909209.title';
  const quests = { status: 'supported', layout: 'single', en: { [TITLE]: 'Welcome' } } as const;
  const newer: ImportedModpack = { ...incoming, mcVersion: '1.21.1', loader: 'neoforge', ftbquests: quests };
  const questExisting = (questsEn: Readonly<Record<string, string>>) => ({
    meta: catalogModpackSchema.parse({
      id: 'example-pack', name: 'Example Pack', summary: '手寫簡介', authors: ['someone'],
      links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
      source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.4.0', mcVersion: '1.21.1', loader: 'neoforge' },
      mods: [], translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } },
      ftbquests: { status: 'supported', layout: 'split' }, updatedAt: '2026-10-01',
    }),
    kubejsEn: {},
    questsEn,
  });

  it('writes quest English and the ftbquests field for a new modpack', () => {
    expect(planModpackWrite('example-pack', null, newer, '2026-10-17')).toMatchObject({
      kind: 'write', meta: { ftbquests: { status: 'supported', layout: 'single' } }, questsEn: { [TITLE]: 'Welcome' },
      questChange: { created: true, addedKeys: [TITLE], conflicts: [] },
    });
  });

  it('keeps the quest field and leaves quest English alone when the new version has no quest files', () => {
    const { ftbquests: _q, ...noQuests } = newer;
    const plan = planModpackWrite('example-pack', questExisting({ [TITLE]: 'Welcome' }), noQuests, '2026-10-18');
    expect(plan.kind === 'write' ? [plan.meta.ftbquests, 'questsEn' in plan, 'questChange' in plan] : null).toEqual([{ status: 'supported', layout: 'split' }, false, false]);
  });

  it('refuses the whole write, KubeJS included, when a quest format code changed', () => {
    expect(planModpackWrite('example-pack', questExisting({ [TITLE]: '&aWelcome' }), newer, '2026-10-18')).toEqual({
      kind: 'refused', conflicts: [{ ns: 'FTB 任務', key: TITLE, existing: '&aWelcome', incoming: 'Welcome', formatChanged: true }],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- src/modpackImport/questPlan.test.ts src/modpackImport/plan.test.ts`
Expected: FAIL — `planQuestWrite is not a function`；plan 測試的 `meta.ftbquests` 為 `undefined`。記錄 RED。

- [ ] **Step 3: Create `packages/core/src/modpackImport/questPlan.ts`**

```ts
import { checkQuestFormat } from '../ftbquests/formatCodes';
import { type FtbquestsMeta, supportsQuestLang } from '../ftbquests/schema';
import { findKeyConflicts, type KeyConflict } from '../pipeline/addSourceVersion';
import { ModpackImportError } from './errors';
import type { ImportedQuests } from './questArchive';

/** 衝突清單中標示任務文字；不是合法命名空間，不會與 KubeJS 撞名 */
export const QUEST_CONFLICT_LABEL = 'FTB 任務';

export interface QuestChange {
  readonly created: boolean;
  readonly addedKeys: readonly string[];
  /** 原文不同的 key（保留既有原文） */
  readonly conflicts: readonly KeyConflict[];
}

export interface QuestPlanInput {
  readonly mcVersion: string;
  readonly existingMeta: FtbquestsMeta | undefined;
  readonly existingEn: Readonly<Record<string, string>> | undefined;
  readonly incoming: ImportedQuests | undefined;
}

export type QuestPlan =
  | { readonly kind: 'write'; readonly meta: FtbquestsMeta | undefined; readonly en?: Readonly<Record<string, string>>; readonly change?: QuestChange }
  | { readonly kind: 'refused'; readonly conflicts: readonly KeyConflict[] };

/** 沿用 findKeyConflicts 找出原文不同的 key；格式碼改變與否以 FTB 任務格式碼判斷（換行數量不算） */
function questConflicts(base: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): KeyConflict[] {
  return findKeyConflicts(base, incoming).map((c) => ({ ...c, formatChanged: checkQuestFormat(c.existing, c.incoming) !== null }));
}

/** 新版沒有任務檔：沿用既有欄位；MC 已升到 1.21 以上時移除過時的 unsupported-version */
function keptMeta(existing: FtbquestsMeta | undefined, mcVersion: string): FtbquestsMeta | undefined {
  return existing?.status === 'unsupported-version' && supportsQuestLang(mcVersion) ? undefined : existing;
}

/** 規則同 KubeJS：新 key 依序附加、原文不同保留既有原文並列出、格式碼改變則整次拒絕；不動 zh_tw.json */
export function planQuestWrite({ mcVersion, existingMeta, existingEn, incoming }: QuestPlanInput): QuestPlan {
  if (existingEn !== undefined && !supportsQuestLang(mcVersion)) {
    throw new ModpackImportError(`這次匯入的是 Minecraft ${mcVersion}（低於 1.21），但已有 FTB 任務資料（ftbquests/en_us.json）；未寫入任何檔案，請人工確認`);
  }
  if (!incoming) return { kind: 'write', meta: keptMeta(existingMeta, mcVersion) };
  if (incoming.status === 'unsupported-version') return { kind: 'write', meta: { status: 'unsupported-version' } };
  const base = existingEn ?? {};
  const conflicts = questConflicts(base, incoming.en);
  const refused = conflicts.filter((c) => c.formatChanged);
  if (refused.length > 0) return { kind: 'refused', conflicts: refused };
  const addedKeys = Object.keys(incoming.en).filter((k) => !Object.hasOwn(base, k));
  const change: QuestChange = { created: existingEn === undefined, addedKeys, conflicts };
  const meta: FtbquestsMeta = { status: 'supported', layout: incoming.layout };
  if (!change.created && addedKeys.length === 0) return { kind: 'write', meta, change };
  const en = { ...base, ...Object.fromEntries(addedKeys.map((k) => [k, incoming.en[k] ?? ''])) };
  return { kind: 'write', meta, en, change };
}
```

- [ ] **Step 4: Merge quest planning into `planModpackWrite`** — `packages/core/src/modpackImport/plan.ts`

(a) import 區加入：

```ts
import type { FtbquestsMeta } from '../ftbquests/schema';
import { planQuestWrite, QUEST_CONFLICT_LABEL, type QuestChange } from './questPlan';
```

(b) `ExistingModpack` 改為：

```ts
export interface ExistingModpack {
  readonly meta: CatalogModpack;
  readonly kubejsEn: KubejsEnglish;
  /** data/modpacks/<id>/ftbquests/en_us.json；不存在時省略 */
  readonly questsEn?: Readonly<Record<string, string>>;
}
```

(c) `ModpackPlan` 改為：

```ts
export type ModpackPlan =
  | {
    readonly kind: 'write';
    readonly meta: CatalogModpack;
    readonly kubejsEn: KubejsEnglish;
    readonly changes: readonly NamespaceChange[];
    /** 只在需要寫入 ftbquests/en_us.json 時存在 */
    readonly questsEn?: Readonly<Record<string, string>>;
    readonly questChange?: QuestChange;
  }
  | { readonly kind: 'refused'; readonly conflicts: readonly NamespacedConflict[] };
```

(d) 把整個 `planModpackWrite` 換成下面兩個函式：

```ts
function withQuestMeta(meta: CatalogModpack, ftbquests: FtbquestsMeta | undefined): CatalogModpack {
  const { ftbquests: _previous, ...rest } = meta;
  return ftbquests ? { ...rest, ftbquests } : rest;
}

/** 決定要寫入的 modpack.json、KubeJS 英文與 FTB 任務英文；任何格式碼衝突都拒絕寫入 */
export function planModpackWrite(id: string, existing: ExistingModpack | null, incoming: ImportedModpack, today: string): ModpackPlan {
  const results = Object.keys(incoming.kubejs).sort().map((ns) => mergeNamespace(ns, ownEntry(existing?.kubejsEn, ns), ownEntry(incoming.kubejs, ns) ?? {}));
  const quest = planQuestWrite({
    mcVersion: incoming.mcVersion,
    existingMeta: existing?.meta.ftbquests,
    existingEn: existing?.questsEn,
    incoming: incoming.ftbquests,
  });
  const refused = [
    ...results.flatMap(({ change }) => change.conflicts.filter((c) => c.formatChanged).map((c): NamespacedConflict => ({ ...c, ns: change.ns }))),
    ...(quest.kind === 'refused' ? quest.conflicts.map((c): NamespacedConflict => ({ ...c, ns: QUEST_CONFLICT_LABEL })) : []),
  ];
  if (refused.length > 0 || quest.kind === 'refused') return { kind: 'refused', conflicts: refused };
  const written = results.filter(({ change }) => change.created || change.addedKeys.length > 0);
  const meta = existing ? updatedMeta(existing.meta, incoming, today) : draftMeta(id, incoming, today);
  return {
    kind: 'write',
    meta: withQuestMeta(meta, quest.meta),
    kubejsEn: Object.fromEntries(written.map(({ change, en }) => [change.ns, en])),
    changes: results.map((r) => r.change),
    ...(quest.en ? { questsEn: quest.en } : {}),
    ...(quest.change ? { questChange: quest.change } : {}),
  };
}
```

(e) `packages/core/src/modpackImport/index.ts` 在 `export * from './plan';` 之後加入：

```ts
export * from './questPlan';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/modpackImport && npm run typecheck -w @mlf/core`
Expected: PASS（新測試與既有 plan／run 測試全過），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/modpackImport
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): plan FTB Quests English updates like KubeJS"
```

---

### Task 11: `add:modpack` 寫入任務英文（integration）

**Files:**
- Modify: `packages/core/src/modpackImport/run.ts`
- Test: `packages/core/src/modpackImport/run.test.ts`（新增 describe，沿用檔案內的 `memoryIO`、`TODAY`；既有測試不改）
- Modify: `scripts/lib/modpackFiles.ts`
- Modify: `scripts/add-modpack.ts`

**Interfaces:**
- Consumes: `planModpackWrite`、`ExistingModpack.questsEn`、`QuestChange`（Task 10）、`unsupportedQuestNote`（Task 9）、fixtures（Task 9）、`QUESTS_DIR`、`QUEST_EN_FILE`（`@mlf/core/ftbquests`）、`langRecordSchema`、`writeFilesTogether`、`toJson`
- Produces:
  - `ModpackFiles.questsEn?: Readonly<Record<string, string>>`（只在需要寫入時存在；不含 `zh_tw.json`）
  - `AddModpackResult` 的 `written` 新增 `questChange?: QuestChange`
  - 腳本：`readExisting` 讀 `ftbquests/en_us.json` 為 `questsEn`；`writeModpack` 寫 `ftbquests/en_us.json`；`add-modpack.ts` 印出任務新增／更新與原文不同的條目

- [ ] **Step 1: Write the failing test** — `packages/core/src/modpackImport/run.test.ts`

import 區改為：

```ts
import { describe, expect, it, vi } from 'vitest';
import { catalogModpackSchema } from '../modpack';
import { fakeFetch } from '../test/fakeFetch';
import {
  CF_API, CF_FAKE_KEY, curseforgeRoutes, curseZipBytes, MR_API, MR_INDEX_121, modrinthRoutes, mrpackBytes, QUEST_CHAPTER_SNBT, QUEST_EN, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
import {
  type AddModpackIO, type ExistingModpack, type FetchLike, MISSING_KEY_MESSAGE, type ModpackFiles, noDownloadMessage, runAddModpack, unsupportedQuestNote,
} from './index';
```

檔案最後加入：

```ts
const ROOT = 'overrides/config/ftbquests/quests';
const TITLE = 'quest.44A5523F7A909209.title';
const args = { platform: 'modrinth', ref: 'example-pack' } as const;

async function questFetch(files: Readonly<Record<string, string>>, index: unknown = MR_INDEX_121): Promise<FetchLike> {
  return fakeFetch(await modrinthRoutes(await mrpackBytes(files, index)));
}

function questExisting(questsEn: Readonly<Record<string, string>>): ExistingModpack {
  const meta = catalogModpackSchema.parse({
    id: 'example-pack', name: 'Example Pack', summary: '手寫簡介', authors: ['someone'],
    links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
    source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.3.0', mcVersion: '1.21.1', loader: 'neoforge' },
    mods: [], translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } },
    ftbquests: { status: 'supported', layout: 'single' }, updatedAt: '2026-10-01',
  });
  return { meta, kubejsEn: {}, questsEn };
}

describe('runAddModpack: FTB quests', () => {
  it('writes lang/en_us.snbt text with the single layout', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT }));
    expect(await runAddModpack(io, args, TODAY)).toMatchObject({ kind: 'written', questChange: { created: true, addedKeys: Object.keys(QUEST_EN) } });
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'single' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('writes a lang folder with the split layout', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us/chapters/getting_started.snbt`]: QUEST_LANG_SNBT }));
    await runAddModpack(io, args, TODAY);
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'split' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('extracts chapter files when the pack has no lang file', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/chapters/getting_started.snbt`]: QUEST_CHAPTER_SNBT }));
    await runAddModpack(io, args, TODAY);
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'supported', layout: 'single' });
    expect(writes[0]?.files.questsEn).toEqual(QUEST_EN);
  });

  it('skips quest text on Minecraft 1.20.1 and marks the version unsupported', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes(await mrpackBytes({ [`${ROOT}/chapters/a.snbt`]: '{ broken' }))));
    const result = await runAddModpack(io, args, TODAY);
    expect(result.kind === 'written' ? result.notes : []).toContain(unsupportedQuestNote('1.20.1'));
    expect(writes[0]?.files.meta.ftbquests).toEqual({ status: 'unsupported-version' });
    expect(Object.keys(writes[0]?.files ?? {})).toEqual(['meta', 'kubejsEn']);
  });

  it('does not write anything when a quest file cannot be parsed', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: '{\n\tquest.44A5523F7A909209.title: "x\n}' }));
    expect(await runAddModpack(io, args, TODAY)).toEqual({
      kind: 'error', message: `${ROOT}/lang/en_us.snbt 解析失敗：第 2 行：字串缺少結尾的引號（字串不可跨行）`,
    });
    expect(writes).toEqual([]);
  });

  it('refuses the update when a quest format code changed', async () => {
    const { io, writes } = memoryIO(await questFetch({ [`${ROOT}/lang/en_us.snbt`]: QUEST_LANG_SNBT }), { existing: questExisting({ [TITLE]: '&aWelcome' }) });
    expect(await runAddModpack(io, args, TODAY)).toEqual({
      kind: 'conflict', id: 'example-pack',
      conflicts: [{ ns: 'FTB 任務', key: TITLE, existing: '&aWelcome', incoming: 'Welcome', formatChanged: true }],
    });
    expect(writes).toEqual([]);
  });

  it('stops when a version below 1.21 would drop existing quest data', async () => {
    const { io, writes } = memoryIO(fakeFetch(await modrinthRoutes()), { existing: questExisting(QUEST_EN) });
    const result = await runAddModpack(io, args, TODAY);
    expect(result.kind === 'error' ? result.message : '').toMatch(/^這次匯入的是 Minecraft 1\.20\.1（低於 1\.21），但已有 FTB 任務資料/);
    expect(writes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/modpackImport/run.test.ts`
Expected: FAIL — `writes[0]?.files.questsEn` 為 `undefined`、結果沒有 `questChange`（`runAddModpack` 尚未寫入任務英文）；既有測試仍 PASS。記錄 RED。

- [ ] **Step 3: Write quest English in `runAddModpack`** — `packages/core/src/modpackImport/run.ts`

(a) import 區加入 `import type { QuestChange } from './questPlan';`

(b) `ModpackFiles` 改為：

```ts
/** 寫入 data/modpacks/<id>/ 的內容；不含 zh_tw.json */
export interface ModpackFiles {
  readonly meta: CatalogModpack;
  /** 只含需要寫入的命名空間 */
  readonly kubejsEn: KubejsEnglish;
  /** ftbquests/en_us.json；只在需要寫入時存在 */
  readonly questsEn?: Readonly<Record<string, string>>;
}
```

(c) `AddModpackResult` 的 `written` 改為：

```ts
  | {
    readonly kind: 'written'; readonly id: string; readonly created: boolean; readonly changes: readonly NamespaceChange[];
    readonly notes: readonly string[]; readonly imported: ImportedSummary; readonly questChange?: QuestChange;
  }
```

(d) `runAddModpack` 中

```ts
    await io.write(id, { meta: plan.meta, kubejsEn: plan.kubejsEn });
    return { kind: 'written', id, created: existing === null, changes: plan.changes, notes: [...sourceChangeNote(existing, incoming), ...incoming.notes],
      imported: { version: incoming.version, mcVersion: incoming.mcVersion, loader: incoming.loader } };
```

改為

```ts
    await io.write(id, { meta: plan.meta, kubejsEn: plan.kubejsEn, ...(plan.questsEn ? { questsEn: plan.questsEn } : {}) });
    return {
      kind: 'written', id, created: existing === null, changes: plan.changes, notes: [...sourceChangeNote(existing, incoming), ...incoming.notes],
      imported: { version: incoming.version, mcVersion: incoming.mcVersion, loader: incoming.loader },
      ...(plan.questChange ? { questChange: plan.questChange } : {}),
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/modpackImport && npm run typecheck -w @mlf/core`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 5: Read and write `ftbquests/en_us.json` in the script** — 以下列內容取代 `scripts/lib/modpackFiles.ts`

```ts
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { QUEST_EN_FILE, QUESTS_DIR } from '@mlf/core/ftbquests';
import { catalogModpackSchema, KUBEJS_DIR, KUBEJS_EN_FILE, langRecordSchema, MODPACK_FILE } from '@mlf/core/modpack';
import type { ExistingModpack, ModpackFiles } from '@mlf/core/modpackImport';
import { isMissing, MODPACKS_DIR, parseJsonText, writeFilesTogether } from '@mlf/core/node';
import { toJson } from './modrinth';

export const MODPACKS_DATA_DIR = resolve(import.meta.dirname, '..', '..', 'data', MODPACKS_DIR);

/** 讀取 JSON（容許 BOM，與 validate:data 一致）；檔案不存在時回傳 null，其餘錯誤丟出 */
async function readJsonOrNull(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  const parsed = parseJsonText(text);
  if (!parsed.ok) throw new Error(`${path} JSON 解析失敗：${parsed.reason}`);
  return parsed.value;
}

async function readKubejsEnglish(dir: string): Promise<ExistingModpack['kubejsEn']> {
  const root = join(dir, KUBEJS_DIR);
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isMissing(err)) return {};
    throw err;
  }
  const entries = await Promise.all(names.map(async (ns) => [ns, await readJsonOrNull(join(root, ns, KUBEJS_EN_FILE))] as const));
  return Object.fromEntries(entries.filter(([, en]) => en !== null).map(([ns, en]) => [ns, langRecordSchema.parse(en)]));
}

/** 讀取既有的 data/modpacks/<id>；不存在時回傳 null */
export async function readExisting(id: string): Promise<ExistingModpack | null> {
  const dir = join(MODPACKS_DATA_DIR, id);
  const raw = await readJsonOrNull(join(dir, MODPACK_FILE));
  if (raw === null) return null;
  const questsRaw = await readJsonOrNull(join(dir, QUESTS_DIR, QUEST_EN_FILE));
  return {
    meta: catalogModpackSchema.parse(raw),
    kubejsEn: await readKubejsEnglish(dir),
    ...(questsRaw === null ? {} : { questsEn: langRecordSchema.parse(questsRaw) }),
  };
}

/** 寫入 modpack.json、有變動的 kubejs/<ns>/en_us.json 與 ftbquests/en_us.json；不動 zh_tw.json。id 與命名空間已在 core 驗證 */
export async function writeModpack(id: string, { meta, kubejsEn, questsEn }: ModpackFiles): Promise<void> {
  const dir = join(MODPACKS_DATA_DIR, id);
  const namespaces = Object.keys(kubejsEn);
  const dirs = [dir, ...namespaces.map((ns) => join(dir, KUBEJS_DIR, ns)), ...(questsEn ? [join(dir, QUESTS_DIR)] : [])];
  await Promise.all(dirs.map((d) => mkdir(d, { recursive: true })));
  await writeFilesTogether([
    { path: join(dir, MODPACK_FILE), content: toJson(meta) },
    ...namespaces.map((ns) => ({ path: join(dir, KUBEJS_DIR, ns, KUBEJS_EN_FILE), content: toJson(kubejsEn[ns]) })),
    ...(questsEn ? [{ path: join(dir, QUESTS_DIR, QUEST_EN_FILE), content: toJson(questsEn) }] : []),
  ]);
}
```

- [ ] **Step 6: Print quest changes** — `scripts/add-modpack.ts`

(a) 檔案開頭註解第一行改為：

```ts
 * 新增或更新整合包：下載 .mrpack／CurseForge zip，寫入 data/modpacks/<id>/modpack.json、KubeJS 英文原文與 FTB 任務英文（ftbquests/en_us.json；不動 zh_tw.json）。
```

(b) `report` 的 `case 'written':` 中，在 KubeJS 的 `for (const change of result.changes) { … }` 迴圈之後、`console.log(\`${result.created ? '已新增' : '已更新'} …\`)` 之前加入：

```ts
      if (result.questChange) {
        for (const c of result.questChange.conflicts) console.log(`原文不同  FTB 任務:${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
        console.log(`FTB 任務：${result.questChange.created ? '新增' : '更新'}，新增 ${result.questChange.addedKeys.length} 條`);
      }
```

- [ ] **Step 7: Verify the scripts**

Run: `npm run lint && npm run validate:data`
Expected: lint 無錯誤；`validate:data` 0 個錯誤

Run: `npm run add:modpack`
Expected: 不帶參數，不發出任何網路請求，印出「用法：npm run add:modpack -- --modrinth <slug|id> …」並以非 0 結束（只確認腳本能載入；本計畫不對網路執行真實的 `add:modpack`）

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/modpackImport/run.ts packages/core/src/modpackImport/run.test.ts scripts/lib/modpackFiles.ts scripts/add-modpack.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(scripts): write FTB Quests English with add:modpack"
```

---

### Task 12: 網站資料、摘要與 API 的任務進度（integration）

**Files:**
- Modify: `apps/site/src/lib/modpackSummary.ts`
- Modify: `apps/site/src/lib/modpacks.ts`
- Test: `apps/site/src/lib/modpacks.test.ts`（另在 `apps/site/src/components/ModpackCard.test.tsx` 的測試資料補上 `ftbquests: null`）

**Interfaces:**
- Consumes: `LoadedModpack.quests`（Task 6）、`questStats`、`QuestApiBody`（`@mlf/core/ftbquests`）、`modpackRef`
- Produces:
  - `type QuestSummary = { status: 'supported'; total: number; translated: number; percent: number } | { status: 'unsupported-version' }`；`ModpackSummary.ftbquests: QuestSummary | null`（`modpackSummary.ts`，client 可用）
  - `SiteModpack.questStats: ProjectStats | null`
  - `ModpackApiBody.ftbquests?: QuestApiBody`；`toModpackApiBody(p: Pick<SiteModpack, 'meta' | 'resolved' | 'kubejs' | 'quests'>)`（`supported` 輸出 `{ status, layout, en_us, zh_tw }`、`unsupported-version` 只輸出 `{ status }`、沒有時省略）

- [ ] **Step 1: Write the failing test** — `apps/site/src/lib/modpacks.test.ts`

(a) 既有 `summarises a modpack for the catalog and the index API` 的期望值在 `kubejs: { total: 2, translated: 1, percent: 50 },` 之後加入 `ftbquests: null,`；`apps/site/src/components/ModpackCard.test.tsx` 的 `pack()` 回傳物件在 `kubejs,` 之後加入 `ftbquests: null,`（讓 `ModpackSummary` 新欄位通過 typecheck；Task 13 會再改寫此檔）。

(b) 檔案最後加入：

```ts
describe('FTB quests', () => {
  const TITLE = 'quest.44A5523F7A909209.title';
  const DESC = 'quest.44A5523F7A909209.quest_desc';
  const QUEST_EN = { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' };
  const questMeta = catalogModpackSchema.parse({
    ...meta, source: { ...meta.source, mcVersion: '1.21.1', loader: 'neoforge' }, ftbquests: { status: 'supported', layout: 'split' },
  });
  const questPack: LoadedModpack = { meta: questMeta, kubejs: {}, quests: { layout: 'split', en: QUEST_EN, zh: { [TITLE]: '歡迎' } } };

  it('computes quest progress and puts it in the summary', () => {
    const site = toSiteModpack(questPack, catalog);
    expect(site.questStats).toEqual({ total: 2, translated: 1, warnings: 0, percent: 50 });
    expect(toModpackSummary(site).ftbquests).toEqual({ status: 'supported', total: 2, translated: 1, percent: 50 });
  });

  it('exposes quest texts and the layout in the API payload', () => {
    expect(toModpackApiBody(toSiteModpack(questPack, catalog)).ftbquests).toEqual({
      status: 'supported', layout: 'split', en_us: QUEST_EN, zh_tw: { [TITLE]: '歡迎' },
    });
  });

  it('marks unsupported versions without progress or texts', () => {
    const old = catalogModpackSchema.parse({ ...meta, ftbquests: { status: 'unsupported-version' } });
    const site = toSiteModpack({ meta: old, kubejs: {} }, catalog);
    expect(site.questStats).toBeNull();
    expect(toModpackSummary(site).ftbquests).toEqual({ status: 'unsupported-version' });
    expect(toModpackApiBody(site).ftbquests).toEqual({ status: 'unsupported-version' });
  });

  it('leaves quests out when the modpack has none', () => {
    const site = toSiteModpack(pack, catalog);
    expect(site.questStats).toBeNull();
    expect(toModpackSummary(site).ftbquests).toBeNull();
    expect(toModpackApiBody(site)).not.toHaveProperty('ftbquests');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- src/lib/modpacks.test.ts`
Expected: FAIL — 摘要沒有 `ftbquests`、`site.questStats` 為 `undefined`。記錄 RED。

- [ ] **Step 3: Add `QuestSummary`** — `apps/site/src/lib/modpackSummary.ts`

在 `ModpackSummary` 之前加入：

```ts
/** FTB 任務摘要：supported 有進度；unsupported-version（MC 1.21 以下）只標示版本不支援 */
export type QuestSummary =
  | { readonly status: 'supported'; readonly total: number; readonly translated: number; readonly percent: number }
  | { readonly status: 'unsupported-version' };
```

在 `ModpackSummary` 的 `kubejs` 欄位之後加入：

```ts
  /** FTB 任務；整合包沒有任務檔時為 null */
  readonly ftbquests: QuestSummary | null;
```

- [ ] **Step 4: Replace `apps/site/src/lib/modpacks.ts`**

```ts
import { type QuestApiBody, questStats } from '@mlf/core/ftbquests';
import type { ProjectStats } from '@mlf/core/merge';
import {
  type CatalogModpack, includedModIds, kubejsProjects, kubejsStats, type ModpackMod, modpackRef, resolveModpackMods, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import type { LoadedModpack } from '@mlf/core/node';
import type { SiteMod } from './data';
import type { IncludedMod, ModpackSummary, QuestSummary } from './modpackSummary';

export interface SiteModpack extends LoadedModpack {
  /** 整合包的每個模組＋對照到的 modId */
  readonly resolved: readonly ResolvedModpackMod[];
  readonly included: readonly IncludedMod[];
  readonly missing: readonly ModpackMod[];
  /** KubeJS 進度（各命名空間合計）；沒有 KubeJS 文字時為 null */
  readonly kubejsStats: ProjectStats | null;
  /** FTB 任務進度；沒有 supported 任務文字時為 null */
  readonly questStats: ProjectStats | null;
}

/** 建置時以 slug 對照已收錄模組並計算 KubeJS 與 FTB 任務進度 */
export function toSiteModpack(pack: LoadedModpack, catalog: readonly Pick<SiteMod, 'meta' | 'stats'>[]): SiteModpack {
  const resolved = resolveModpackMods(pack.meta.mods, catalog.map((m) => ({ modId: m.meta.modId, links: m.meta.links })));
  const byId = new Map(catalog.map((m) => [m.meta.modId, m]));
  const included = includedModIds(resolved).flatMap((modId): IncludedMod[] => {
    const mod = byId.get(modId);
    return mod ? [{ modId, name: mod.meta.name, nameZh: mod.meta.nameZh ?? null, percent: mod.stats.percent }] : [];
  });
  const missing = resolved.filter((m) => m.modId === null).map(({ modId: _modId, ...rest }): ModpackMod => rest);
  const ref = modpackRef(pack.meta);
  const stats = kubejsStats(kubejsProjects(ref, pack.kubejs, 0));
  const quests = pack.quests ? questStats(ref, pack.quests) : null;
  return { ...pack, resolved, included, missing, kubejsStats: stats, questStats: quests };
}

function questSummary(p: Pick<SiteModpack, 'meta' | 'questStats'>): QuestSummary | null {
  const status = p.meta.ftbquests?.status;
  if (status === 'unsupported-version') return { status };
  if (status === 'supported' && p.questStats) {
    const { total, translated, percent } = p.questStats;
    return { status, total, translated, percent };
  }
  return null;
}

export function toModpackSummary(p: SiteModpack): ModpackSummary {
  const { meta, kubejsStats: stats } = p;
  return {
    id: meta.id,
    name: meta.name,
    nameZh: meta.nameZh ?? null,
    summary: meta.summary,
    mcVersion: meta.source.mcVersion,
    loader: meta.source.loader,
    status: meta.translation.status,
    includedMods: p.resolved.filter((m) => m.modId !== null).length,
    totalMods: meta.mods.length,
    kubejs: stats ? { total: stats.total, translated: stats.translated, percent: stats.percent } : null,
    ftbquests: questSummary(p),
    updatedAt: meta.updatedAt,
  };
}

export function byModpackName(a: ModpackSummary, b: ModpackSummary): number {
  return a.name.localeCompare(b.name);
}

/** /api/v1/modpacks/<id>.json 的內容 */
export interface ModpackApiBody {
  readonly version: 1;
  readonly meta: CatalogModpack;
  readonly mods: readonly ResolvedModpackMod[];
  readonly kubejs: Readonly<Record<string, { readonly en_us: Readonly<Record<string, string>>; readonly zh_tw: Readonly<Record<string, string>> }>>;
  /** FTB 任務；整合包沒有任務檔時省略 */
  readonly ftbquests?: QuestApiBody;
}

function questApi(p: Pick<SiteModpack, 'meta' | 'quests'>): { readonly ftbquests?: QuestApiBody } {
  const meta = p.meta.ftbquests;
  if (meta?.status === 'unsupported-version') return { ftbquests: { status: meta.status } };
  if (meta?.status === 'supported' && p.quests) {
    return { ftbquests: { status: meta.status, layout: p.quests.layout, en_us: p.quests.en, zh_tw: p.quests.zh } };
  }
  return {};
}

export function toModpackApiBody(p: Pick<SiteModpack, 'meta' | 'resolved' | 'kubejs' | 'quests'>): ModpackApiBody {
  return {
    version: 1,
    meta: p.meta,
    mods: p.resolved,
    kubejs: Object.fromEntries(Object.entries(p.kubejs).map(([ns, texts]) => [ns, { en_us: texts.en, zh_tw: texts.zh }])),
    ...questApi(p),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/lib/modpackSummary.ts apps/site/src/lib/modpacks.ts apps/site/src/lib/modpacks.test.ts apps/site/src/components/ModpackCard.test.tsx
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(site): add FTB Quests progress to modpack data and API"
```

---

### Task 13: 目錄卡片與整合包頁的任務進度（integration）

**Files:**
- Modify: `apps/site/src/i18n/zh-TW.ts`
- Modify: `apps/site/src/components/ModpackCard.tsx`
- Modify: `apps/site/src/pages/modpacks/[modpackId].astro`
- Test: `apps/site/src/components/ModpackCard.test.tsx`

**Interfaces:**
- Consumes: `ModpackSummary.ftbquests`、`QuestSummary`、`SiteModpack.questStats`（Task 12）、`ProgressBar`
- Produces:
  - `t.modpacks.quests(percent)` = `FTB 任務 ${percent}%`、`t.modpacks.questsUnsupported` = `此版本的任務暫不支援翻譯`
  - `t.modpackPage.questProgress(done, total)` = `FTB 任務已翻譯 ${done} / ${total} 條`、`t.modpackPage.questWarnings(n)`、`t.modpackPage.questsUnsupported`
  - 卡片：`supported` 顯示 `FTB 任務 N%`、`unsupported-version` 顯示「此版本的任務暫不支援翻譯」、沒有則不顯示
  - 整合包頁：KubeJS 進度旁新增 FTB 任務進度條；`unsupported-version` 顯示提示；可下載條件加入「有已翻譯的任務文字」；「協助翻譯」在有 KubeJS 或任務文字時顯示

- [ ] **Step 1: Write the failing test** — 以下列內容取代 `apps/site/src/components/ModpackCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModpackSummary } from '../lib/modpackSummary';
import { ModpackCard } from './ModpackCard';

const pack = (kubejs: ModpackSummary['kubejs'], ftbquests: ModpackSummary['ftbquests'] = null): ModpackSummary => ({
  id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: '簡介', mcVersion: '1.20.1', loader: 'forge',
  status: 'machine', includedMods: 2, totalMods: 3, kubejs, ftbquests, updatedAt: '2026-10-17',
});

describe('ModpackCard', () => {
  it('shows names, Minecraft version, loader, included mods and KubeJS progress', () => {
    render(<ModpackCard pack={pack({ total: 3, translated: 2, percent: 67 })} />);
    expect(screen.getByRole('link', { name: 'Example Pack（範例整合包）' })).toHaveAttribute('href', '/modpacks/example-pack/');
    expect(screen.getByText('Minecraft 1.20.1')).toBeInTheDocument();
    expect(screen.getByText('Forge')).toBeInTheDocument();
    expect(screen.getByText('已收錄模組 2／3')).toBeInTheDocument();
    expect(screen.getByText('整合包文字 67%')).toBeInTheDocument();
    expect(screen.queryByText(/FTB 任務|任務暫不支援/)).toBeNull();
  });

  it('says when the modpack has no text of its own', () => {
    render(<ModpackCard pack={pack(null)} />);
    expect(screen.getByText('沒有整合包自己的文字')).toBeInTheDocument();
  });

  it('shows FTB quest progress', () => {
    render(<ModpackCard pack={pack(null, { status: 'supported', total: 6, translated: 3, percent: 50 })} />);
    expect(screen.getByText('FTB 任務 50%')).toBeInTheDocument();
  });

  it('says when quests of this version cannot be translated yet', () => {
    render(<ModpackCard pack={pack(null, { status: 'unsupported-version' })} />);
    expect(screen.getByText('此版本的任務暫不支援翻譯')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- src/components/ModpackCard.test.tsx`
Expected: FAIL — 找不到「FTB 任務 50%」與「此版本的任務暫不支援翻譯」。記錄 RED。

- [ ] **Step 3: Add site copy** — `apps/site/src/i18n/zh-TW.ts`

`modpacks` 的 `noKubejs: '沒有整合包自己的文字',` 之後加入：

```ts
    quests: (percent: number) => `FTB 任務 ${percent}%`,
    questsUnsupported: '此版本的任務暫不支援翻譯',
```

`modpackPage` 的 `kubejsWarnings: …,` 之後加入：

```ts
    questProgress: (done: number, total: number) => `FTB 任務已翻譯 ${done} / ${total} 條`,
    questWarnings: (n: number) => `有 ${n} 條任務文字的特殊符號（例如 &a、{@pagebreak}）可能少打或多打`,
    questsUnsupported: '此版本的任務暫不支援翻譯',
```

並把 `modpackPage.translate` 改為：

```ts
    translate: '到「自己翻譯」頁載入這個整合包，幫忙翻整合包自己的文字和 FTB 任務',
```

- [ ] **Step 4: Show quests on the card** — 以下列內容取代 `apps/site/src/components/ModpackCard.tsx`

```tsx
import { t } from '../i18n/zh-TW';
import { modpackUrl } from '../lib/config';
import { CHIP_CLASS, LOADER_LABELS } from '../lib/format';
import { modpackDisplayName, type ModpackSummary, type QuestSummary } from '../lib/modpackSummary';
import { StatusBadge } from './StatusBadge';

function questLine(quests: QuestSummary): string {
  return quests.status === 'supported' ? t.modpacks.quests(quests.percent) : t.modpacks.questsUnsupported;
}

/** 整合包目錄的一張卡片 */
export function ModpackCard({ pack }: { readonly pack: ModpackSummary }) {
  return (
    <article className="card flex h-full flex-col gap-3">
      <h2 className="text-lg font-semibold">
        <a className="link" href={modpackUrl(pack.id)}>{modpackDisplayName(pack)}</a>
      </h2>
      <p className="text-sm text-muted">{pack.summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={CHIP_CLASS}>Minecraft {pack.mcVersion}</span>
        <span className={CHIP_CLASS}>{LOADER_LABELS[pack.loader]}</span>
        <StatusBadge status={pack.status} />
      </div>
      <p className="text-sm font-medium">{t.modpacks.includedMods(pack.includedMods, pack.totalMods)}</p>
      <p className="text-sm text-muted">{pack.kubejs ? t.modpacks.kubejs(pack.kubejs.percent) : t.modpacks.noKubejs}</p>
      {pack.ftbquests && <p className="text-sm text-muted">{questLine(pack.ftbquests)}</p>}
    </article>
  );
}
```

- [ ] **Step 5: Show quests on the modpack page** — `apps/site/src/pages/modpacks/[modpackId].astro`

(a) frontmatter 中

```ts
const { meta, included, missing, kubejsStats } = pack;
```

改為

```ts
const { meta, included, missing, kubejsStats, questStats } = pack;
const questsUnsupported = meta.ftbquests?.status === 'unsupported-version';
const hasOwnText = kubejsStats !== null || questStats !== null;
```

並把

```ts
const canDownload = included.length > 0 || kubejsStats !== null;
```

改為

```ts
const canDownload = included.length > 0 || kubejsStats !== null || (questStats?.translated ?? 0) > 0;
```

(b) `{kubejsStats && meta.translation.status === 'machine' && (` 改為 `{hasOwnText && meta.translation.status === 'machine' && (`。

(c) 下載區塊中 KubeJS 進度的 `{kubejsStats && ( <div> … </div> )}` 之後、`{canDownload ? (` 之前加入：

```astro
        {questStats && (
          <div>
            <p class="mb-2 text-sm font-medium">{t.modpackPage.questProgress(questStats.translated, questStats.total)}</p>
            <ProgressBar percent={questStats.percent} label={t.modpackPage.questProgress(questStats.translated, questStats.total)} />
            {questStats.warnings > 0 && <p class="mt-2 text-xs text-warn">{t.modpackPage.questWarnings(questStats.warnings)}</p>}
          </div>
        )}
        {questsUnsupported && <p class="text-sm text-muted">{t.modpackPage.questsUnsupported}</p>}
```

(d) aside 中 `{kubejsStats && ( <section aria-labelledby="translate-title">` 改為 `{hasOwnText && ( <section aria-labelledby="translate-title">`。

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site && npm run lint`
Expected: PASS，typecheck 與 lint 無錯誤

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/i18n/zh-TW.ts apps/site/src/components/ModpackCard.tsx apps/site/src/components/ModpackCard.test.tsx "apps/site/src/pages/modpacks/[modpackId].astro"
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(site): show FTB Quests progress on modpack cards and pages"
```

---

### Task 14: 一鍵下載改為兩部分 zip（integration）

**Files:**
- Modify: `apps/site/src/islands/downloadModpack.ts`
- Modify: `apps/site/src/i18n/zh-TW.ts`
- Modify: `apps/site/src/pages/modpacks/[modpackId].astro`（安裝說明改用整合包專用步驟）
- Test: `apps/site/src/islands/modpackDownload.test.tsx`（整份取代：既有案例改讀 `resourcepacks/` 內的資源包，並新增任務案例）

**Interfaces:**
- Consumes: `buildBundle`、`BundleResourcePack`、`QuestPart`、`exportProjects`（Task 8）、`questApiSchema`、`questProject`、`questTranslations`（`@mlf/core/ftbquests`）、`QuestData`、`zipFileNames`（`@mlf/core/test/zipFiles`）、`parseSnbt`、`readQuestLang`
- Produces:
  - `ModpackPayload.ftbquests?: QuestData`（payload 經 `questApiSchema` 驗證：key 須符合規則、layout 只能是 `single`／`split`；`unsupported-version` 不產生 `ftbquests`）
  - `modpackResourcePackName(id: string): string` = `<id>-zh_tw.zip`
  - `buildModpackPack(pack, mods): Promise<ExportResult>`：檔名 `<id>-zh_tw-<mcVersion>.zip`；內容 `安裝說明.txt`、`resourcepacks/<id>-zh_tw.zip`（沒有模組與 KubeJS 內容時省略）、有已翻任務條目時加 `config/ftbquests/quests/lang/zh_tw.snbt` 或 `…/lang/zh_tw/modlangforge.snbt`
  - `t.modpackPage.downloadTitle` = `下載整合包繁中翻譯`、`t.modpackPage.download` = `下載整合包翻譯`、`t.modpackPage.downloadNote(mcVersion)`、`t.modpackPage.installSteps`

- [ ] **Step 1: Write the failing test** — 以下列內容取代 `apps/site/src/islands/modpackDownload.test.tsx`

```tsx
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseSnbt, readQuestLang } from '@mlf/core/ftbquests';
import { zipFileNames } from '@mlf/core/test/zipFiles';
import { buildModpackPack, fetchIncludedMods, fetchModpackData, modpackPackFileName } from './downloadModpack';
import ModpackDownload from './ModpackDownload';

const modMeta = (modId: string) => ({
  modId, name: modId.toUpperCase(), aliases: [], summary: 's', authors: ['a'], links: { modrinth: `https://modrinth.com/mod/${modId}` },
  mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] }, updatedAt: '2026-10-15',
});
const modBody = (modId: string, extra: Record<string, unknown> = {}) => ({
  version: 1, meta: modMeta(modId), en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' }, ...extra,
});

const packMeta = (mcVersion = '1.20.1', extra: Record<string, unknown> = {}) => ({
  id: 'example-pack', name: 'Example Pack', summary: 's', authors: ['a'], links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion, loader: 'forge' },
  mods: [
    { platform: 'modrinth', projectId: '1', slug: 'create' },
    { platform: 'modrinth', projectId: '2', slug: 'gone' },
    { platform: 'modrinth', projectId: '3', slug: 'missing' },
  ],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null }, contributors: [] },
  updatedAt: '2026-10-17',
  ...extra,
});
const packBody = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  meta: packMeta(),
  mods: [
    { platform: 'modrinth', projectId: '1', slug: 'create', modId: 'create' },
    { platform: 'modrinth', projectId: '2', slug: 'gone', modId: 'gone' },
    { platform: 'modrinth', projectId: '3', slug: 'missing', modId: null },
  ],
  kubejs: { kubejs: { en_us: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing' }, zh_tw: { 'item.kubejs.gear': '齒輪' } } },
  ...overrides,
});

const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';
const QUEST_EN = { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' };
const QUEST_ZH = { [DESC]: '第一行\n第二行\n第三行' };

const questBody = (layout: 'single' | 'split' = 'single', zh: Record<string, string> = QUEST_ZH, overrides: Record<string, unknown> = {}) => packBody({
  meta: packMeta('1.21.1', { ftbquests: { status: 'supported', layout } }),
  ftbquests: { status: 'supported', layout, en_us: QUEST_EN, zh_tw: zh },
  ...overrides,
});

const PACK_URL = '/api/v1/modpacks/example-pack.json';
const RESOURCE_PACK = 'resourcepacks/example-pack-zh_tw.zip';
const GUIDE = '安裝說明.txt';
const QUEST_SINGLE = 'config/ftbquests/quests/lang/zh_tw.snbt';
const QUEST_SPLIT = 'config/ftbquests/quests/lang/zh_tw/modlangforge.snbt';

function fakeFetch(bodies: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const found = Object.hasOwn(bodies, url) ? bodies[url] : undefined;
    return { ok: found !== undefined, status: found === undefined ? 404 : 200, json: async () => found };
  });
}

const routes = (pack: unknown = packBody(), create: unknown = modBody('create')) => ({ [PACK_URL]: pack, '/api/v1/mods/create.json': create });

async function readZip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function readJson(zip: JSZip, path: string): Promise<unknown> {
  return JSON.parse((await zip.file(path)?.async('string')) ?? 'null');
}

async function innerPack(zip: JSZip): Promise<JSZip> {
  return JSZip.loadAsync((await zip.file(RESOURCE_PACK)?.async('uint8array')) ?? new Uint8Array());
}

async function questTexts(zip: JSZip, path: string): Promise<Readonly<Record<string, string>>> {
  return readQuestLang(parseSnbt((await zip.file(path)?.async('string')) ?? '')).texts;
}

async function download(body: unknown, create: unknown = modBody('create')): Promise<{ fileName: string; zip: JSZip }> {
  const f = fakeFetch(routes(body, create));
  const pack = await fetchModpackData('example-pack', f);
  const result = await buildModpackPack(pack, await fetchIncludedMods(pack, f));
  return { fileName: result.fileName, zip: await readZip(result.blob) };
}

describe('fetchModpackData', () => {
  it('validates the payload and keeps resolved mods', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes()));
    expect(pack.mods.map((m) => m.modId)).toEqual(['create', 'gone', null]);
    expect(pack.kubejs).toEqual({ kubejs: { en: { 'item.kubejs.gear': 'Gear', 'item.kubejs.casing': 'Casing' }, zh: { 'item.kubejs.gear': '齒輪' } } });
    expect(pack.ftbquests).toBeUndefined();
  });

  it('rejects namespaces that could escape assets/<ns>/lang/', async () => {
    for (const ns of ['../evil', '..', 'KubeJS', 'a b']) {
      const body = packBody({ kubejs: { [ns]: { en_us: { a: 'A' }, zh_tw: {} } } });
      await expect(fetchModpackData('example-pack', fakeFetch(routes(body)))).rejects.toThrow();
    }
  });

  it('keeps supported quest text and drops the unsupported marker', async () => {
    expect((await fetchModpackData('example-pack', fakeFetch(routes(questBody())))).ftbquests).toEqual({ layout: 'single', en: QUEST_EN, zh: QUEST_ZH });
    const old = packBody({ meta: packMeta('1.20.1', { ftbquests: { status: 'unsupported-version' } }), ftbquests: { status: 'unsupported-version' } });
    expect((await fetchModpackData('example-pack', fakeFetch(routes(old)))).ftbquests).toBeUndefined();
  });

  it('rejects quest payloads with unknown layouts or keys', async () => {
    for (const ftbquests of [
      { status: 'supported', layout: '../config', en_us: {}, zh_tw: {} },
      { status: 'supported', layout: 'single', en_us: { 'task.5555555555555555.title': 'x' }, zh_tw: {} },
      { status: 'supported', layout: 'single', en_us: {}, zh_tw: JSON.parse('{"__proto__":"x"}') as Record<string, string> },
    ]) {
      await expect(fetchModpackData('example-pack', fakeFetch(routes(packBody({ ftbquests }))))).rejects.toThrow();
    }
  });

  it('throws on HTTP errors', async () => {
    await expect(fetchModpackData('nope', fakeFetch({}))).rejects.toThrow('HTTP 404');
  });
});

describe('fetchIncludedMods', () => {
  it('fetches each included mod once and skips removed mods', async () => {
    const f = fakeFetch(routes());
    const pack = await fetchModpackData('example-pack', f);
    const mods = await fetchIncludedMods(pack, f);
    expect(mods.map((m) => m.meta.modId)).toEqual(['create']);
    expect(f.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/v1/mods/'))).toEqual(['/api/v1/mods/create.json', '/api/v1/mods/gone.json']);
  });
});

describe('buildModpackPack', () => {
  it('puts the resource pack under resourcepacks/ with an install guide and no config part without quest text', async () => {
    const { fileName, zip } = await download(packBody());
    expect(fileName).toBe('example-pack-zh_tw-1.20.1.zip');
    expect(zipFileNames(zip)).toEqual([RESOURCE_PACK, GUIDE]);
    const guide = (await zip.file(GUIDE)?.async('string')) ?? '';
    expect(guide.split('\n')[0]).toBe('ModLangForge 繁中翻譯 · Example Pack');
    expect(guide).toContain('「選項 → 資源包」');
    expect(guide).not.toContain('FTB 任務');
  });

  it('packs included mods with guides and KubeJS text using the modpack pack_format', async () => {
    const guide = { files: { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A' }) }, zh_tw: { 'guide/entries/a.json#name': '甲' } };
    const inner = await innerPack((await download(packBody(), modBody('create', { guide }))).zip);
    expect(await readJson(inner, 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 15 } });
    expect(await readJson(inner, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: 'Banana' });
    expect(await readJson(inner, 'assets/kubejs/lang/zh_tw.json')).toEqual({ 'item.kubejs.gear': '齒輪' });
    expect(await readJson(inner, 'assets/create/patchouli_books/guide/zh_tw/entries/a.json')).toEqual({ name: '甲' });
  });

  it('follows the modpack Minecraft version', async () => {
    const f = fakeFetch(routes(packBody({ meta: packMeta('1.21.1') })));
    const pack = await fetchModpackData('example-pack', f);
    const result = await buildModpackPack(pack, []);
    expect(result.fileName).toBe(modpackPackFileName('example-pack', '1.21.1'));
    expect(await readJson(await innerPack(await readZip(result.blob)), 'pack.mcmeta')).toMatchObject({ pack: { pack_format: 34 } });
  });

  it('merges KubeJS text into a mod namespace with the same name', async () => {
    const body = packBody({ kubejs: { create: { en_us: { b: 'Big Banana', k: 'Kube' }, zh_tw: { k: '方塊' } } } });
    const inner = await innerPack((await download(body, modBody('create', { zh_tw: { a: '蘋果', b: '香蕉' } }))).zip);
    expect(await readJson(inner, 'assets/create/lang/zh_tw.json')).toEqual({ a: '蘋果', b: '香蕉', k: '方塊' });
  });

  it('leaves out untranslated KubeJS lines so they never replace existing Chinese', async () => {
    const inner = await innerPack((await download(packBody(), modBody('create', { zh_tw: { a: '蘋果', b: '乙' } }))).zip);
    expect(await readJson(inner, 'assets/kubejs/lang/zh_tw.json')).toEqual({ 'item.kubejs.gear': '齒輪' });
    const body = packBody({ kubejs: { kubejs: { en_us: { x: 'X' }, zh_tw: {} } } });
    const only = await fetchModpackData('example-pack', fakeFetch(routes(body)));
    expect(await readJson(await innerPack(await readZip((await buildModpackPack(only, [])).blob)), 'assets/kubejs/lang/zh_tw.json')).toEqual({});
  });

  it('adds only translated quest lines, as string lists, at the single layout path', async () => {
    const { fileName, zip } = await download(questBody());
    expect(fileName).toBe('example-pack-zh_tw-1.21.1.zip');
    expect(zipFileNames(zip)).toEqual([QUEST_SINGLE, RESOURCE_PACK, GUIDE]);
    expect(await questTexts(zip, QUEST_SINGLE)).toEqual(QUEST_ZH);
    expect(await zip.file(QUEST_SINGLE)?.async('string')).toContain(`"${DESC}": [\n\t\t"第一行",\n\t\t"第二行",\n\t\t"第三行"\n\t]`);
    expect((await zip.file(GUIDE)?.async('string')) ?? '').toContain('伺服器的 config 資料夾');
  });

  it('uses the split folder for split layouts', async () => {
    expect(zipFileNames((await download(questBody('split'))).zip)).toEqual([QUEST_SPLIT, RESOURCE_PACK, GUIDE]);
  });

  it('leaves out the config part when no quest line is translated', async () => {
    expect(zipFileNames((await download(questBody('single', {}))).zip)).toEqual([RESOURCE_PACK, GUIDE]);
  });

  it('has no resource pack for a modpack that only has quest text', async () => {
    const { zip } = await download(questBody('single', { [TITLE]: '歡迎' }, { mods: [], kubejs: {} }));
    expect(zipFileNames(zip)).toEqual([QUEST_SINGLE, GUIDE]);
    expect(await questTexts(zip, QUEST_SINGLE)).toEqual({ [TITLE]: '歡迎' });
  });
});

describe('ModpackDownload', () => {
  it('downloads the modpack translation', async () => {
    const onSave = vi.fn();
    render(<ModpackDownload modpackId="example-pack" fetchImpl={fakeFetch(routes())} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: '下載整合包翻譯' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].fileName).toBe('example-pack-zh_tw-1.20.1.zip');
  });

  it('shows an error with retry when loading fails', async () => {
    render(<ModpackDownload modpackId="example-pack" fetchImpl={fakeFetch({})} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '下載整合包翻譯' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('下載失敗');
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });
});
```

（`__proto__` 案例刻意用 `JSON.parse` 建立：物件字面值的 `__proto__` 會改 prototype 而不是建立自有 key，無法模擬真正的 API 回應。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- src/islands/modpackDownload.test.tsx`
Expected: FAIL — zip 根目錄仍是 `pack.mcmeta`（沒有 `resourcepacks/`、`安裝說明.txt`）、`pack.ftbquests` 為 `undefined`、找不到「下載整合包翻譯」按鈕。記錄 RED。

- [ ] **Step 3: Replace `apps/site/src/islands/downloadModpack.ts`**

```ts
import { z } from 'zod';
import type { ModProject } from '@mlf/core';
import { buildBundle, type BundleResourcePack, exportProjects, type ExportResult, type QuestPart } from '@mlf/core/export';
import { questApiSchema, questProject, questTranslations } from '@mlf/core/ftbquests';
import {
  type CatalogModpack, catalogModpackSchema, includedModIds, isValidNamespace, type KubejsData, kubejsProjects, langRecordSchema, modpackRef,
  type QuestData, resolvedModpackModSchema, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import { modpackApiUrl } from '../lib/config';
import { fetchModData, type ModPayload, payloadToProject } from './downloadPack';

type FetchLike = NonNullable<Parameters<typeof fetchModData>[1]>;

export interface ModpackPayload {
  readonly meta: CatalogModpack;
  readonly mods: readonly ResolvedModpackMod[];
  readonly kubejs: KubejsData;
  /** FTB 任務文字；只在 supported 時存在 */
  readonly ftbquests?: QuestData;
}

/** 命名空間會成為資源包路徑 assets/<ns>/lang/，不合法者整份 payload 視為無效 */
const namespace = z.string().refine(isValidNamespace, { message: '命名空間不合法' });

/** 任務的 layout 決定 config/ 底下的輸出路徑，只接受 single／split；key 必須符合 FTB 任務 key 規則 */
const payloadSchema = z.object({
  version: z.literal(1),
  meta: catalogModpackSchema,
  mods: z.array(resolvedModpackModSchema),
  kubejs: z.record(namespace, z.object({ en_us: langRecordSchema, zh_tw: langRecordSchema })),
  ftbquests: questApiSchema.optional(),
});

export async function fetchModpackData(id: string, fetchImpl: FetchLike = fetch): Promise<ModpackPayload> {
  const res = await fetchImpl(modpackApiUrl(id));
  if (!res.ok) throw new Error(`HTTP ${res.status} for modpack ${id}`);
  const body = payloadSchema.parse(await res.json());
  const quests = body.ftbquests?.status === 'supported'
    ? { layout: body.ftbquests.layout, en: body.ftbquests.en_us, zh: body.ftbquests.zh_tw }
    : undefined;
  return {
    meta: body.meta,
    mods: body.mods,
    kubejs: Object.fromEntries(Object.entries(body.kubejs).map(([ns, texts]) => [ns, { en: texts.en_us, zh: texts.zh_tw }])),
    ...(quests ? { ftbquests: quests } : {}),
  };
}

/** 取得整合包中已收錄的模組；每個 modId 只請求一次，已下架（404）的模組略過 */
export async function fetchIncludedMods(pack: ModpackPayload, fetchImpl: FetchLike = fetch): Promise<ModPayload[]> {
  const payloads = await Promise.all(includedModIds(pack.mods).map((id) => fetchModData(id, fetchImpl)));
  return payloads.filter((p): p is ModPayload => p !== null);
}

export function modpackPackFileName(id: string, mcVersion: string): string {
  return `${id}-zh_tw-${mcVersion}.zip`;
}

/** 下載檔中 resourcepacks/ 底下的資源包檔名 */
export function modpackResourcePackName(id: string): string {
  return `${id}-zh_tw.zip`;
}

/** 未翻譯的 KubeJS 條目不寫入：遊戲本來就會退回 KubeJS 自己的英文，寫入只會蓋掉既有的中文 */
function translatedOnly(project: ModProject): ModProject {
  return { ...project, entries: project.entries.filter((e) => e.target !== '') };
}

/** 已收錄模組（含手冊）＋ KubeJS 譯文合成一個資源包；pack_format 依整合包的 Minecraft 版本；沒有任何內容時為 null */
async function resourcePack(pack: ModpackPayload, mods: readonly ModPayload[]): Promise<BundleResourcePack | null> {
  const projects = [
    ...mods.map(payloadToProject),
    ...kubejsProjects(modpackRef(pack.meta), pack.kubejs, 0).map(translatedOnly),
  ];
  if (projects.length === 0) return null;
  const result = await exportProjects(projects, {
    kind: 'merged-pack',
    untranslated: 'keep-source',
    mcVersion: pack.meta.source.mcVersion,
    description: `ModLangForge 繁中翻譯 · ${pack.meta.name} · ${new Date().toISOString().slice(0, 10)}`,
  });
  return { fileName: modpackResourcePackName(pack.meta.id), bytes: new Uint8Array(await result.blob.arrayBuffer()) };
}

/** 任務檔只含已翻譯條目（未翻譯的由遊戲退回英文） */
function questParts(pack: ModpackPayload): QuestPart[] {
  if (!pack.ftbquests) return [];
  const translations = questTranslations(questProject(modpackRef(pack.meta), pack.ftbquests, 0));
  return [{ modpackId: pack.meta.id, layout: pack.ftbquests.layout, translations }];
}

/** 兩部分的一鍵下載：resourcepacks/<id>-zh_tw.zip ＋ config/ 的 FTB 任務翻譯（有已翻條目時）＋安裝說明 */
export async function buildModpackPack(pack: ModpackPayload, mods: readonly ModPayload[]): Promise<ExportResult> {
  const blob = await buildBundle({
    title: `ModLangForge 繁中翻譯 · ${pack.meta.name}`,
    resourcePack: await resourcePack(pack, mods),
    quests: questParts(pack),
  });
  return { fileName: modpackPackFileName(pack.meta.id, pack.meta.source.mcVersion), blob };
}
```

- [ ] **Step 4: Update the download copy and install steps** — `apps/site/src/i18n/zh-TW.ts` 的 `modpackPage`

把

```ts
    downloadTitle: '下載整合包繁中資源包',
    download: '下載整合包資源包',
    downloadNote: (mcVersion: string) => `資源包適用 Minecraft ${mcVersion}；還沒收錄的模組和還沒翻的文字會維持英文。`,
```

改為

```ts
    downloadTitle: '下載整合包繁中翻譯',
    download: '下載整合包翻譯',
    downloadNote: (mcVersion: string) => `適用 Minecraft ${mcVersion}；下載後解壓縮到整合包資料夾，還沒收錄的模組和還沒翻的文字會維持英文。`,
    installSteps: [
      '下載壓縮檔後，解壓縮到整合包的資料夾（有 mods、config 資料夾的那一層）。',
      '進遊戲到「選項 → 資源包」啟用 resourcepacks 裡的資源包，語言設為「繁體中文（台灣）」。',
      '有 FTB 任務翻譯時會放在 config 資料夾；在伺服器上玩時，要把它放到伺服器的 config 資料夾。',
    ],
```

`apps/site/src/pages/modpacks/[modpackId].astro` 中把 `{t.modPage.installSteps.map((step) => <li>{step}</li>)}` 改為 `{t.modpackPage.installSteps.map((step) => <li>{step}</li>)}`。

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @mlf/site && npm run typecheck -w @mlf/site && npm run lint`
Expected: PASS（含 `ModpackDownload` 的新按鈕名稱），typecheck 與 lint 無錯誤

- [ ] **Step 6: Commit**

```bash
git add apps/site/src/islands/downloadModpack.ts apps/site/src/islands/modpackDownload.test.tsx apps/site/src/i18n/zh-TW.ts "apps/site/src/pages/modpacks/[modpackId].astro"
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(site): download modpack translations as resource pack plus quest files"
```

---

### Task 15: 翻譯工具：載入整合包的 FTB 任務（integration）

**Files:**
- Modify: `apps/site/src/translator/modpack/modpackIndex.ts`
- Modify: `apps/site/src/translator/store/workspaceStore.ts`
- Modify: `apps/site/src/translator/i18n/zh-TW.ts`
- Test: `apps/site/src/translator/store/modpackStore.test.ts`、`apps/site/src/translator/ui/ModpackLoader.test.tsx`（各新增測試；既有測試不改）

**Interfaces:**
- Consumes: `ModpackPayload.ftbquests`（Task 14）、`questProject`、`mergeQuestProject`、`questProjectId`（`@mlf/core/ftbquests`）、`modpackRef`、`ModpackRef`、`QuestData`
- Produces:
  - `fetchModpackIndex`：index 項目的 `ftbquests` 以 zod 驗證（`{ status: 'supported'; total } | { status: 'unsupported-version' }`，可為 `null` 或缺少）；有 KubeJS 文字**或** `supported` 任務文字（`total > 0`）的整合包都列出
  - `addModpack(pack)`：另建／合併 `modpack-quests:<id>` 專案（顯示名稱「<整合包名>（FTB 任務）」、`questLayout` 取 payload）；KubeJS 與任務都沒有時提示「沒有需要翻譯的整合包文字」
  - `t.modpack.hint` 改為提到 FTB 任務

- [ ] **Step 1: Write the failing tests**

在 `apps/site/src/translator/store/modpackStore.test.ts` 的 `describe('addModpack', …)` 內最後加入：

```ts
  const TITLE = 'quest.44A5523F7A909209.title';
  const DESC = 'quest.44A5523F7A909209.quest_desc';
  const QUESTS = { layout: 'single' as const, en: { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' }, zh: { [TITLE]: '歡迎' } };

  it('creates one FTB quest project named after the modpack', async () => {
    await ws().addModpack({ ...payload('1.0.0', {}), ftbquests: QUESTS });
    expect(ws().mods.map((m) => [m.id, m.modId, m.name, m.questLayout])).toEqual([
      ['modpack-quests:example-pack', 'ftbquests', 'Example Pack（FTB 任務）', 'single'],
    ]);
    expect(ws().mods[0]?.entries.map((e) => [e.key, e.target])).toEqual([[TITLE, '歡迎'], [DESC, '']]);
    expect((await loadAll()).map((m) => m.id)).toEqual(['modpack-quests:example-pack']);
    expect(messages()).toContain('已載入「Example Pack」的 1 組整合包文字');
  });

  it('loads KubeJS namespaces and quests together', async () => {
    await ws().addModpack({ ...payload('1.0.0', { kubejs: { en: { a: 'Gear' }, zh: {} } }), ftbquests: QUESTS });
    expect(ws().mods.map((m) => m.id)).toEqual(['modpack:example-pack:kubejs', 'modpack-quests:example-pack']);
    expect(messages()).toContain('已載入「Example Pack」的 2 組整合包文字');
  });

  it('merges a reloaded quest project and follows the new layout', async () => {
    await ws().addModpack({ ...payload('1.0.0', {}), ftbquests: QUESTS });
    ws().editEntry('modpack-quests:example-pack', DESC, '第一行\n第二行\n第三行');
    await ws().addModpack({ ...payload('1.1.0', {}), ftbquests: { ...QUESTS, layout: 'split' } });
    expect(ws().mods).toHaveLength(1);
    expect(ws().mods[0]).toMatchObject({ version: '1.1.0', questLayout: 'split' });
    expect(ws().mods[0]?.entries.find((e) => e.key === DESC)?.target).toBe('第一行\n第二行\n第三行');
  });
```

在 `apps/site/src/translator/ui/ModpackLoader.test.tsx` 的 `describe('fetchModpackIndex', …)` 內最後加入：

```ts
  it('also lists modpacks that only have FTB quest text', async () => {
    const body = {
      version: 1,
      modpacks: [
        { id: 'quests', name: 'Quests', nameZh: null, kubejs: null, ftbquests: { status: 'supported', total: 6, translated: 3, percent: 50 } },
        { id: 'old', name: 'Old', nameZh: null, kubejs: null, ftbquests: { status: 'unsupported-version' } },
        { id: 'none', name: 'None', nameZh: null, kubejs: null, ftbquests: null },
      ],
    };
    const ok = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => body }));
    expect(await fetchModpackIndex(ok)).toEqual([{ id: 'quests', name: 'Quests', nameZh: null }]);
    const bad = { version: 1, modpacks: [{ id: 'x', name: 'X', nameZh: null, kubejs: null, ftbquests: { status: 'supported', total: -1 } }] };
    await expect(fetchModpackIndex(vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => bad })))).rejects.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/site -- src/translator/store/modpackStore.test.ts src/translator/ui/ModpackLoader.test.tsx`
Expected: FAIL — 沒有建立 `modpack-quests:example-pack`（只有任務時提示「沒有需要翻譯的整合包文字」）、index 清單沒有 `quests`。記錄 RED。

- [ ] **Step 3: List modpacks with quest text** — 以下列內容取代 `apps/site/src/translator/modpack/modpackIndex.ts`

```ts
import { z } from 'zod';
import { isValidModpackId } from '@mlf/core/modpack';
import { MODPACK_INDEX_API } from '../../lib/config';

export interface ModpackOption {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string | null;
}

const questSummarySchema = z.union([
  z.object({ status: z.literal('supported'), total: z.number().int().nonnegative() }),
  z.object({ status: z.literal('unsupported-version') }),
]);

const indexSchema = z.object({
  version: z.literal(1),
  modpacks: z.array(z.object({
    id: z.string().refine(isValidModpackId, { message: '整合包 id 不合法' }),
    name: z.string().min(1),
    nameZh: z.string().nullable(),
    kubejs: z.object({ total: z.number().int().nonnegative() }).nullable(),
    ftbquests: questSummarySchema.nullish(),
  })),
});

type FetchImpl = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** 網站上有 KubeJS 文字或 FTB 任務文字可翻的整合包 */
export async function fetchModpackIndex(fetchImpl: FetchImpl = fetch): Promise<ModpackOption[]> {
  const res = await fetchImpl(MODPACK_INDEX_API);
  if (!res.ok) throw new Error(`Modpack index HTTP ${res.status}`);
  const body = indexSchema.parse(await res.json());
  return body.modpacks
    .filter((p) => (p.kubejs?.total ?? 0) > 0 || (p.ftbquests?.status === 'supported' && p.ftbquests.total > 0))
    .map(({ id, name, nameZh }) => ({ id, name, nameZh }));
}
```

- [ ] **Step 4: Create or merge the quest project** — `apps/site/src/translator/store/workspaceStore.ts`

(a) import 區加入：

```ts
import { mergeQuestProject, questProject, questProjectId } from '@mlf/core/ftbquests';
```

並把 `import { kubejsProject, mergeKubejsProject, modpackProjectId, modpackRef } from '@mlf/core/modpack';` 改為

```ts
import { kubejsProject, mergeKubejsProject, modpackProjectId, modpackRef, type ModpackRef, type QuestData } from '@mlf/core/modpack';
```

(b) 在 `replaceMod` 之後加入：

```ts
/** 有任務文字時建立或合併 modpack-quests:<id> 專案 */
function questProjects(existing: ModProject | undefined, ref: ModpackRef, data: QuestData | undefined, now: number): ModProject[] {
  if (!data || Object.keys(data.en).length === 0) return [];
  return [existing ? mergeQuestProject(existing, ref, data, now) : questProject(ref, data, now)];
}
```

(c) `addModpack` 整段改為：

```ts
    addModpack: async (pack) => {
      const ref = modpackRef(pack.meta);
      const now = Date.now();
      const find = (id: string) => get().mods.find((m) => m.id === id);
      const kubejs = Object.keys(pack.kubejs).sort().flatMap((ns) => {
        const texts = pack.kubejs[ns];
        if (!texts) return [];
        const existing = find(modpackProjectId(ref.id, ns));
        return [existing ? mergeKubejsProject(existing, ref, ns, texts, now) : kubejsProject(ref, ns, texts, now)];
      });
      const projects = [...kubejs, ...questProjects(find(questProjectId(ref.id)), ref, pack.ftbquests, now)];
      if (projects.length === 0) {
        toastInfo(t.modpack.noText(pack.meta.name));
        return;
      }
      set({
        mods: projects.reduce<readonly ModProject[]>(replaceMod, get().mods),
        activeModId: get().activeModId ?? projects[0]?.id ?? null,
      });
      for (const p of projects) await persist(() => saveProject(p));
      toastInfo(t.modpack.loaded(pack.meta.name, projects.length));
    },
```

（`addModpack` 的介面註解改為「由網站整合包資料建立或合併 KubeJS 專案（每個命名空間一個）與 FTB 任務專案」。）

- [ ] **Step 5: Update the loader hint** — `apps/site/src/translator/i18n/zh-TW.ts`

```ts
    hint: '翻譯整合包自己加的文字（KubeJS）和 FTB 任務，每組文字會變成一個項目。',
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/site -- src/translator && npm run typecheck -w @mlf/site`
Expected: PASS，typecheck 無錯誤

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/translator/modpack/modpackIndex.ts apps/site/src/translator/store/workspaceStore.ts apps/site/src/translator/i18n/zh-TW.ts apps/site/src/translator/store/modpackStore.test.ts apps/site/src/translator/ui/ModpackLoader.test.tsx
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(translator): load FTB Quests text from site modpacks"
```

---

### Task 16: 翻譯工具：多行編輯與任務格式碼檢查（integration）

**Files:**
- Modify: `apps/site/src/translator/ui/TranslationRow.tsx`
- Modify: `apps/site/src/translator/ui/TranslationTable.tsx`
- Modify: `apps/site/src/translator/ui/Editor.tsx`
- Modify: `apps/site/src/translator/ui/filterEntries.ts`
- Test: `apps/site/src/translator/ui/TranslationRow.test.tsx`、`apps/site/src/translator/ui/Editor.test.tsx`、`apps/site/src/translator/ui/filterEntries.test.ts`（各新增測試；既有測試不改）

**Interfaces:**
- Consumes: `formatCheckFor`、`hasQuestWarning`、`isQuestProjectId`、`questProject`（`@mlf/core/ftbquests`）、`FormatCheck`（`TranslationRow.tsx` 既有型別）
- Produces:
  - `TranslationRow`：編輯框初始行數 = 原文行數（最多 8 行）；Shift＋Enter 換行、Enter 存好（既有行為）
  - `TranslationTable` 新增選填 prop `checkFor?: (projectId: string) => FormatCheck`（有值時優先於 `check`）
  - `Editor`：語言檔區塊以 `formatCheckFor` 依專案選檢查（任務專案用任務格式碼），手冊區塊維持 `checkGuideFormat`
  - `filterEntries`：「符號待確認」篩選對任務專案使用 `hasQuestWarning`

- [ ] **Step 1: Write the failing tests**

在 `apps/site/src/translator/ui/TranslationRow.test.tsx` 最後加入：

```tsx
describe('TranslationRow multi-line text', () => {
  it('opens multi-line sources as multi-line editors and keeps Shift+Enter newlines', async () => {
    const onCommit = vi.fn();
    const multi: TranslationEntry = { key: 'quest.44A5523F7A909209.quest_desc', source: 'Line one\nLine two\nLine three', target: '', status: 'untranslated' };
    render(<TranslationRow index={0} modId="modpack-quests:p" entry={multi} showModId={false} showReference={false} onCommit={onCommit} onNavigate={vi.fn()} />);
    const box = screen.getByRole('textbox');
    expect(box).toHaveAttribute('rows', '3');
    await userEvent.type(box, '第一行{Shift>}{Enter}{/Shift}第二行{Enter}');
    expect(onCommit).toHaveBeenCalledWith('modpack-quests:p', multi.key, '第一行\n第二行');
  });

  it('keeps single-line sources on one row', () => {
    renderRow();
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '1');
  });
});
```

在 `apps/site/src/translator/ui/Editor.test.tsx` 的 import 區加入 `import { questProject } from '@mlf/core/ftbquests';`，並在檔案最後加入：

```tsx
describe('Editor format checks', () => {
  it('checks FTB quest projects with the quest format codes', () => {
    const quest = questProject(
      { id: 'example-quests', name: 'Example Quests', version: '1' },
      { layout: 'single', en: { 'quest.44A5523F7A909209.title': '&aWelcome' }, zh: { 'quest.44A5523F7A909209.title': '歡迎' } },
      1,
    );
    useWorkspace.setState({ ...initialWorkspaceState, mods: [quest], activeModId: quest.id });
    render(<Editor />);
    expect(screen.getByText('缺少 &a')).toBeInTheDocument();
  });
});
```

在 `apps/site/src/translator/ui/filterEntries.test.ts` 的 import 區加入 `import { questProject } from '@mlf/core/ftbquests';`，並在檔案最後加入：

```ts
describe('filterEntries for FTB quest projects', () => {
  it('uses the quest format codes for the warning filter', () => {
    const texts = { en: { a: '&aGo', b: 'Line one\nLine two' }, zh: { a: '走', b: '一行' } };
    const quest = questProject({ id: 'p', name: 'P', version: '1' }, { layout: 'single', ...texts }, 1);
    const plain = { ...quest, id: 'plain', modId: 'plain' };
    const hits = filterEntries([quest, plain], { scope: 'all', activeModId: null, query: '', status: 'warning', section: 'lang' });
    expect(hits.map((h) => `${h.modId}:${h.entry.key}`)).toEqual(['modpack-quests:p:a', 'plain:b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/site -- src/translator/ui/TranslationRow.test.tsx src/translator/ui/Editor.test.tsx src/translator/ui/filterEntries.test.ts`
Expected: FAIL — `rows` 為 `1`（多行原文）、找不到「缺少 &a」、warning 篩選結果為 `['modpack-quests:p:b', 'plain:b']`。記錄 RED。

- [ ] **Step 3: Size the editor to the source** — `apps/site/src/translator/ui/TranslationRow.tsx`

在 `const NO_TERMS: readonly GlossaryTerm[] = [];` 之前加入：

```ts
/** 多行原文（例如 FTB 任務說明）時，編輯框一開始就顯示相同行數，最多 MAX_ROWS 行 */
const MAX_ROWS = 8;

function rowsFor(source: string): number {
  return Math.min(MAX_ROWS, source.split('\n').length);
}
```

並把 textarea 的 `rows={1}` 改為 `rows={rowsFor(entry.source)}`。

- [ ] **Step 4: Pick the checker per project** — `apps/site/src/translator/ui/TranslationTable.tsx`

在 `TranslationTableProps` 的 `check?: FormatCheck;` 之後加入：

```ts
  /** 依專案選格式碼檢查（例如 FTB 任務專案）；有值時優先於 check */
  readonly checkFor?: (projectId: string) => FormatCheck;
```

函式參數改為 `({ hits, showModId, showReference, onCommit, termsFor, autoCommit = true, check, checkFor }: TranslationTableProps)`，並把 `<TranslationRow … check={check} />` 的 `check={check}` 改為 `check={checkFor ? checkFor(hit.modId) : check}`。

`apps/site/src/translator/ui/Editor.tsx`：

- import 區加入 `import { formatCheckFor } from '@mlf/core/ftbquests';`
- `<TranslationTable … check={isGuide ? checkGuideFormat : checkFormat} … />` 之後（同一個元素內）加入 `checkFor={isGuide ? undefined : formatCheckFor}`

- [ ] **Step 5: Use quest warnings in the filter** — 以下列內容取代 `apps/site/src/translator/ui/filterEntries.ts`

```ts
import { hasQuestWarning, isQuestProjectId } from '@mlf/core/ftbquests';
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

/** 「符號待確認」：手冊用 Patchouli 格式碼、FTB 任務專案用任務格式碼，其餘用一般格式碼 */
function statusTest(status: StatusFilter, section: EntrySection, projectId: string): EntryTest {
  if (status !== 'warning') return STATUS_TESTS[status];
  if (section === 'guide') return hasGuideWarning;
  return isQuestProjectId(projectId) ? hasQuestWarning : hasWarning;
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
  return scoped.flatMap((m) => {
    const test = statusTest(opts.status, opts.section, m.id);
    return sectionEntries(m, opts.section)
      .filter((e) => e.status !== 'obsolete' && test(e) && matchesQuery(e, q))
      .map((entry) => ({ modId: m.id, entry }));
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/site -- src/translator && npm run typecheck -w @mlf/site && npm run lint`
Expected: PASS，typecheck 與 lint 無錯誤

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/translator/ui
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(translator): edit multi-line quest text and check quest format codes"
```

---

### Task 17: 翻譯工具：任務的匯出與投稿檔（integration）

**Files:**
- Modify: `apps/site/src/translator/ui/contribution.ts`
- Test: `apps/site/src/translator/ui/modpackContribution.test.ts`（新增測試；既有測試不改）

**Interfaces:**
- Consumes: `parseQuestProjectId`、`questProject`（`@mlf/core/ftbquests`）、`exportProjects`（Task 8 已處理任務專案；`ExportDialog` 不需修改）、`zipFileNames`（`@mlf/core/test/zipFiles`）
- Produces:
  - `buildContribution`：任務專案輸出 `modpacks/<id>/ftbquests/zh_tw.json`（已翻譯、未移除的條目），不輸出 `mod.json`；README 列出路徑並說明放到 `data/` 底下相同位置

- [ ] **Step 1: Write the failing test** — `apps/site/src/translator/ui/modpackContribution.test.ts`

import 區改為：

```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportProjects } from '@mlf/core/export';
import { questProject } from '@mlf/core/ftbquests';
import { buildProject, updateEntry } from '@mlf/core/merge';
import { kubejsProject } from '@mlf/core/modpack';
import { zipFileNames } from '@mlf/core/test/zipFiles';
import { buildContribution } from './contribution';
```

檔案最後加入：

```ts
describe('FTB quest contributions', () => {
  const TITLE = 'quest.44A5523F7A909209.title';
  const DESC = 'quest.44A5523F7A909209.quest_desc';
  const quest = updateEntry(
    questProject({ id: 'example-quests', name: 'Example Quests', version: '1.0.0' }, { layout: 'split', en: { [TITLE]: 'Welcome', [DESC]: 'Line one\nLine two' }, zh: { [TITLE]: '歡迎' } }, 1),
    DESC, '第一行\n第二行\n第三行', 2,
  );

  it('writes quest translations to modpacks/<id>/ftbquests/zh_tw.json', async () => {
    const zip = await unzip((await buildContribution([quest, kube], '2026-10-17')).blob);
    expect(zipFileNames(zip)).toEqual(['README.txt', 'modpacks/example-pack/kubejs/kubejs/zh_tw.json', 'modpacks/example-quests/ftbquests/zh_tw.json']);
    expect(JSON.parse((await zip.file('modpacks/example-quests/ftbquests/zh_tw.json')?.async('string')) ?? '{}')).toEqual({
      [TITLE]: '歡迎', [DESC]: '第一行\n第二行\n第三行',
    });
    const readme = (await zip.file('README.txt')?.async('string')) ?? '';
    expect(readme).toContain('包含整合包文字：modpacks/example-quests/ftbquests/zh_tw.json, modpacks/example-pack/kubejs/kubejs/zh_tw.json');
    expect(readme).toContain('FTB 任務的翻譯在 modpacks/<整合包>/ftbquests/zh_tw.json');
    expect(readme).not.toContain('包含模組：');
  });

  it('exports quest projects next to the resource pack in translator downloads', async () => {
    const result = await exportProjects([quest, kube], { kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.21.1', description: 'd' });
    expect(zipFileNames(await unzip(result.blob))).toEqual([
      'config/ftbquests/quests/lang/zh_tw/modlangforge.snbt', 'resourcepacks/ModLangForge-zh_tw.zip', '安裝說明.txt',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/site -- src/translator/ui/modpackContribution.test.ts`
Expected: FAIL — 投稿檔把任務專案當成模組輸出（出現 `ftbquests/mod.json`），沒有 `modpacks/example-quests/ftbquests/zh_tw.json`。記錄 RED。

- [ ] **Step 3: Write quest contributions** — `apps/site/src/translator/ui/contribution.ts`

(a) import 區加入 `import { parseQuestProjectId } from '@mlf/core/ftbquests';`

(b) `readme` 改為：

```ts
function readme(modIds: readonly string[], modpackPaths: readonly string[]): string {
  return [
    'ModLangForge 翻譯投稿檔',
    '',
    ...(modIds.length > 0 ? [`包含模組：${modIds.join(', ')}`] : []),
    ...(modpackPaths.length > 0 ? [`包含整合包文字：${modpackPaths.join(', ')}`] : []),
    '',
    '投稿步驟：',
    `1. Fork https://github.com/${REPO}`,
    '2. 把每個模組資料夾放到 data/mods/ 底下（資料夾名稱即 modId）。',
    '   含手冊的模組另有 patchouli/ 資料夾與 patchouli_zh_tw.json，請整個資料夾一起放入。',
    '   整合包文字在 modpacks/ 資料夾：把 modpacks/<整合包>/kubejs/<命名空間>/zh_tw.json 放到 data/ 底下相同的位置（取代原本的 zh_tw.json）。',
    '   FTB 任務的翻譯在 modpacks/<整合包>/ftbquests/zh_tw.json，同樣放到 data/ 底下相同的位置。',
    '3. 檢查 mod.json：簡介、作者、連結、支援版本、載入器、來源版本（sourceVersions）。',
    '4. 執行 npm run validate:data 確認格式正確。',
    '5. 送出 Pull Request。',
    '',
    '投稿的譯文將以 CC BY-SA 4.0 授權釋出。',
    '',
  ].join('\n');
}
```

(c) 把 `kubejsPath` 之後到檔案結尾（`buildContribution`）換成：

```ts
/** 整合包 KubeJS 專案只輸出譯文；英文原文由維護者以 add:modpack 維護 */
function kubejsPath(ref: { readonly modpackId: string; readonly ns: string }): string {
  return `modpacks/${ref.modpackId}/kubejs/${ref.ns}/zh_tw.json`;
}

function questPath(modpackId: string): string {
  return `modpacks/${modpackId}/ftbquests/zh_tw.json`;
}

/** 整合包專案（KubeJS、FTB 任務）只輸出一個譯文檔；其他專案回傳 null */
function modpackFile(p: ModProject): [string, string] | null {
  const kube = parseModpackProjectId(p.id);
  if (kube) return [kubejsPath(kube), toJson(translatedEntries(p))];
  const quest = parseQuestProjectId(p.id);
  return quest ? [questPath(quest.modpackId), toJson(translatedEntries(p))] : null;
}

export async function buildContribution(projects: readonly ModProject[], today: string): Promise<ExportResult> {
  const zip = new JSZip();
  const files = projects.map((p) => ({ p, modpack: modpackFile(p) }));
  for (const { p, modpack } of files) {
    for (const [path, text] of modpack ? [modpack] : modFiles(p, today)) zip.file(path, text);
  }
  const modIds = files.filter((f) => f.modpack === null).map((f) => f.p.modId);
  zip.file('README.txt', readme(modIds, files.flatMap((f) => (f.modpack ? [f.modpack[0]] : []))));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { fileName: 'ModLangForge-contribution.zip', blob: new Blob([bytes as BlobPart], { type: 'application/zip' }) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/site -- src/translator && npm run typecheck -w @mlf/site && npm run lint`
Expected: PASS（含既有 KubeJS 投稿測試），typecheck 與 lint 無錯誤

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/translator/ui/contribution.ts apps/site/src/translator/ui/modpackContribution.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(translator): export FTB Quests contributions"
```

---

### Task 18: 範例任務整合包、E2E、文件與完整驗證（integration）

**Files:**
- Create: `data/modpacks/example-quests/modpack.json`
- Create: `data/modpacks/example-quests/ftbquests/en_us.json`
- Create: `data/modpacks/example-quests/ftbquests/zh_tw.json`
- Modify: `data/modpacks/example-pack/modpack.json`（加上 `"ftbquests": { "status": "unsupported-version" }`；維持 MC 1.20.1／pack_format 15，4b 的測試與 E2E 不受影響）
- Modify: `e2e/modpacks.spec.ts`（整份取代）
- Modify: `e2e/site.spec.ts`（CSP 測試加入新頁面）
- Modify: `data/README.md`、`CONTRIBUTING.md`、`README.md`

**Interfaces:**
- Consumes: 全部前述 task；既有 `data/mods/create`（`links.modrinth` = `https://modrinth.com/mod/create`）；`e2e/helpers.ts` 的 `gotoHydrated`、`unzipDownload`；`parseSnbt`、`readQuestLang`（`packages/core/src/ftbquests/index`）、`zipFileNames`（`packages/core/src/test/zipFiles`）
- Produces: 測試專用範例整合包 `example-quests`（MC 1.21.1、NeoForge、`single`，6 條任務文字其中 3 條已翻譯；簡介標明不對應真實整合包）；E2E 覆蓋整合包頁兩部分下載（含／不含任務）與翻譯工具任務流程（載入、多行編輯、匯出、投稿）

- [ ] **Step 1: Write the E2E tests** — 以下列內容取代 `e2e/modpacks.spec.ts`

```ts
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { parseSnbt, readQuestLang } from '../packages/core/src/ftbquests/index';
import { zipFileNames } from '../packages/core/src/test/zipFiles';
import { gotoHydrated, unzipDownload } from './helpers';

const KUBEJS_DIR = 'data/modpacks/example-pack/kubejs/kubejs';
const QUESTS_DIR = 'data/modpacks/example-quests/ftbquests';
const GUIDE = '安裝說明.txt';
const QUEST_FILE = 'config/ftbquests/quests/lang/zh_tw.snbt';
const TITLE = 'quest.44A5523F7A909209.title';
const DESC = 'quest.44A5523F7A909209.quest_desc';

async function readJsonFile(path: string): Promise<Record<string, string>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
}

async function readZipJson(zip: JSZip, path: string): Promise<Record<string, string>> {
  return JSON.parse((await zip.file(path)?.async('string')) ?? '{}') as Record<string, string>;
}

async function innerPack(zip: JSZip, name: string): Promise<JSZip> {
  return JSZip.loadAsync((await zip.file(`resourcepacks/${name}`)?.async('uint8array')) ?? new Uint8Array());
}

async function questTexts(zip: JSZip): Promise<Readonly<Record<string, string>>> {
  return readQuestLang(parseSnbt((await zip.file(QUEST_FILE)?.async('string')) ?? '')).texts;
}

/** 期望值從 repo 資料推導：只有已翻譯的條目會寫入（未翻譯的由遊戲退回英文） */
async function translatedOnly(dir: string): Promise<Record<string, string>> {
  const en = await readJsonFile(`${dir}/en_us.json`);
  const zh = await readJsonFile(`${dir}/zh_tw.json`);
  return Object.fromEntries(Object.keys(en).filter((k) => Object.hasOwn(zh, k) && zh[k] !== '').map((k) => [k, zh[k] ?? '']));
}

test('modpack catalog links to the example modpacks and shows quest status', async ({ page }) => {
  await gotoHydrated(page, '/');
  await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '整合包', exact: true }).click();
  await expect(page).toHaveURL(/\/modpacks\/?$/);
  const list = page.getByRole('list', { name: '整合包清單' });
  const card = list.getByRole('listitem').filter({ hasText: 'Example Pack' });
  await expect(card).toContainText('已收錄模組 2／3');
  await expect(card).toContainText('Minecraft 1.20.1');
  await expect(card).toContainText('此版本的任務暫不支援翻譯');
  await expect(list.getByRole('listitem').filter({ hasText: 'Example Quests' })).toContainText('FTB 任務 50%');
  await card.getByRole('link', { name: 'Example Pack（範例整合包）' }).click();
  await expect(page).toHaveURL(/\/modpacks\/example-pack\/?$/);
});

test('modpack page downloads the resource pack under resourcepacks/ with no quest files on 1.20.1', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-pack/');
  await expect(page.getByRole('link', { name: 'Create（機械動力）' })).toHaveAttribute('href', '/mods/create/');
  await expect(page.getByText('example-missing-mod')).toBeVisible();
  await expect(page.getByText(/整合包文字已翻譯 2 \/ 3 條/).first()).toBeVisible();
  await expect(page.getByText('此版本的任務暫不支援翻譯')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載整合包翻譯' }).click()]);
  expect(download.suggestedFilename()).toBe('example-pack-zh_tw-1.20.1.zip');
  const zip = await unzipDownload(download);
  expect(zipFileNames(zip)).toEqual(['resourcepacks/example-pack-zh_tw.zip', GUIDE]);
  const inner = await innerPack(zip, 'example-pack-zh_tw.zip');
  expect(JSON.parse((await inner.file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(15);
  expect(inner.file('assets/create/lang/zh_tw.json')).not.toBeNull();
  expect(inner.file('assets/jei/lang/zh_tw.json')).not.toBeNull();
  expect(await readZipJson(inner, 'assets/kubejs/lang/zh_tw.json')).toEqual(await translatedOnly(KUBEJS_DIR));
});

test('quest modpack page shows quest progress and downloads quest translations', async ({ page }) => {
  await gotoHydrated(page, '/modpacks/example-quests/');
  await expect(page.getByText(/FTB 任務已翻譯 3 \/ 6 條/).first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載整合包翻譯' }).click()]);
  expect(download.suggestedFilename()).toBe('example-quests-zh_tw-1.21.1.zip');
  const zip = await unzipDownload(download);
  expect(zipFileNames(zip)).toEqual([QUEST_FILE, 'resourcepacks/example-quests-zh_tw.zip', GUIDE]);
  expect(await questTexts(zip)).toEqual(await translatedOnly(QUESTS_DIR));
  expect(JSON.parse((await (await innerPack(zip, 'example-quests-zh_tw.zip')).file('pack.mcmeta')?.async('string')) ?? '{}').pack.pack_format).toBe(34);
  expect((await zip.file(GUIDE)?.async('string')) ?? '').toContain('伺服器的 config 資料夾');
});

test('translator loads the example modpack and exports its KubeJS text', async ({ page }) => {
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('選擇整合包').selectOption('example-pack');
  await page.getByRole('button', { name: '載入整合包' }).click();
  await expect(page.getByText('Example Casing', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: /item\.kubejs\.example_casing/ }).fill('範例外殼');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下載翻譯' });
  const [pack] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const lang = await readZipJson(await unzipDownload(pack), 'assets/kubejs/lang/zh_tw.json');
  expect(lang['item.kubejs.example_casing']).toBe('範例外殼');
  expect(lang['item.kubejs.example_gear']).toBe('範例齒輪');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  await dialog.getByRole('radio', { name: /分享給本站/ }).click();
  const [contribution] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zh = await readZipJson(await unzipDownload(contribution), 'modpacks/example-pack/kubejs/kubejs/zh_tw.json');
  expect(zh['item.kubejs.example_casing']).toBe('範例外殼');
});

test('translator loads FTB quests, edits a multi-line description and exports it', async ({ page }) => {
  const typed = '歡迎來到範例整合包。\n{@pagebreak}\n做一個 &6齒輪&r 繼續。';
  await gotoHydrated(page, '/translate/');
  await page.getByLabel('選擇整合包').selectOption('example-quests');
  await page.getByRole('button', { name: '載入整合包' }).click();
  await expect(page.getByRole('button', { name: /Example Quests（FTB 任務）/ })).toBeVisible();
  const box = page.getByRole('textbox', { name: /quest\.44A5523F7A909209\.quest_desc/ });
  await expect(box).toHaveAttribute('rows', '3');
  await box.fill(typed);
  await box.press('Enter');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '下載翻譯' });
  const [pack] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zip = await unzipDownload(pack);
  expect(zipFileNames(zip)).toEqual([QUEST_FILE, GUIDE]);
  const texts = await questTexts(zip);
  expect(texts[DESC]).toBe(typed);
  expect(texts[TITLE]).toBe('&a歡迎');

  await page.getByRole('button', { name: '下載', exact: true }).click();
  await dialog.getByRole('radio', { name: /分享給本站/ }).click();
  const [contribution] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: '下載', exact: true }).click()]);
  const zh = await readZipJson(await unzipDownload(contribution), 'modpacks/example-quests/ftbquests/zh_tw.json');
  expect(zh[DESC]).toBe(typed);
});
```

`e2e/site.spec.ts` 的 CSP 測試中把

```ts
  for (const url of ['/', '/mods/create/', '/pack/', '/translate/', '/modpacks/', '/modpacks/example-pack/']) {
```

改為

```ts
  for (const url of ['/', '/mods/create/', '/pack/', '/translate/', '/modpacks/', '/modpacks/example-pack/', '/modpacks/example-quests/']) {
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npm run build && E2E_PORT=8797 npx playwright test e2e/modpacks.spec.ts`
Expected: FAIL — 目錄頁沒有「Example Quests」、`/modpacks/example-quests/` 404、`example-pack` 頁沒有「此版本的任務暫不支援翻譯」、翻譯工具沒有 `example-quests` 選項。需要 `.dev.vars`（缺少時 `cp .dev.vars.example .dev.vars`）；E2E_PORT 8797 與假伺服器 8798 不可被其他 worktree 佔用。記錄 RED。

- [ ] **Step 3: Add the example data**

`data/modpacks/example-quests/modpack.json`：

```json
{
  "id": "example-quests",
  "name": "Example Quests",
  "nameZh": "範例任務整合包",
  "summary": "示範 FTB 任務翻譯格式的範例資料，不對應真實整合包。",
  "authors": ["ModLangForge"],
  "links": { "homepage": "https://github.com/MrPippi/ModLangForge" },
  "source": { "platform": "modrinth", "projectId": "ExAmPlE2", "version": "1.0.0", "mcVersion": "1.21.1", "loader": "neoforge" },
  "mods": [
    { "platform": "modrinth", "projectId": "LNytGWDc", "slug": "create" }
  ],
  "translation": { "status": "machine", "license": "CC-BY-SA-4.0", "source": { "name": "機器翻譯", "url": null }, "contributors": [] },
  "ftbquests": { "status": "supported", "layout": "single" },
  "updatedAt": "2026-10-17"
}
```

`data/modpacks/example-quests/ftbquests/en_us.json`：

```json
{
  "file.0000000000000001.title": "Example Quest Book",
  "chapter.1A2B3C4D5E6F7081.title": "Getting Started",
  "chapter.1A2B3C4D5E6F7081.chapter_subtitle": "Your first steps\nin the example pack",
  "quest.44A5523F7A909209.title": "&aWelcome",
  "quest.44A5523F7A909209.quest_subtitle": "Read me first",
  "quest.44A5523F7A909209.quest_desc": "Welcome to the example pack.\n{@pagebreak}\nCraft a &6gear&r to continue."
}
```

`data/modpacks/example-quests/ftbquests/zh_tw.json`：

```json
{
  "file.0000000000000001.title": "範例任務書",
  "chapter.1A2B3C4D5E6F7081.title": "新手上路",
  "quest.44A5523F7A909209.title": "&a歡迎"
}
```

`data/modpacks/example-pack/modpack.json` 在 `"translation": { … },` 之後、`"updatedAt"` 之前加入一行：

```json
  "ftbquests": { "status": "unsupported-version" },
```

Run: `npm run validate:data`
Expected: 最後一行為「已檢查 N 個模組、2 個整合包：0 個錯誤、… 個警告」，沒有 `data/modpacks/example-pack` 或 `data/modpacks/example-quests` 的註記

- [ ] **Step 4: Run E2E to verify it passes**

Run: `npm run build && E2E_PORT=8797 npm run test:e2e`
Expected: 全部 PASS（含 `modpacks.spec.ts` 5 個測試、CSP 測試新增的網址與既有測試）

- [ ] **Step 5: Document the data format** — `data/README.md`

在「## 整合包」的表格最後一列（`kubejs/<命名空間>/zh_tw.json`）之後加入兩列：

```markdown
| `ftbquests/en_us.json` | 選填。FTB 任務（任務書、章節群組、章節、任務的標題、副標與說明）的英文原文，由 `add:modpack` 從整合包的 `overrides/config/ftbquests/quests/` 取得，不要手動改；key 為 `<類型>.<16 位十六進位 ID>.<欄位>`，多行的說明以 `\n` 分行 |
| `ftbquests/zh_tw.json` | 選填。FTB 任務的繁中譯文；每個 key 都必須存在於 `en_us.json`；行數可以和英文不同，但 `&a` 這類顏色碼、`{@pagebreak}`（要單獨一行）等符號要保留 |
```

並把

```markdown
`modpacks/example-pack/` 是測試用的範例資料，不對應真實整合包。
```

改為

```markdown
`modpacks/example-pack/`（Minecraft 1.20.1）與 `modpacks/example-quests/`（Minecraft 1.21.1，含 FTB 任務）是測試用的範例資料，不對應真實整合包。

FTB 任務只支援 Minecraft 1.21 以上的整合包：`modpack.json` 的 `ftbquests` 寫成 `{ "status": "supported", "layout": "single" }`（`layout` 為 `single`＝`lang/<語言>.snbt`、`split`＝`lang/<語言>/` 資料夾）；1.21 以下但有任務檔的整合包寫成 `{ "status": "unsupported-version" }`，而且不能有 `ftbquests/` 資料夾；沒有任務檔時不寫這個欄位。任務翻譯不能放進資源包，網站下載時會放在 `config/ftbquests/quests/lang/` 底下。
```

- [ ] **Step 6: Document quest contributions** — `CONTRIBUTING.md` 的「## 整合包」

在「- 翻譯整合包自己的文字（KubeJS）：…」那一行之後加入：

```markdown
- 翻譯 FTB 任務（Minecraft 1.21 以上的整合包）：同樣在「載入網站上的整合包」載入，任務會變成「<整合包名>（FTB 任務）」一個項目。多行的任務說明可以用 Shift＋Enter 換行，行數不必和英文一樣，但 `&a` 這類顏色碼和 `{@pagebreak}`（要單獨一行）等符號要保留。翻完後下載時選「分享給本站」，把壓縮檔裡的 `modpacks/<整合包>/ftbquests/zh_tw.json` 放到 `data/` 底下相同位置再送出 Pull Request。
```

並把

```markdown
- 更新時只改 `source`、`mods` 與 KubeJS 英文（新 key 加入、原文不同的會列出、格式碼改變則整次不寫入），不動 `zh_tw.json`。
```

改為

```markdown
- 更新時只改 `source`、`mods`、`ftbquests` 與 KubeJS／FTB 任務的英文（新 key 加入、原文不同的會列出、格式碼改變則整次不寫入），不動 `zh_tw.json`。Minecraft 1.21 以下的整合包不處理任務文字，只標記為 `unsupported-version`；任務檔讀取失敗時會說明是哪個檔案的第幾行，且不寫入任何檔案。
```

- [ ] **Step 7: Update the README** — `README.md`

把

```markdown
- **整合包**：「整合包」頁面列出各整合包用到的模組與翻譯完成度，可一鍵下載包含所有已收錄模組（含手冊）與整合包自己文字（KubeJS）的合併資源包。
```

改為

```markdown
- **整合包**：「整合包」頁面列出各整合包用到的模組與翻譯完成度，可一鍵下載包含所有已收錄模組（含手冊）與整合包自己文字（KubeJS）的合併資源包；Minecraft 1.21 以上的整合包另附 FTB 任務的翻譯，下載後解壓縮到整合包資料夾即可。
```

並把專案結構表中的

```markdown
| `data/modpacks` | 整合包資料（`modpack.json` 與整合包的 KubeJS 文字） |
```

改為

```markdown
| `data/modpacks` | 整合包資料（`modpack.json`、整合包的 KubeJS 文字與 FTB 任務文字） |
```

- [ ] **Step 8: Run the full verification**

Run: `npm run lint && npm run typecheck -w @mlf/core && npm run typecheck -w @mlf/site && npm test && npm run test:coverage -w @mlf/core && npm run validate:data`
Expected: 全部 PASS；core 覆蓋率 ≥ 80%（lines／functions／branches／statements）；`validate:data` 0 個錯誤、2 個整合包

Run: `npm run build && npm run check:dist && E2E_PORT=8797 npm run test:e2e`
Expected: 建置成功、dist 檔案數未超過上限、E2E 全部 PASS

Run: `git ls-files .env`
Expected: 沒有輸出（`.env` 從未被追蹤）

- [ ] **Step 9: Commit**

```bash
git add data/modpacks e2e/modpacks.spec.ts e2e/site.spec.ts data/README.md CONTRIBUTING.md README.md
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "test: cover FTB Quests downloads and translation end to end"
```

PR：標題 `feat: FTB 任務翻譯`；說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。

---

## Spec Coverage

| Spec 項目 | Task |
|---|---|
| 只支援 MC 1.21 以上；1.20.1 顯示「此版本的任務暫不支援翻譯」 | 5、9、13、18 |
| data 存 JSON：`ftbquests/en_us.json`、選填 `zh_tw.json`、key 規則 | 2、5、6 |
| 清單欄位以 `\n` 合併、輸出拆回、行數可不同、空字串／空清單不收錄 | 2、4、14 |
| `modpack.json` 的 `ftbquests`（`status`、`layout`、只有章節檔記 `single`、無任務檔不寫） | 5、9、10 |
| 腳本讀取順序：`lang/en_us.snbt` → `lang/en_us/**.snbt` → `chapters/*.snbt`＋`chapter_groups.snbt`＋`data.snbt`（依 FTB 原始碼確認） | 4、9、11 |
| MC < 1.21：略過、`unsupported-version`、印出提示 | 9、10、11 |
| SNBT 讀取器（換行分隔、逗號可省略、未加引號 key、跳脫、數字字尾、型別陣列、註解）、解析失敗不寫入、解壓大小上限 | 1、9、11 |
| 新增 `en_us.json`；更新沿用 KubeJS 規則、格式碼改變整次拒絕、不動 `zh_tw.json`、更新 `ftbquests` | 10、11 |
| 格式碼（`&` 顏色碼、`\&`、`{@pagebreak}`、`{image:…}`、`{key}`、整行 JSON；換行數不比；pagebreak／JSON 須獨立一行） | 3、5、16 |
| `validate:data`：字串物件、key 規則、未知 key、格式碼、術語、`ftbquests` schema／一致性、`modpacks/<id>/ftbquests/…` 註記、error 不上站 | 5、6、18 |
| 整合包頁任務進度、`unsupported-version` 提示、無任務不顯示；目錄卡片任務進度 | 12、13 |
| 一鍵下載兩部分 zip（`安裝說明.txt`、`resourcepacks/<id>-zh_tw.zip`、依 layout 的任務檔、只含已翻條目、無翻譯省略 config、安裝說明內容） | 8、14、18 |
| SNBT 輸出器（跳脫 `"`、`\`、換行；可讀回） | 2 |
| API：`<id>.json` 的 `ftbquests`、`index.json` 摘要任務進度 | 12 |
| 翻譯工具：`modpack-quests:<id>`、「<整合包名>（FTB 任務）」、重新載入合併、多行編輯 | 7、15、16 |
| 翻譯工具匯出：`config/ftbquests/quests/lang/zh_tw.snbt`（`split` 資料夾）、合併資源包兩部分、投稿檔 `modpacks/<id>/ftbquests/zh_tw.json` | 8、17 |
| 測試：core（SNBT、章節抽取、清單、輸出可讀回、格式碼、更新規則、驗證、載入、覆蓋率 ≥ 80%）、腳本假 fetch（單檔、資料夾、章節檔、1.20.1、解析失敗）、site、翻譯工具、E2E | 1–18 |
| 不在範圍（1.20.1 任務、附加模組、獎勵表／task／reward 標題、展開 `{key}`、自動追蹤、直接上傳任務檔） | 未實作；`task`／`reward_table` key 略過並提示（2、9） |
