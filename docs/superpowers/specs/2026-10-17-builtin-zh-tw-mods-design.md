# 內建繁中模組的顯示設計

日期：2026-10-17

## 為什麼要做

PR #39 之後，本站不再收錄模組 jar 內建繁中已翻譯的條目。內建繁中已涵蓋全部條目的 17 個模組（litematica、tacz、terralith 等）因此從目錄移除。

結果是玩家在網站上找不到這些模組。在整合包頁，它們被歸到「尚未收錄」，說明文字寫著「這些模組還沒有繁中翻譯」，這是錯的。玩家可能因此去找別的漢化，或以為這個模組沒有中文。

這項功能的目標：玩家在模組列表、搜尋、模組頁、整合包頁看到這類模組時，都能清楚知道「這個模組已內建繁體中文，不用另外裝資源包」。

## 目標

1. 內建完整繁中的模組出現在「模組」列表，可以被搜尋到，有自己的模組頁。
2. 部分內建的模組（本站只補缺少的條目，例如 emi、jei），在列表上也看得出它有內建繁中。
3. 整合包頁把內建完整的模組算作「已收錄」，不再列在「尚未收錄」。
4. 以後用 `fetch:modrinth` 批次抓熱門模組時，內建繁中已完整的模組自動建成「內建繁中」條目，不用人工處理。

## 不做的事

- 不複製作者的內建譯文到 repo（授權規則見 `builtin-zh-tw-license-policy`：只有 CC 授權才能複製）。
- 不檢查內建繁中翻得好不好，也不接受對內建譯文的翻譯建議。
- 合併資源包頁（`/pack/`）不改：它只能從模組頁加入模組，而內建完整的模組頁沒有「加入」按鈕。
- 不調整網站整體風格（`site-redesign-attempts`：整站改版都被否決，只接受小範圍修正）。

## 失敗的情況（即使功能技術上能運作）

- 內建完整的模組出現「下載資源包」、「加入合併資源包」、翻譯條目表、建議翻譯等功能。玩家會以為本站有翻譯，下載後得到空的資源包。
- 內建完整的模組顯示「機器翻譯」「0%」之類的翻譯狀態或進度，讓人以為它沒有中文。
- 自動追蹤版本（`track-versions`）、翻譯工具、建議翻譯的 Worker 因為遇到沒有條目的模組而出錯或產生錯誤資料。
- 整合包資源包下載因為包含內建完整的模組而失敗或多出空檔案。

## 使用者決定的部分

- 內建完整的模組要出現在「模組」列表裡（不是只在整合包頁標示）。
- 整合包頁採用做法 B：內建完整的模組併入「已收錄」那組，進度欄改顯示「內建繁中」標籤；不另外分組。
- `fetch:modrinth` 遇到內建繁中已完整的模組，要自動建成「內建繁中」條目。
- 授權規則維持：不複製非 CC 授權的作者譯文。

## 畫面（使用者已看過草圖）

### 模組列表（卡片與條列）

- **內建完整的模組**：橫幅右上角的進度標籤改成「內建繁中」（info 色系），不顯示翻譯狀態徽章（機器翻譯／部分校對／已校對）。其他資訊（下載量、Minecraft 版本、載入器）照常顯示。
- **部分內建的模組**：進度標籤與狀態徽章照舊（代表本站補的那部分），資訊列多一項「內建繁中 X%」。
- 條列模式（`ModRow`）比照卡片處理。
- 篩選與排序：內建完整的模組在「翻譯狀態」篩選中應該有自己的選項或被正確排除，不能被歸到 machine／partial／reviewed 任一類。具體做法交給實作者，但不能讓它們混進「機器翻譯」篩選結果。

### 內建完整模組的模組頁（`/mods/<modId>/`）

- 保留：橫幅、圖示、名稱、簡介、作者、外部連結（Modrinth、CurseForge、原始碼）、支援的 Minecraft 版本與載入器。
- 說明框（沿用現有 `builtinNote` 的 info 樣式），文字大意：「這個模組本身已經有完整的繁體中文，在遊戲裡把語言切到『繁體中文（台灣）』就能看到，不需要下載本站的資源包。」
- 主要按鈕：到 Modrinth 下載模組（外部連結）。
- 不顯示：下載資源包、加入合併資源包、翻譯條目、進度、手冊、建議翻譯、貢獻者等區塊。
- 文案用玩家用語（`site-copy-player-friendly`），名稱只顯示英文（`no-invented-names`）。

### 整合包頁（`/modpacks/<id>/`）

- 「已收錄（N 個）」的 N 包含內建完整的模組。
- 清單中這些模組連到它的模組頁，右側不顯示百分比，改顯示「內建繁中」標籤。
- 整合包目錄卡片上的「已收錄模組 N／M」同樣計入。
- 「下載整合包資源包」時略過這些模組（沒有可打包的內容），不能因此失敗或產生空的 `assets/<modId>/lang/zh_tw.json`。

## 資料怎麼存

**我的判斷（使用者可推翻）：** 另外建一個資料夾 `data/builtin-mods/<modId>.json`，每個模組一個檔案，不放進 `data/mods/`。

原因：`data/mods/` 的每個消費者（`loadData` 必須讀 `en_us.json`、站內翻譯條目頁、翻譯工具、建議翻譯 Worker、`track-versions`、`mine-glossary`、CurseForge 連結回填）都假設模組有條目。把沒有條目的模組放進去，每個消費者都要加判斷，漏一個就會出錯。分開存放，只有需要顯示它們的地方（模組列表、模組頁、整合包比對、搜尋 API、圖示／橫幅／下載量腳本）才讀取。

