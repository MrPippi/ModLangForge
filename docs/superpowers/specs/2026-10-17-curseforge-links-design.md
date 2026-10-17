# 回填模組 CurseForge 連結設計

## 問題

整合包頁以 slug 對照模組（4b）：CurseForge 整合包只會對上 `mod.json` 有 `links.curseforge` 的模組。目前 98 個模組只有 create、jei 有 CurseForge 連結（`fetch:modrinth` 只寫 Modrinth 連結），所以 CurseForge 整合包頁面幾乎所有模組都顯示「尚未收錄」，一鍵下載也不包含它們。

## 決策

1. 新增維護者腳本 `npm run backfill:curseforge`，為缺少 `links.curseforge` 的模組查詢 CurseForge 並寫入連結。
2. `fetch:modrinth` 新增模組時，若有 CurseForge 金鑰，同時查詢並寫入 CurseForge 連結；沒有金鑰則照舊只寫 Modrinth 連結（不報錯）。
3. 只在**確定是同一個模組**時寫入，寧可漏掉也不誤配；無法確定的列在輸出中供人工處理。

## 比對規則

對每個缺少 `links.curseforge` 的模組（以 Modrinth slug 與模組名稱為依據）：

1. 以 slug 查詢：`GET /v1/mods/search?gameId=432&classId=6&slug=<modrinth slug>`。結果中 slug 完全相同（不分大小寫）且名稱正規化後相同 → 採用。
2. 否則以名稱查詢：`GET /v1/mods/search?gameId=432&classId=6&searchFilter=<名稱>&pageSize=20`。名稱正規化後完全相同的結果恰好一個 → 採用。
3. 其餘情況（沒有結果、多個候選、只有 slug 相同但名稱不同）→ 不寫入，列為「需要人工確認」並附上候選。

- 名稱正規化：轉小寫、去除括號內文字（例如「(REI)」、「(Zoom)」）、移除非字母數字字元。
- 寫入格式：`https://www.curseforge.com/minecraft/mc-mods/<CurseForge slug>`，與 4b 的對照規則（`resolve.ts`）一致。
- 已有 `links.curseforge` 的模組不查詢、不覆寫。

## 腳本行為

- 參數：`--dry-run`（只列出結果，不寫檔）、`--mod <modId>`（只處理一個模組）。
- 金鑰：讀取環境變數 `CURSEFORGE_API_KEY`，專案根目錄有 `.env` 時先載入；未設定時印出設定方式並以非 0 結束。金鑰只送往 `api.curseforge.com`（沿用 4b 的 `redirect: 'error'`），不寫入檔案、不印出，錯誤訊息遮蔽金鑰。
- 寫入：只改 `mod.json` 的 `links`（加入 `curseforge`），其餘欄位與格式不變；所有回應以 zod 驗證。
- 輸出（台灣繁中）：已寫入、需要人工確認（附候選名稱與網址）、查詢失敗，以及各類數量。
- 查詢依序進行，每個請求之間不重試；單一模組失敗不影響其他模組。

## 測試

- core：名稱正規化；比對規則（slug 命中、名稱唯一命中、多候選、名稱不符、無結果）；網址格式。
- 腳本：以注入的假 fetch 測試寫入、dry-run 不寫檔、已有連結略過、無金鑰、金鑰只出現在 API 請求、錯誤訊息遮蔽金鑰。
- `fetch:modrinth`：有金鑰時寫入 CurseForge 連結、沒有金鑰時照舊。
- 實際執行：維護者以真實金鑰執行一次，將結果以資料 PR 提交（不在測試中使用真實金鑰）。

## 不在範圍

- 從 CurseForge 匯入新模組（模組收錄仍走 `fetch:modrinth`／投稿）。
- 跨平台 slug 自動對照（整合包對照規則不變）。
- 每週自動回填（之後可接上追蹤 workflow）。
