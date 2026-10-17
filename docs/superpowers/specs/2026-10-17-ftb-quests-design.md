# FTB Quests 任務翻譯設計（子專案 4c）

## 問題

許多整合包用 FTB Quests 做任務書，任務標題與說明是玩家最常讀的文字之一。4b 已讓整合包進入網站（模組翻譯＋KubeJS），但任務文字仍無處翻譯，也無法隨下載取得。

這是「更多語言檔格式」的最後一部分（4a Patchouli、4b 整合包＋KubeJS 已完成）。

## 背景（FTB Quests 的文字存放方式）

- MC 1.21 以上（FTB Quests 2100 起）：文字存於整合包的 `config/ftbquests/quests/lang/<locale>.snbt`，較新版本可拆成 `lang/<locale>/**.snbt`（模組會遞迴讀取資料夾內所有 `.snbt` 並合併）。key 為 `<類型>.<16 位十六進位 ID>.<欄位>`，例如 `quest.44A5523F7A909209.title`；`quest_desc`、`chapter_subtitle` 是字串清單（一行一個元素）。玩家語言自動選用，缺少的 key 逐條退回 `en_us`（或任務書設定的 `fallback_locale`）。
- 舊整合包若只附 `chapters/*.snbt`（文字寫在章節檔內），模組在遊戲載入時才自動轉成 lang 檔。
- 任務翻譯**不能**放在資源包；必須放在 `config/ftbquests/quests/`。
- MC 1.20.1（FTB Quests 2001）文字直接寫在章節檔內，無語言切換機制。

## 決策

1. **只支援 MC 1.21 以上**的整合包。1.20.1 的整合包不處理任務文字，網站註明「此版本的任務暫不支援翻譯」。
2. **data 存 JSON**（key→文字），SNBT 只在腳本讀取與瀏覽器產生下載檔時使用；沿用 KubeJS 的驗證、術語表、格式碼檢查、翻譯工具與投稿流程。
3. **下載拆成兩個按鈕、各自是可直接使用的檔案**：「下載資源包」下載的 zip 本身就是資源包；「下載 FTB 任務翻譯」下載單一 `.snbt` 檔，放到整合包的 `config/`。沒有外層壓縮檔，也沒有安裝說明檔。
4. 只翻譯章節、章節群組、任務書標題與任務的標題／副標／說明；獎勵表與任務項目／獎勵的自訂標題不在本次範圍。

## 資料格式（`data/modpacks/<id>/`）

### `ftbquests/en_us.json`、`ftbquests/zh_tw.json`

- `en_us.json`：英文原文（key→文字），由 `add:modpack` 產生，不手動修改。
- `zh_tw.json`：譯文，選填；每個 key 都必須存在於 `en_us.json`。
- key 規則：`^(quest|chapter|chapter_group|file)\.[0-9A-F]{16}\.(title|quest_subtitle|quest_desc|chapter_subtitle)$`。
- 清單欄位（`quest_desc`、`chapter_subtitle`）以 `\n` 合併成一條文字；輸出時再依 `\n` 拆回清單。中文行數可與英文不同。空字串、空清單不收錄。

### `modpack.json` 新增欄位 `ftbquests`（選填）

```json
"ftbquests": { "status": "supported", "layout": "single" }
```

- `status`：`supported`（MC ≥ 1.21 且有任務文字）或 `unsupported-version`（MC < 1.21 但整合包含 FTB Quests 任務檔）。
- `layout`：`single`（`lang/<locale>.snbt`）或 `split`（`lang/<locale>/` 資料夾）；只在 `supported` 時存在。整合包只有章節檔（未附 lang）時記為 `single`。
- 整合包沒有任務檔時不寫此欄位。

## 腳本（`add:modpack` 擴充）

- 讀取整合包壓縮檔的 `overrides/config/ftbquests/quests/`：
  1. 有 `lang/en_us.snbt` → 讀取，`layout: single`。
  2. 有 `lang/en_us/**.snbt` → 全部讀取合併，`layout: split`。
  3. 都沒有但有 `chapters/*.snbt` → 依 FTB 自動轉換的規則抽出文字（章節 `title`／`subtitle`、任務 `title`／`subtitle`／`description`、`chapter_groups.snbt` 的群組 `title`、`data.snbt` 的任務書 `title`），`layout: single`。抽取規則須在實作時對照 FTB Quests 原始碼確認。
- MC < 1.21：略過任務文字，有任務檔時寫入 `status: unsupported-version` 並印出提示。
- SNBT 讀取器：支援 FTB 的寫法（換行分隔、逗號可省略、未加引號的 key、雙引號字串與跳脫、`1L`／`1b`／`1.0d` 數字字尾、`[I; …]` 型別陣列、註解）。解析失敗以清楚訊息結束，不寫入任何檔案。讀取時套用解壓大小上限（沿用 4b）。
- 新增：建立 `ftbquests/en_us.json`。更新：規則同 KubeJS（新 key 加入、原文不同列為差異並保留既有原文、格式碼改變則整次拒絕寫入），不動 `zh_tw.json`；同時更新 `modpack.json` 的 `ftbquests`。

