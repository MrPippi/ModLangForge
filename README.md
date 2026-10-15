# ModLangForge 繁中模組翻譯站

Minecraft 模組繁體中文翻譯站：搜尋模組、下載資源包，或勾選多個模組合併成一個資源包下載。找不到的模組可以上傳 jar，直接在瀏覽器內翻譯並投稿。

## 功能

- **模組目錄與搜尋**：支援英文名稱、中文名稱、別名與 modId 搜尋（Pagefind 靜態索引）。
- **下載資源包**：在瀏覽器內即時打包，依 Minecraft 版本設定 `pack_format`。
- **合併包**：把多個模組加入合併包，一次下載單一資源包。
- **上傳 jar 翻譯**（`/translate`）：解析 jar 內語言檔、格式碼檢查、自動儲存進度、匯出資源包／語言檔／投稿檔。檔案不會上傳。
- **靜態 API**：`/api/v1/index.json`、`/api/v1/mods/<modId>.json`，供未來的模組端入口使用。

## 專案結構

```
packages/core   共用函式庫：jar 解析、語言檔、格式碼檢查、合併、匯出、資料驗證
apps/site       Astro 靜態網站（含 /translate 翻譯工具）
data/mods       翻譯資料（Git 即資料庫），授權見 data/LICENSE
scripts         資料驗證 CLI
e2e             Playwright 端對端測試
docs            設計規格與實作計畫
```

## 開發

需要 Node.js 24 以上。

```bash
npm install
npm run dev              # 開發伺服器 http://localhost:4321
npm test                 # 單元測試
npm run validate:data    # 驗證 data/ 翻譯資料
npm run build            # 建置網站與搜尋索引
PUBLIC_SUGGEST_ENABLED=true npm run build   # 建議功能開啟的建置；本機跑 E2E 前必須先這樣 build
npm run test:e2e         # 端對端測試（以 wrangler dev 於 :8787 執行）
cp .dev.vars.example .dev.vars          # Worker 本機環境變數（勿提交）
npm run build && npm run dev:worker     # 本機執行 Worker + 靜態網站 http://localhost:8787
npm run fetch:modrinth -- --limit 15   # 從 Modrinth 抓熱門模組建立待翻譯資料
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的 key 併入翻譯
npm run migrate:source-versions                                    # 舊 mod.json 的 modVersion → sourceVersions
```

## 部署

Cloudflare Pages 連接此 repo：

| 設定 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `apps/site/dist` |
| 環境變數 | `SITE_URL=https://你的網域`、`NODE_VERSION=24` |

`robots.txt` 與 sitemap 依 `SITE_URL` 自動產生。`PUBLIC_REPO` 指定 GitHub repo（預設 `MrPippi/ModLangForge`），用於翻譯需求連結，以及旗標關閉時的「在 GitHub 修正譯文／回報問題」連結。

`PUBLIC_SUGGEST_ENABLED=true` 啟用站內「建議修改」流程（需要已部署的 Worker；未設定時改用 GitHub 連結，適合純 Pages 部署）。啟用且 `SITE_URL` 為正式網址時，必須設定 `PUBLIC_TURNSTILE_SITE_KEY`，否則建置失敗。

## 貢獻

請見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 授權

- 程式碼：MIT（見 [LICENSE](./LICENSE)）
- 翻譯資料：CC BY-SA 4.0（見 [data/LICENSE](./data/LICENSE)），個別模組另有標示者除外