檔案內容（schema 建議，欄位名稱與 `catalogModSchema` 對齊）：

- `modId`、`name`、`aliases`、`summary`、`authors`、`links`（至少要有 `modrinth`）
- `mcVersions`、`loaders`
- `builtinPercent`：內建繁中涵蓋率（目前 17 個都是 100，或依 jar 實際計算）
- `checkedVersion`：檢查時用的模組版本（`modVersion`、`mcVersion`、`loader`），方便日後重新檢查
- `updatedAt`
- 不含 `translation`、`sourceVersions`、`format`

驗證：`validate:data` 要檢查 `data/builtin-mods/` 的 schema，並確認同一個 modId 不會同時出現在 `data/mods/` 和 `data/builtin-mods/`。

## 現有 17 個模組的回填

從 git 紀錄（PR #39 合併前的 `data/mods/<modId>/mod.json`，例如 commit `45c9f46`）還原名稱、別名、簡介、作者、連結、版本、載入器，轉成新格式寫入 `data/builtin-mods/`。

- 舊資料的 `nameZh` 不保留（名稱只顯示英文，見 `no-invented-names`），改放進 `aliases`（已存在則不重複）。
- `mcVersions`、`loaders`、`links` 原樣沿用。
- **我的判斷：** `builtinPercent` 與 `checkedVersion` 由回填腳本下載舊資料第一個 `sourceVersions` 對應的 jar 重新計算（與 `uncoveredKeys` 同一算法），不直接填 100。

17 個模組：appleskin、cloth-config2、fastquit、freecam、lambdynlights、litematica、lootr、malilib、modernui、naturescompass、nochatreports、presencefootsteps、rrls、tacz、terralith、yet_another_config_lib_v3、zoomify。

圖示、橫幅、下載量：`fetch-mod-icons`、`fetch-mod-banners`、`fetch-mod-stats`（及 `scripts/lib/modrinthLinks.ts`）要一併涵蓋 `data/builtin-mods/`。

## `fetch:modrinth` 自動建立

**使用者決定：只要還缺任何一條，本站就要補翻。** 玩家下載資源包後要看到完整中文，不能留英文。

`selectForTranslation` 改為：

- 內建 zh_tw 涵蓋 jar 內 en_us 的**全部** key（沒有任何未涵蓋的 key）→ 寫入 `data/builtin-mods/<modId>.json`，終端輸出標示為新增內建繁中條目。
- 有內建 zh_tw、但還缺 key → 照一般模組收錄未涵蓋的 key（現有做法，帶 `builtinPercent`），**不論缺幾條**。也就是說，有內建繁中的模組不再套用 `MIN_KEYS`（20 條）的下限，`BUILTIN_COMPLETE_PERCENT`（90%）的略過規則也取消。
- 沒有內建 zh_tw 的模組維持現有規則（`MIN_KEYS`、`MAX_KEYS`）。
- `MAX_KEYS`（1500 條）上限照舊，以未涵蓋的 key 數計算。

現有資料中的 emi（99%）、farmersdelight（99%）這類已收錄模組維持原狀，不搬移。

已經在 `data/mods/` 或 `data/builtin-mods/` 的模組要略過，避免重複。

## 整合包比對

整合包以 `platform` + `slug` 對照模組（`resolveModpackMods` 用目錄的 `links.modrinth`／`links.curseforge` 建 slug 索引，不是用 modId）。內建繁中條目要一起放進這個索引，所以 `links` 至少要有 `modrinth`，有 CurseForge 連結也要保留。

## 數字與統計（我的判斷）

- 模組列表、首頁的「共 N 個模組」包含內建繁中條目。
- 翻譯條數、平均進度等翻譯統計不計入（它們沒有本站翻譯）。
- `ModSummary` 加上可辨識內建條目的欄位，並帶 `builtinPercent`（部分內建的模組也帶，用來顯示「內建繁中 X%」）。`/api/v1/index.json` 新增的是選用欄位，不升 API 版本。
- sitemap 包含內建繁中條目的模組頁；`/contributors/`、`/translate/` 不列。

## 不受影響、但要確認不會出錯的地方

- `track-versions`：只處理 `data/mods/`，不追蹤內建繁中條目（模組更新後內建可能變得不完整，這次不處理，見下方「之後再說」）。
- 翻譯工具（`/translate/`）、建議翻譯 Worker、貢獻者頁：不認得內建繁中條目，也不應該出現。
- `/api/v1/index.json`：若網站的模組列表或搜尋依賴這個 API，就要包含內建繁中條目並帶上可辨識的欄位；`/api/v1/mods/<modId>.json` 是否為內建條目產生檔案，由實作者依前端需求決定。

## 之後再說（這次不做）

- 內建繁中條目的定期重新檢查（模組改版後內建可能不再完整，應轉回一般條目）。
- 內建 zh_cn 但沒有 zh_tw 的模組。

## 留給實作者決定

- 元件怎麼拆（例如 `ModSummary` 加 `kind` 欄位、或另一種型別）、篩選 UI 的具體呈現。
- i18n 文字的確切措辭（需符合玩家用語）。
- 測試切法；e2e 至少涵蓋：列表能搜到 litematica、其模組頁沒有下載資源包按鈕、整合包頁把它算進已收錄。
