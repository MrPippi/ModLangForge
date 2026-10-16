# ModLangForge 繁中模組翻譯站

Minecraft 模組繁體中文翻譯站：搜尋模組、下載資源包，或勾選多個模組合併成一個資源包下載。找不到的模組可以上傳 jar，直接在瀏覽器內翻譯並投稿。

## 功能

- **模組目錄與搜尋**：支援英文名稱、中文名稱、別名與 modId 搜尋（Pagefind 靜態索引）。
- **下載資源包**：在瀏覽器內即時打包，依 Minecraft 版本設定 `pack_format`。
- **合併資源包**：把多個模組加入合併資源包，一次下載單一資源包。
- **上傳 jar 翻譯**（`/translate`）：解析 jar 內語言檔、格式碼檢查、自動儲存進度、匯出資源包／語言檔／投稿檔。檔案不會上傳。
- **個人資料**（`/me/`）：登入者可設定顯示名稱、是否公開署名、自填 Minecraft 名稱（向 Mojang 確認存在並顯示頭像，標示「未驗證」），並查看自己送出的建議。
- **貢獻者**（`/contributors/`）：依已發佈譯文條數排列公開署名的貢獻者，`/contributors/<id>/` 為個人頁；資料由 Worker 即時提供。
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
npm run test:e2e         # 端對端測試（以 wrangler dev 於 :8787 執行；E2E_PORT=8790 可改埠；假 GitHub 用 E2E_PORT+1，並行 worktree 的 E2E_PORT 至少差 2）
cp .dev.vars.example .dev.vars          # Worker 本機環境變數（勿提交）
# 3B1 起 .dev.vars 需含 SESSION_SECRET、DISCORD_*、GITHUB_APP_CLIENT_*、TEST_LOGIN_ENABLED；
# 已有 .dev.vars 者（cp 不會覆蓋）請對照 .dev.vars.example 補齊，新增變數時也要重新對照。
# 本機以 POST /api/v1/auth/test-login 模擬登入，真實 OAuth 只在部署後的網址可用（callback 需在 Discord／GitHub 登記）。
# 本機頻率限制紀錄存在 .wrangler/state；測試被限流時可刪除該目錄。
# 管理頁與發佈：npx tsx e2e/fake-github.ts（假 GitHub，埠 8788）＋ npx tsx e2e/prepare-dev-vars.ts，
# 再以 --var GITHUB_API_BASE:http://localhost:8788 啟動 wrangler dev；以 test-login 用 github:MrPippi 登入即為管理員。
# Minecraft 名稱查詢走 MOJANG_API_BASE（wrangler.jsonc 預設 https://api.mojang.com）；E2E 以 --var 指向假伺服器（E2E_PORT+1，名稱 steve／alex 存在）。
# 頭像來自 https://mc-heads.net（CSP img-src 已放行，見 apps/site/public/_headers）。
npm run build && npm run dev:worker     # 本機執行 Worker + 靜態網站 http://localhost:8787
npm run fetch:modrinth -- --limit 15   # 從 Modrinth 抓熱門模組建立待翻譯資料
npm run icons:fetch                   # 下載模組圖示到 apps/site/public/mod-icons（新增模組後執行；--force 重新下載）
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的 key 併入翻譯
npm run track:versions -- --max-builds 100  # 偵測已收錄模組的新版本與新組合並寫入（排程 workflow 每週執行）
npm run glossary:mine    # 列出譯法不一致的候選與術語違規
npm run migrate:source-versions                                    # 舊 mod.json 的 modVersion → sourceVersions
```

## 自動追蹤版本

`.github/workflows/track-versions.yml` 每週一 02:00（UTC）執行 `track:versions`，有變動時開（或更新）一個 `auto/track-versions` 的 PR；也可在 Actions 頁面手動執行並指定本次上限。

- 需在 repo 設定開啟「Settings → Actions → General → Allow GitHub Actions to create and approve pull requests」。
- 預設以 `GITHUB_TOKEN` 開 PR，此時 CI 不會自動執行（GitHub 的限制），workflow 已先跑過 `validate:data`；設定 `TRACKER_TOKEN` secret 後，自動 PR 會照常觸發 CI；請使用只授權本 repo 的 fine-grained token（Contents、Pull requests 讀寫），不要用 classic PAT。

## 部署

Cloudflare Pages 連接此 repo：

| 設定 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `apps/site/dist` |
| 環境變數 | `SITE_URL=https://你的網域`、`NODE_VERSION=24` |

`robots.txt` 與 sitemap 依 `SITE_URL` 自動產生。`PUBLIC_REPO` 指定 GitHub repo（預設 `MrPippi/ModLangForge`），用於翻譯需求連結，以及旗標關閉時的「在 GitHub 修正譯文／回報問題」連結。

`PUBLIC_SUGGEST_ENABLED=true` 啟用站內「建議修改」流程（需要已部署的 Worker；未設定時改用 GitHub 連結，適合純 Pages 部署）。啟用且 `SITE_URL` 為正式網址時，必須設定 `PUBLIC_TURNSTILE_SITE_KEY`，否則建置失敗。

Worker（workers.dev 測試站）目前以 `npx wrangler deploy` 手動部署。3C 改用 Workers Builds 之前，每次在 `/admin/` 站內發佈後，都要重新建置並 `wrangler deploy`，讓 Worker 的靜態資產與 `main` 一致；否則之後的建議會以舊譯文比對。

## 貢獻

請見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 授權

- 程式碼：MIT（見 [LICENSE](./LICENSE)）
- 翻譯資料：CC BY-SA 4.0（見 [data/LICENSE](./data/LICENSE)），個別模組另有標示者除外
