# ModLangForge 設計規格

- 日期：2026-10-15
- 狀態：已取代（見 2026-10-15-translation-site-phase1-design.md）

## 1. 目的

ModLangForge 是一個純前端網頁工具，讓使用者把 Minecraft 模組（`.jar`）拖入瀏覽器，自動偵測模組內的語言檔，以**手動**方式翻譯成繁體中文（`zh_tw`），並匯出為資源包或單一語言檔。

### 1.1 使用者明確需求

- 介面語言：繁體中文。
- 形式：網頁應用（免安裝）。
- 直接讀取 `.jar` 偵測語言檔。
- 手動翻譯（不含機器翻譯）。
- 同時載入、編輯、匯出**多個模組**。
- 輸出：資源包 `.zip`、單一 `zh_tw.json` / `zh_TW.lang`。
- MVP 輔助功能：自動儲存進度、搜尋／篩選、格式碼檢查、`zh_cn` 參考欄。

### 1.2 假設

- 純前端，無後端；檔案不離開使用者電腦。
- 單人使用，無帳號、無協作。
- 目標瀏覽器：最新版 Chrome / Edge / Firefox。

### 1.3 非目標（MVP 不做）

- 機器翻譯、詞彙表／術語庫、翻譯記憶。
- 直接改寫並回存 `.jar`。
- 專案進度檔匯出／匯入（IndexedDB 已處理同電腦續作）。
- 簡中自動轉繁中。

### 1.4 成功標準

1. 拖入 1–50 個 jar，3 秒內（一般大小模組）列出所有含語言檔的模組。
2. 可編輯任一模組的每個 key，重新整理頁面後譯文仍在。
3. 匯出的資源包放入 `resourcepacks/` 後，遊戲內正確顯示繁中。
4. 格式碼不一致的譯文在表格中被標示，匯出前提示數量。

## 2. 技術棧

| 項目 | 選擇 |
|---|---|
| 框架 | React 18 + TypeScript（strict） |
| 建置 | Vite |
| 狀態 | Zustand（不可變更新） |
| ZIP | JSZip |
| TOML | smol-toml |
| 儲存 | IndexedDB（`idb`） |
| 樣式 | Tailwind CSS |
| 表格虛擬捲動 | `@tanstack/react-virtual` |
| 測試 | Vitest + Testing Library；Playwright（E2E） |
| 部署 | GitHub Pages（GitHub Actions） |

## 3. 架構

```
src/
├── core/                 純函式，不依賴 DOM / React
│   ├── jar/
│   │   ├── readJar.ts         解壓 jar，回傳 DetectedMod[]
│   │   ├── findLangFiles.ts   搜尋 assets/<ns>/lang/*
│   │   └── metadata.ts        解析 fabric/quilt/forge/neoforge/mcmod.info
│   ├── lang/
│   │   ├── parseJson.ts       JSON 語言檔 → 有序 entries
│   │   ├── parseLang.ts       .lang (key=value) → 有序 entries
│   │   └── serialize.ts       entries → JSON / .lang 文字
│   ├── validate/
│   │   └── formatCodes.ts     佔位符與顏色碼比對
│   ├── merge/
│   │   └── mergeMod.ts        同 modId 重新載入時的合併邏輯
│   └── export/
│       ├── packFormats.ts     MC 版本 → pack_format 對照表
│       ├── buildResourcePack.ts
│       └── buildLangFiles.ts
├── store/
│   ├── workspaceStore.ts      Zustand store
│   └── persistence.ts         IndexedDB 讀寫（debounce 500ms）
├── ui/
│   ├── DropZone.tsx
│   ├── ModList.tsx            左側模組清單 + 進度
│   ├── TranslationTable.tsx   虛擬捲動表格
│   ├── FilterBar.tsx
│   ├── ExportDialog.tsx
│   └── Toast.tsx
├── i18n/
│   └── zh-TW.ts               所有介面字串
├── types.ts
└── main.tsx
```

邊界原則：`core/` 只接受 / 回傳資料（`Uint8Array`、字串、物件），由 `store/` 呼叫；`ui/` 只透過 store 操作資料。

## 4. 資料模型

```ts
type LangFormat = 'json' | 'lang';

interface TranslationEntry {
  readonly key: string;
  readonly source: string;        // en_us 原文
  readonly target: string;        // 譯文，空字串 = 未翻譯
  readonly reference?: string;    // zh_cn 參考
  readonly status: 'untranslated' | 'translated' | 'new' | 'obsolete';
}

interface ModProject {
  readonly id: string;            // `${modId}`（工作區內唯一）
  readonly modId: string;         // 語言檔命名空間
  readonly name: string;          // 顯示名稱（metadata 取得，否則 = modId）
  readonly version: string;       // 無則 'unknown'
  readonly jarName: string;
  readonly format: LangFormat;
  readonly entries: readonly TranslationEntry[];  // 保留原檔 key 順序
  readonly updatedAt: number;
}

interface Workspace {
  readonly mods: readonly ModProject[];
  readonly activeModId: string | null;
}
```

## 5. Jar 偵測規則

1. 以 JSZip 開啟；失敗 → 錯誤「不是有效的 jar / zip 檔」。
2. 掃描路徑 `assets/<namespace>/lang/<locale>.(json|lang)`，locale 比對不分大小寫。
3. 每個 namespace 若有 `en_us` 則成為一個 `ModProject`；無 `en_us` 者略過。
4. 同時讀取同目錄 `zh_tw`（既有譯文 → `target`）與 `zh_cn`（→ `reference`）。
5. 格式：有 `.json` 優先，否則 `.lang`。
6. Metadata 依序嘗試：`fabric.mod.json`、`quilt.mod.json`、`META-INF/neoforge.mods.toml`、`META-INF/mods.toml`、`mcmod.info`；以 namespace 對應 modId 取得名稱與版本，找不到則用 namespace。
7. 巢狀 jar（`META-INF/jars/*.jar`）MVP 不處理。

