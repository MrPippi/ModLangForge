# 新資源包格式（Minecraft 1.21.9 以上與 26.x）設計

## 問題

網站的版本表 `PACK_FORMATS` 最高只到 1.21.8，`pack.mcmeta` 也只寫 `pack_format`。1.21.9 起資源包格式改為主、次版本號，且必須寫 `min_format`／`max_format`，所以：

- 玩家無法下載 1.21.9 以上可用的資源包；
- 1.21.9 以上的整合包（例如 Vanilla Perfected 26.3）無法收錄（`add:modpack` 以「不支援的 Minecraft 版本」結束）；
- 每週追蹤看不到這些版本。

## 背景（資源包格式）

| Minecraft | 資源包格式 |
|---|---|
| 1.21.9、1.21.10 | 69.0 |
| 1.21.11 | 75.0 |
| 26.1、26.1.1、26.1.2 | 84.0 |
| 26.2 | 88.0 |
| 26.3 | 97.1 |

- 1.21.9 起 `pack.min_format` 與 `pack.max_format` 為必填（整數或 `[主, 次]`）；`pack_format` 選填；`supported_formats` 已移除。目標格式低於 65 的資源包仍使用 `pack_format`。
- 語言檔位置與格式不變（`assets/<ns>/lang/<locale>.json`）。

## 決策

1. 版本表加入 1.21.9 以上**每個正式版**：1.21.9、1.21.10、1.21.11、26.1、26.1.1、26.1.2、26.2、26.3（不補 1.21.6、1.21.7 等 1.21.9 以前的缺漏版本）。
2. 版本表改記主、次版本號：`{ mcVersion, packFormat, packFormatMinor }`（舊版本 `packFormatMinor` 為 0）；表格維持新到舊排序，26.x 在 1.21.x 之前。
3. `pack.mcmeta`：
   - 資源包格式 < 65（1.21.8 以下）：維持 `{"pack":{"pack_format":N,"description":…}}`。
   - 資源包格式 ≥ 65（1.21.9 以上）：`{"pack":{"description":…,"min_format":[主,次],"max_format":[主,次]}}`，兩者都等於目標版本；不寫 `pack_format`。每個資源包只對應一個版本，不做跨版本相容。
4. `packFormatFor` 遇到表上沒有的版本改為丟出錯誤（目前會默默套用 1.20.1 的格式）。
5. 不調整 `fetch:modrinth` 的偏好版本（仍以 1.21.1、1.20.1 為主）；新版本由每週追蹤逐步補上，沿用每次最多寫入 100 個的限制。

## 影響範圍

- 依賴版本表自動生效：`knownMcVersion`（模組與整合包驗證）、`addSourceVersion` 的 `mcVersions` 排序、`add:version` 參數檢查、`trackPlan` 的追蹤版本、網站版本選單與排序（`pickVersion.ts`）、整合包下載（`source.mcVersion`）、翻譯工具匯出的版本選單。
- 需要調整：`packFormats.ts`（資料結構與查詢函式）、`buildResourcePack.ts` 的 `pack.mcmeta` 產生方式，以及所有直接讀 `packFormat` 數字的地方（例如 `JSON_LANG_MIN_PACK_FORMAT`、`loaderPreference` 的 `packFormat > 15` 判斷）——比較改用主版本號即可。
- 網站文字：版本選單只顯示 Minecraft 版本字串，不需新文字。

## 測試

- core：新舊兩種 `pack.mcmeta`（1.20.1、1.21.8、1.21.10、26.3）的內容；版本表排序（新到舊）；未知版本丟出錯誤；`knownMcVersion` 接受 26.3；追蹤版本清單包含新版本。
- site：版本選單排序把 26.x 放在 1.21.x 前面；整合包下載 26.x 時 `pack.mcmeta` 使用 `min_format`／`max_format`。
- E2E：以範例資料下載 26.3（或 1.21.10）資源包並檢查 `pack.mcmeta`。
- 遊戲內實測（人工）：26.3 載入產生的資源包。

## 不在範圍

- 1.21.9 以前缺漏的版本（1.21.6、1.21.7、1.21.2、1.21.3 等）。
- 跨版本相容的資源包（一份檔案同時支援多個格式）。
- 主動為已收錄模組抓新版本原文（交給每週追蹤）。