## 格式碼（翻譯須保留）

`&` 顏色碼（`&a`、`&#RRGGBB`、`&z`）與 `\&`、`{@pagebreak}`、`{image:…}`、`{某.key}` 引用、以 `{"` 或 `["` 開頭的整行 JSON 文字元件。驗證比對原文與譯文的格式碼，不一致為 warning；換行數量不必相同。`{@pagebreak}` 與整行 JSON 在拆行後須各自獨立成一行，否則為 warning。

## 驗證（`validate:data`）

- `ftbquests/*.json` 頂層不是字串物件 → error；key 不符規則 → error；`zh_tw.json` 的 key 不在 `en_us.json` → error。
- 格式碼不一致 → warning；術語表套用 → 依術語 level。
- `modpack.json` 的 `ftbquests` 不符 schema、`supported` 卻沒有 `en_us.json`、`unsupported-version` 卻有 `ftbquests/` 資料夾 → error。
- 以 `modpacks/<id>/ftbquests/…` 路徑回報 GitHub 註記；有 error 的整合包不出現在網站（沿用 4b）。

## 網站

- 整合包頁：在 KubeJS 進度旁新增「任務翻譯進度」（已翻條目／總條目）；`unsupported-version` 顯示「此版本的任務暫不支援翻譯」；無任務文字不顯示。
- 目錄頁卡片：加上任務進度。
- 下載資源包（`<id>-zh_tw-<mcVersion>.zip`）：zip 本身就是資源包（`pack.mcmeta` 在根目錄）；整合包沒有任何可下載的模組或 KubeJS 內容時不顯示按鈕。
- 下載 FTB 任務翻譯：只在支援任務且至少有一條已翻譯時顯示，下載單一 SNBT 檔，按鈕下方標示放置位置：
  - layout `single` → `zh_tw.snbt`，放到整合包的 `config/ftbquests/quests/lang/`。
  - layout `split` → `modlangforge.snbt`，放到 `config/ftbquests/quests/lang/zh_tw/`。
  - 任務檔只含已翻譯條目（未翻譯由遊戲退回英文）；清單欄位拆回 SNBT 字串清單；在伺服器上玩要放在伺服器的 `config` 資料夾。
- 頁面的安裝說明只有兩行：資源包放進 `resourcepacks` 後到「選項 → 資源包」啟用；任務檔照按鈕下方的提示放。
- SNBT 輸出器：core 純函式，正確跳脫 `"`、`\`、換行；輸出結果可被 SNBT 讀取器讀回相同內容。
- API：`/api/v1/modpacks/<id>.json` 加上 `ftbquests: { status, layout, en_us, zh_tw }`（無則省略）；`index.json` 摘要加上任務進度。

## 翻譯工具

- 「載入網站上的整合包」：整合包有 `supported` 任務文字時，另建一個專案，ID 為 `modpack-quests:<id>`，顯示名稱「<整合包名>（FTB 任務）」；重新載入套用與模組相同的合併規則。
- 編輯：清單欄位在編輯框以多行文字呈現。
- 匯出：
  - 資源包／語言檔：任務專案不放進資源包；每個整合包另外輸出一個任務檔（檔名同上方網站規則，同時匯出多個整合包時加上 `<整合包 ID>-` 前綴），與資源包各自獨立下載，不附外層壓縮檔。對話框會提示任務檔要放的位置。
  - 投稿檔：輸出 `modpacks/<id>/ftbquests/zh_tw.json` 與說明。

## 測試

- core：SNBT 讀取（註解、數字字尾、型別陣列、跳脫、逗號可省略）、章節檔抽取、清單合併與拆回、SNBT 輸出可讀回、格式碼檢查、更新合併規則、驗證、資料載入。core 覆蓋率維持 ≥ 80%。
- 腳本：以注入的假 fetch 測試 lang 單檔、lang 資料夾、只有章節檔、MC 1.20.1 略過、SNBT 解析失敗不寫入。
- site：下載檔（資源包本身就是 zip、任務檔名依 layout、只含已翻譯條目、無任務翻譯時不顯示任務按鈕）、整合包頁與卡片的任務進度、`unsupported-version` 提示、API payload。
- 翻譯工具：載入任務專案、專案 ID 與名稱、匯出路徑、多行編輯。
- E2E：範例整合包加入任務文字，測試整合包頁下載內容與翻譯工具載入／匯出。

## 不在範圍

- MC 1.20.1 的任務文字；Quest Lang Files 等附加模組。
- 獎勵表、任務項目（task）與獎勵（reward）的自訂標題。
- 展開舊式 `{key}` 引用（原樣保留）。
- 每週自動追蹤整合包新版本。
- 直接上傳 FTB Quests 檔案到翻譯工具（只從網站上的整合包載入）。
