# 翻譯來源版本（sourceVersions）設計

## 問題

每個模組只有一組 `en_us.json` / `zh_tw.json`。`mod.json` 的 `modVersion` 只記一個 jar 版本，
`mcVersions` 則是模組在 Modrinth 上支援的所有版本，並不代表翻譯在這些版本驗證過。
使用者無法得知某個 MC 版本／載入器的翻譯涵蓋率，也沒有工具把其他版本新增的 key 補進來。

## 決策

1. **不拆版本目錄**，採「key 聯集」：一份 `en_us.json` 收錄所有來源版本的 key。
   Minecraft 會略過資源包裡多出的 key、缺少的 key 退回英文，所以聯集對各版本都安全。
2. **`mcVersions` 語意不變**（模組支援版本，供下載 pack_format 與篩選使用），網站標籤改為「模組支援版本」。
3. **新增 `sourceVersions`，取代 `modVersion`**：記錄實際抽取過語言檔的版本。

   ```json
   "sourceVersions": [
     { "modVersion": "21.1.0.14", "mcVersion": "1.21.1", "loader": "neoforge", "missingKeys": [] },
     { "modVersion": "19.0.0.94", "mcVersion": "1.20.1", "loader": "forge", "missingKeys": ["block.biomesoplenty.new_thing"] }
   ]
   ```

   - `modVersion` 可省略（投稿者不知道 jar 版本時）。
   - `missingKeys`：`en_us.json` 中、此版本 jar 沒有的 key（或模組內建繁中已涵蓋、本站不收錄的 key）。
   - `(modVersion, mcVersion, loader)` 不可重複。
4. **驗證規則**（`validate:data`）：
   - `missingKeys` 裡的 key 必須存在於 `en_us.json`，且不可重複。
   - `en_us.json` 的每個 key 至少要有一個來源版本包含（否則是孤兒 key）。
5. **同 key 跨版本衝突**：英文原文不同時保留既有原文並列出衝突；
   若格式碼不同（`%s` 數量或順序改變），工具拒絕寫入，需人工決定（拆版本為之後的例外處理，不在本次範圍）。
6. **工具**：
   - `npm run add:version -- --mod <modId> --mc <mcVersion> --loader <loader>`：從 Modrinth 下載對應版本 jar，合併 key 到資料。
   - `npm run migrate:source-versions`：一次性把現有 `modVersion` 轉成 `sourceVersions`（查 Modrinth 判斷 mcVersion／loader）。
   - `fetch:modrinth` 改為直接產生 `sourceVersions`。
7. **網站**：模組頁顯示「翻譯來源版本」清單與各版本涵蓋率；整體進度條維持以聯集計算。

## 不在範圍

- 依版本拆分語言檔或資源包。
- 依 MC 版本產生不同內容的資源包（資源包一律輸出聯集）。
- 自動更改 `translation.status`。
