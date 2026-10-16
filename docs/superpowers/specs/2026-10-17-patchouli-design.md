# Patchouli 手冊翻譯設計（子專案 4a）

## 問題

許多模組以 Patchouli 提供遊戲內手冊，文字直接寫在 jar 內的 JSON 檔中。目前 jar 解析只找 `assets/<ns>/lang/<locale>.(json|lang)`，手冊完全看不到，無法翻譯、收錄或輸出。

這是「更多語言檔格式」的第一個子專案；之後依序為 4b 整合包翻譯基礎、4c FTB Quests、4d KubeJS。

## 決策

1. **攤平成 key→文字**：每段手冊文字對應一個 key，沿用翻譯工具、術語表、格式碼檢查與完成度計算；輸出時依原始英文結構重建。
2. **與語言檔分開呈現**：手冊有自己的條目清單與完成度；模組頁顯示兩條進度；目錄排序與篩選仍以語言檔為準，有手冊者標示「含手冊」。
3. **英文原文以原樣檔為唯一來源**：不另存英文的攤平檔，載入時即時攤平，避免兩份原文不同步。

## 範圍

- 支援：內容位於 `assets/<ns>/patchouli_books/<book>/en_us/**.json` 的手冊（1.20+ 標準位置；舊版設定 `use_resource_pack: true` 者）。
- 略過並回報原因：
  - `book.json`（`data/<ns>/patchouli_books/<book>/book.json` 或 `assets/…/book.json`）設定 `"i18n": true`：文字為語言 key，已由語言檔涵蓋。
  - 內容位於 `data/` 的手冊：資源包無法覆蓋，需資料包，不在本次範圍。
- 擷取欄位：分類與條目檔的頂層 `name`、`description`；`pages` 陣列中每頁的 `title`、`text`、`link_text`。只擷取字串值；`templates/` 目錄不擷取。

## Key 格式

`<book>/<en_us 下的相對路徑>#<JSON 路徑>`，JSON 路徑以 `/` 連接，陣列以索引表示。例：

- `guide/categories/basics.json#name`
- `guide/entries/basics/intro.json#pages/0/text`

同一 jar 有多個命名空間時，手冊歸屬於與 modId 相同的命名空間；其他命名空間的手冊不收錄。

## 資料格式（`data/mods/<modId>/`）

- `patchouli/<book>/en_us/**.json`：原樣保存的英文手冊檔（分類、條目）。
- `patchouli_zh_tw.json`：攤平後的譯文（key→文字），選填。
- 無手冊的模組兩者皆不存在，行為與現在完全相同。

## 核心（`packages/core/src/patchouli/`）

| 模組 | 職責 |
|---|---|
| `findBooks` | 由 jar 路徑清單與 `book.json` 內容找出支援的手冊，回傳原樣檔與略過原因 |
| `flatten` | 原樣檔集合 → `{ source: Record<key, text>, order: key[] }` |
| `rebuild` | 原樣檔集合＋譯文 → 譯好的檔案集合（未翻譯保留英文，非文字欄位原樣保留） |
| `formatCodes` | 擷取 Patchouli 格式碼 `$(…)`，與現有 `checkFormat` 合併為手冊專用檢查 |

型別：

- `GuideFiles = Readonly<Record<string, string>>`：路徑（相對 `patchouli/`，例 `guide/en_us/entries/a.json`）→ 原始 JSON 文字。
- `DetectedMod.guide?: { files: GuideFiles; skipped: { book: string; reason: string }[] }`
- `ModProject.guide?: { files: GuideFiles; entries: TranslationEntry[] }`：手冊條目與語言檔條目分開，`updateEntry` 以 `section: 'lang' | 'guide'` 區分。

要求：`rebuild(files, flatten(files).source)` 產生的 JSON 與原檔語意相同（攤平後重建可還原）。

## 資料載入與驗證

- `loadAllMods` 讀取 `patchouli/**` 與 `patchouli_zh_tw.json`；`LoadedMod.guide?: { files, en, zh }`。
- 驗證（`validate:data`）：
  - 原樣檔不是合法 JSON → error。
  - 譯文 key 不存在於攤平的原文 → error。
  - 格式碼（含 `$(…)`）不一致 → warning。
  - 術語表套用於手冊文字 → warning。

## 網站

- 模組頁：語言檔進度下方多一條「手冊」進度（已翻譯／總數）。
- 目錄卡片與 `ModSummary`：新增 `hasGuide: boolean`，卡片顯示「含手冊」。
- `/api/v1/mods/<id>.json`：新增選填 `guide: { files, zh_tw }`；`version` 維持 1。
- 下載資源包：額外寫入 `assets/<modId>/patchouli_books/<book>/zh_tw/**`。

## 翻譯工具

- 上傳 jar 時解析手冊並建立手冊條目；合併（同模組重新上傳）時手冊條目套用與語言檔相同的合併規則。
- 篩選列新增「語言檔／手冊」切換；條目列的格式碼警告對手冊使用合併檢查。
- 匯出：資源包含手冊；語言檔匯出（`lang-files`）不含手冊；貢獻檔多出 `patchouli/**` 與 `patchouli_zh_tw.json`。
- IndexedDB 中既有的專案沒有 `guide` 欄位，視為無手冊。

## 測試

- core：`findBooks`（支援、i18n 略過、data/ 略過、非 modId 命名空間）、`flatten`（欄位白名單、key 格式、順序）、`rebuild`（填入譯文、未翻譯保留、非文字欄位不變、攤平→重建還原）、格式碼、驗證、`loadAllMods`。core 覆蓋率維持 ≥ 80%。
- site：手冊進度與「含手冊」標示、API payload、下載包含手冊路徑、翻譯工具切換與匯出。
- E2E：上傳含手冊的 jar，翻譯一段手冊文字後匯出資源包，包內含 `zh_tw` 手冊檔且文字已替換。

## 不在範圍

- `data/` 內的舊式手冊、自訂模板文字。
- `add:version` 與每週自動追蹤更新手冊。
- Phase 3 建議回報套用於手冊。
