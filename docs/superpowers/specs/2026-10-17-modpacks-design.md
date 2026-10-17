# 整合包翻譯設計（子專案 4b，含 KubeJS）

## 問題

玩家通常以整合包（模組包）遊玩。網站目前只能逐一下載模組翻譯，玩家要自己找出整合包用了哪些模組；整合包自己的文字（KubeJS 新增的物品、方塊等）也無處翻譯。

這是「更多語言檔格式」的第二部分：4a Patchouli 已完成；原規劃的 4d KubeJS 併入本子專案；之後只剩 4c FTB Quests。

## 決策

1. **整合包進網站目錄**：與模組相同，以 Git 為資料庫（`data/modpacks/`），有目錄頁、整合包頁與 API，玩家可一鍵下載。
2. **本次功能**：整合包基礎資料、整合包使用的模組清單與各自完成度、一鍵下載合併資源包（已收錄模組＋KubeJS 譯文）、KubeJS 文字翻譯。
3. **平台**：Modrinth（`.mrpack`）與 CurseForge（`.zip`）。CurseForge 需 API 金鑰，只在 Node 腳本中使用。
4. **新增方式**：由維護者以腳本新增；投稿者翻譯已收錄整合包的 KubeJS 文字。新整合包以 issue 提出需求。
5. **一次完成**：資料、腳本、網站、API、翻譯工具同一個子專案交付。

## 資料格式（`data/modpacks/<id>/`）

`<id>` 規則同模組 modId（`^[a-z0-9_.-]+$`）。

### `modpack.json`

```json
{
  "id": "example-pack",
  "name": "Example Pack",
  "nameZh": "範例整合包",
  "summary": "繁中簡介（≤120 字）",
  "authors": ["someone"],
  "links": { "modrinth": "https://modrinth.com/modpack/example-pack", "curseforge": "https://www.curseforge.com/minecraft/modpacks/example-pack" },
  "source": { "platform": "modrinth", "projectId": "AbCd1234", "version": "1.4.0", "mcVersion": "1.20.1", "loader": "forge" },
  "mods": [
    { "platform": "modrinth", "projectId": "LNytGWDc", "slug": "create" },
    { "platform": "curseforge", "projectId": "238222", "slug": "jei" }
  ],
  "translation": { "status": "machine", "license": "CC-BY-SA-4.0", "source": { "name": "…", "url": null }, "contributors": [] },
  "updatedAt": "2026-10-17"
}
```

- `source`：目前收錄的整合包版本；`platform` 為 `modrinth` 或 `curseforge`；`mcVersion` 必須在 `PACK_FORMATS` 中；`loader` 沿用 `LOADERS`。
- `mods`：整合包使用的模組（平台、專案 ID、slug）；`(platform, projectId)` 不可重複。
- `links` 至少一個；`translation` 沿用模組的格式與授權選項。
- **不存 modId**：網站建置時以 slug 對照各模組 `mod.json` 的 `links.modrinth`（`https://modrinth.com/mod/<slug>`）或 `links.curseforge`（`https://www.curseforge.com/minecraft/mc-mods/<slug>`）。之後新收錄的模組會自動對上。

### KubeJS 文字

- `kubejs/<ns>/en_us.json`：英文原文（key→文字）。
- `kubejs/<ns>/zh_tw.json`：譯文，選填。
- `<ns>` 規則同 jar 命名空間（`^[a-z0-9_.-]+$`）；一個整合包可有多個命名空間。

## 新增與更新腳本

`npm run add:modpack -- --modrinth <slug|id>` 或 `npm run add:modpack -- --curseforge <slug|id>`（另可 `--version <版本號>` 指定版本，預設最新）：