## 6. 語言檔解析

- **JSON**：保留 key 順序；值非字串者略過並記錄警告；允許 UTF-8 BOM。
- **.lang**：逐行解析 `key=value`；`#` 開頭為註解略過；只以第一個 `=` 分割；空行略過。
- 序列化 JSON：2 空格縮排、UTF-8、不跳脫非 ASCII。
- 序列化 .lang：`key=value`，換行 `\n`。

## 7. 格式碼檢查

從原文與譯文各抽出以下 token，比較**多重集合**是否相同（順序不限，因中文語序可能不同）：

- printf 佔位符：`%s`、`%d`、`%f`、`%.2f`、`%1$s`、`%%`
- MessageFormat：`{0}`、`{1}`
- 顏色／樣式碼：`§0`–`§9`、`§a`–`§f`、`§k`–`§o`、`§r`
- 換行：`\n`

譯文為空時不檢查。不一致 → 該列顯示警告圖示與差異說明（例：「缺少 %s」「多出 §a」）。

## 8. 多模組行為

- 工作區可持續追加 jar。
- 模組清單顯示：名稱、modId、版本、進度 `已翻譯/總數 · 百分比`、警告數。
- 同 modId 再次載入時詢問：
  - **合併**：保留既有譯文；原文變更的 key 清空譯文並標 `new`；新增 key 標 `new`；新 jar 已無的 key 標 `obsolete`（匯出時排除）。
  - **取代**：捨棄舊資料。
- 可從工作區移除模組（需確認）。

## 9. 編輯與篩選

- 表格欄位：Key、原文（en_us）、參考（zh_cn，可隱藏）、譯文（可編輯 textarea）、狀態。
- 篩選：全部／未翻譯／已翻譯／有警告／新增。
- 搜尋：比對 key、原文、譯文；範圍可選「目前模組」或「全部模組」（全部時結果顯示所屬模組）。
- 快捷鍵：`Enter` 存並跳下一列、`Shift+Enter` 換行、`Ctrl+↑/↓` 上下列。
- 「複製原文」按鈕：將原文填入譯文（方便專有名詞不翻）。

## 10. 自動儲存

- 每次編輯後 debounce 500ms 寫入 IndexedDB，每個 `ModProject` 一筆（key = `id`）。
- 啟動時載入整個工作區。
- IndexedDB 不可用 → 改用記憶體並顯示常駐提示「進度不會被保存」。
- 「清空工作區」需二次確認。

## 11. 匯出

匯出對話框：勾選模組（預設全選）、選擇類型、選擇未翻譯處理方式。

| 類型 | 輸出 |
|---|---|
| 合併資源包（預設） | `ModLangForge-zh_tw.zip`，含 `pack.mcmeta`、`pack.png`（選用）、所有勾選模組的語言檔 |
| 個別資源包 | 每模組一個 zip，外層再包成一個 zip 下載 |
| 單一語言檔 | 單選：直接下載；多選：zip 內為 `<modId>/zh_tw.json` |

- 檔名：JSON → `zh_tw.json`；.lang → `zh_TW.lang`（1.12 以前大寫區碼）。
- 未翻譯處理：「保留英文原文」（預設）或「略過未翻譯 key」。
- `pack.mcmeta`：使用者從下拉選單選 MC 版本，對照 `packFormats.ts` 填入 `pack_format`；描述預設「ModLangForge 繁體中文翻譯」。對照表為設定檔，新版本只需改此檔。
- 有格式碼警告時，匯出前顯示數量並允許繼續。

## 12. 錯誤處理

所有錯誤以繁中 Toast 顯示，單一 jar 失敗不影響其他 jar。

| 情境 | 訊息 |
|---|---|
| 非 zip | 「{檔名} 不是有效的 jar 檔」 |
| 無語言檔 | 「{檔名} 中找不到 en_us 語言檔」 |
| JSON 錯誤 | 「{檔名} 的 {路徑} 解析失敗：{原因}」 |
| 檔案過大（>200MB） | 「{檔名} 過大，已略過」 |
| IndexedDB 失敗 | 常駐提示 |

開發模式下 `console.error` 輸出完整錯誤物件。

## 13. 安全

- 不上傳任何檔案，無網路請求（除靜態資源）。
- 不使用 `dangerouslySetInnerHTML`；所有原文／譯文以文字節點顯示。
- 限制單檔大小與 zip 內檔案總解壓大小（防 zip bomb，上限 500MB）。

## 14. 測試

- **單元（Vitest）**：`core/` 全部模組，覆蓋率 ≥ 80%。Fixture：程式產生的小型 jar（JSON 型、.lang 型、多 namespace、含 zh_tw/zh_cn、損毀檔）。
- **元件（Testing Library）**：TranslationTable 編輯、FilterBar、ExportDialog。
- **E2E（Playwright）**：拖入兩個 jar → 翻譯數筆 → 重新整理仍保留 → 匯出合併資源包 → 驗證 zip 內容。

## 15. 部署

GitHub Actions：push 到 `main` → lint、測試、建置 → 部署 GitHub Pages（Vite `base` 設為 repo 名稱）。