- **Modrinth**：取專案與版本（`/v2/project/<slug>`、`/v2/project/<id>/version`），下載 `.mrpack`；讀 `modrinth.index.json` 的 `dependencies`（MC 版本、載入器）與 `files[].downloads`，由 `https://cdn.modrinth.com/data/<projectId>/…` 取得專案 ID，再以 `/v2/projects?ids=[…]` 批次查 slug。
- **CurseForge**：讀環境變數 `CURSEFORGE_API_KEY`（未設定時印出設定方式並以非 0 結束；若專案根目錄有 `.env` 則先載入）；以 `x-api-key` 呼叫 `api.curseforge.com/v1`：找整合包（gameId 432、整合包分類）與檔案、下載 zip；讀 `manifest.json` 的 `minecraft.version`、`minecraft.modLoaders` 與 `files[].projectID`，以 `POST /v1/mods` 批次查 slug。檔案不允許第三方下載（無 `downloadUrl`）時以清楚訊息結束，請維護者手動提供檔案（`--file <path>`）。
- **KubeJS**：讀 `overrides/kubejs/assets/<ns>/lang/en_us.json`。
- **新增**：建立 `modpack.json`（簡介為佔位文字、`translation.status` 為 `machine`）與 `kubejs/<ns>/en_us.json`。
- **更新**（目錄已存在）：更新 `source` 與 `mods`；KubeJS 英文以聯集合併（沿用 `addSourceVersion` 的規則：新 key 加入、原文不同列為差異、格式碼改變則拒絕寫入）；不動 `zh_tw.json`。
- 金鑰只在腳本中使用，不寫入任何檔案、不出現在網站或瀏覽器程式碼、不印出。

## 驗證（`validate:data`）

- `modpack.json` 不符 schema、資料夾名稱與 `id` 不一致 → error。
- KubeJS：語言檔頂層不是字串物件 → error；`zh_tw.json` 的 key 不在 `en_us.json` → error；格式碼不一致 → warning；術語表套用 → 依術語 level。
- 整合包問題以 `modpacks/<id>/…` 路徑回報 GitHub 註記；有 error 的整合包不出現在網站。

## 網站

- 頁首導覽新增「整合包」。
- `/modpacks/`：列出整合包（名稱、中文名、MC 版本、載入器、「已收錄模組 N／M」、KubeJS 進度）。
- `/modpacks/<id>/`：
  - 基本資料與平台連結。
  - 模組清單：已收錄者顯示完成度並連到模組頁；未收錄者另列（顯示 slug 與平台連結）。
  - KubeJS 翻譯進度（各命名空間合計）。
  - 一鍵下載：合併資源包，內含所有已收錄模組的翻譯（含手冊）與 KubeJS 譯文（`assets/<ns>/lang/zh_tw.json`）；`pack_format` 依整合包 `source.mcVersion`；未翻譯的條目保留英文。
- API：`/api/v1/modpacks/index.json`（摘要清單）、`/api/v1/modpacks/<id>.json`（完整資料：modpack.json、對照後的模組 modId 清單、KubeJS 原文與譯文）。
- 文字使用台灣繁中、玩家看得懂的說法（modpack＝整合包）。

## 翻譯工具

- 新增「載入網站上的整合包」：選擇整合包後，由 `/api/v1/modpacks/<id>.json` 讀出 KubeJS 文字，每個命名空間建立一個翻譯專案，專案 ID 為 `modpack:<id>:<ns>`，避免與模組撞名；顯示名稱為「<整合包名>（KubeJS：<ns>）」。
- 重新載入同一整合包時套用與模組相同的合併規則。
- 匯出：資源包輸出 `assets/<ns>/lang/zh_tw.json`；貢獻檔輸出 `modpacks/<id>/kubejs/<ns>/zh_tw.json` 與說明，供維護者放入 `data/`。

## 測試

- core：`modpack.json` schema、`.mrpack`／CurseForge manifest 解析、Modrinth CDN 網址取專案 ID、slug 對照模組、KubeJS 合併規則、驗證、資料載入。core 覆蓋率維持 ≥ 80%。
- 腳本：以注入的假 fetch 測試 Modrinth 與 CurseForge 的新增、更新、無金鑰、無下載網址。
- site：目錄頁、整合包頁（已收錄／未收錄模組、進度）、API payload、一鍵下載包含正確路徑與 `pack_format`。
- 翻譯工具：載入整合包、專案 ID、匯出路徑。
- E2E：以測試資料中的範例整合包開啟整合包頁、下載資源包並檢查內容；在翻譯工具載入範例整合包並匯出。

## 不在範圍

- FTB Quests（4c）。
- 每週自動追蹤整合包新版本（之後接上 #3 的 workflow）。
- 投稿者在翻譯工具上傳新整合包。
- KubeJS 以外的整合包文字（`resourcepacks/`、OpenLoader、`config/` 內文字）。
- 模組 jar 的自動收錄（未收錄模組仍需 `fetch:modrinth`／投稿）。
