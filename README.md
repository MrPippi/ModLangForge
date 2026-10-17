<div align="center">

# ModLangForge 繁中模組翻譯站

**Minecraft 模組繁體中文（台灣用語）翻譯目錄與資源包下載**

搜尋模組、下載資源包、合併多個模組一次下載；找不到的模組可在瀏覽器內直接翻譯並投稿

[![CI](https://github.com/MrPippi/ModLangForge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MrPippi/ModLangForge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/MrPippi/ModLangForge)](LICENSE)
[![Site](https://img.shields.io/badge/site-modlangforge.com-2ea44f)](https://modlangforge.com)

[**前往網站**](https://modlangforge.com) · [**貢獻指南**](CONTRIBUTING.md) · [**安全政策**](SECURITY.md)

</div>

---

## 目錄

- [功能](#功能)
- [線上使用](#線上使用)
- [參與翻譯](#參與翻譯)
- [開發](#開發)
- [專案架構](#專案架構)
- [部署](#部署)
- [授權](#授權)
- [安全](#安全)
- [貢獻](#貢獻)

## 功能

- **模組目錄與搜尋**：支援英文名稱、中文名稱、別名與 modId 搜尋（Pagefind 靜態索引）。
- **下載資源包**：在瀏覽器內即時打包，依 Minecraft 版本設定 `pack_format`，可選多個 MC 版本與舊版 `.lang` 格式。
- **合併資源包**：把多個模組加入合併資源包，一次下載單一資源包。
- **上傳 jar 翻譯**（`/translate`）：解析 jar 內語言檔、格式碼檢查、自動儲存進度，匯出資源包／語言檔／投稿檔；檔案不會上傳。
- **社群建議**：匿名（Cloudflare Turnstile 人機驗證）或以 Discord／GitHub 登入後送出修改建議。
- **審核與發佈**：審核者／管理員在 `/admin/` 審核佇列或直接編輯，並以單一 commit 批次發佈到 GitHub（經 GitHub App）。
- **個人資料**（`/me/`）：設定顯示名稱、是否公開署名、自填 Minecraft 名稱（經 playerdb.co 向 Mojang 確認存在並顯示頭像，標示「未驗證」），並查看自己送出的建議。
- **貢獻者排行**（`/contributors/`）：依已發佈譯文條數排列公開署名的貢獻者，`/contributors/<id>/` 為個人頁。
- **靜態 API**：`/api/v1/index.json`、`/api/v1/mods/<modId>.json`，供未來的模組端入口使用。

## 線上使用

1. 開啟 [modlangforge.com](https://modlangforge.com)，搜尋模組並進入模組頁。
2. 在模組頁選擇 Minecraft 版本後下載資源包，依頁面上的步驟放進遊戲的 `resourcepacks` 資料夾並啟用。
3. 要同時使用多個模組：把它們加入「合併資源包」，一次下載單一資源包。
4. 找不到模組：到「自己翻譯」頁面，把 `.jar` 拖進網頁即可翻譯。

## 參與翻譯

- **修正譯文**：在模組頁按譯文旁的「建議修改」（或「搜尋這個模組的所有文字」）並送出；匿名需通過人機驗證，登入後送出的建議會在貢獻者頁署名。
- **登入**：支援 Discord 與 GitHub；登入後可管理個人資料與查看自己的建議。
- **審核**：審核者／管理員在 `/admin/` 審核建議，通過後發佈到本 repo，網站隨即更新。
- **新增模組、翻譯原則、Pull Request 流程**：請見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 開發

需要 Node.js 24 以上。

```bash
npm install
npm run dev              # 開發伺服器 http://localhost:4321（純前端，不含 API）
npm run build            # 建置網站與搜尋索引
npm run dev:worker       # 先 build；本機執行 Worker + 靜態網站 http://localhost:8787
npm test                 # 單元測試
npm run test:e2e         # 先 build；端對端測試
npm run check:dist       # 檢查 apps/site/dist 檔案數（需先 build）
npm run validate:data    # 驗證 data/ 翻譯資料
```

### 本機 Worker

- `cp .dev.vars.example .dev.vars`（勿提交）。`.dev.vars` 需含 `SESSION_SECRET`、`DISCORD_*`、`GITHUB_APP_CLIENT_*`、`TEST_LOGIN_ENABLED` 等；已有 `.dev.vars` 者（`cp` 不會覆蓋）請對照 `.dev.vars.example` 補齊，新增變數時也要重新對照。
- `dev:worker` 已加 `--local-upstream localhost:8787`：`wrangler.jsonc` 設有正式網域 routes，否則 wrangler dev 會把請求改寫成正式網域而使 Origin 檢查失敗。
- 本機以 `POST /api/v1/auth/test-login` 模擬登入；真實 OAuth 只在部署後的網址可用（callback 需在 Discord／GitHub 登記）。
- 本機頻率限制紀錄存在 `.wrangler/state`；測試被限流時可刪除該目錄。
- 管理頁與發佈：執行 `npx tsx e2e/fake-github.ts`（假 GitHub，埠 8788）與 `npx tsx e2e/prepare-dev-vars.ts`，再以 `--var GITHUB_API_BASE:http://localhost:8788` 啟動 `wrangler dev`；用 test-login 以 `github:MrPippi` 登入即為管理員。
- Minecraft 名稱查詢走 `MOJANG_API_BASE`（預設 `https://playerdb.co`；Mojang 官方 API 會對 Cloudflare 出口回 403，故經 playerdb.co 代理，只送出名稱）。頭像來自 `https://mc-heads.net`（CSP `img-src` 已放行，見 `apps/site/public/_headers`）。

### E2E

`npm run test:e2e` 以 `wrangler dev` 於 `:8787` 執行，`E2E_PORT=8790` 可改埠；假 GitHub 與假 Mojang 伺服器使用 `E2E_PORT+1`，所以並行 worktree 的 `E2E_PORT` 至少要差 2。

### 資料工具

```bash
npm run fetch:modrinth -- --limit 15      # 從 Modrinth 抓熱門模組建立待翻譯資料
npm run icons:fetch                       # 下載模組圖示到 apps/site/public/mod-icons（新增模組後執行；--force 重新下載）
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的 key 併入翻譯
npm run track:versions -- --max-builds 100  # 偵測已收錄模組的新版本與新組合並寫入
npm run glossary:mine                     # 列出譯法不一致的候選與術語違規
npm run migrate:source-versions           # 舊 mod.json 的 modVersion → sourceVersions
```

### 自動追蹤版本

`.github/workflows/track-versions.yml` 每週一 02:00（UTC）執行 `track:versions`，有變動時開（或更新）`auto/track-versions` 的 PR；也可在 Actions 頁面手動執行並指定本次上限。

- 需開啟「Settings → Actions → General → Allow GitHub Actions to create and approve pull requests」。
- 預設以 `GITHUB_TOKEN` 開 PR，此時 CI 不會自動執行（GitHub 的限制），workflow 已先跑過 `validate:data`；設定 `TRACKER_TOKEN` secret 後自動 PR 會照常觸發 CI。請使用只授權本 repo 的 fine-grained token（Contents、Pull requests 讀寫），不要用 classic PAT。

## 專案架構

| 路徑 | 說明 |
|------|------|
| `apps/site` | Astro 靜態網站與 React islands（含 `/translate` 翻譯工具） |
| `apps/worker` | Hono on Cloudflare Workers + D1：API、登入、審核與發佈 |
| `packages/core` | 共用純邏輯：jar 解析、語言檔、格式碼檢查、合併、匯出、資料驗證 |
| `data/mods` | 翻譯資料（Git 即資料庫），授權見 [data/LICENSE](./data/LICENSE) |
| `migrations` | D1 資料庫 migrations |
| `scripts` | 資料驗證與維護 CLI |
| `e2e` | Playwright 端對端測試與假 GitHub 伺服器 |
| `docs` | 設計規格與實作計畫 |

## 部署

正式站 https://modlangforge.com 由 Cloudflare Worker `modlangforge`（靜態資產＋API＋D1）提供，以 **Workers Builds** 連接本 repo：push `main`（包含 `/admin/` 站內發佈產生的 commit）會自動建置、套用 D1 migrations 並部署，約 2–3 分鐘上線。

| Workers Builds 設定 | 值 |
|---|---|
| Production branch | `main`（非 production 分支不建置） |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
| 建置變數 | `NODE_VERSION=24`、`SITE_URL=https://modlangforge.com`、`PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key>` |

- 執行期變數（`SITE_URL`、`ADMIN_BOOTSTRAP`、`GITHUB_API_BASE`、`REPO`、`MOJANG_API_BASE`）寫在 `wrangler.jsonc`；秘密只存在 Worker secrets（`TURNSTILE_SECRET`、`IP_HASH_SALT`、`SESSION_SECRET`、`DISCORD_CLIENT_ID`／`DISCORD_CLIENT_SECRET`、`GITHUB_APP_CLIENT_ID`／`GITHUB_APP_CLIENT_SECRET`、`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`），不放進建置變數或版控。
- `SITE_URL` 為正式網址時必須設定 `PUBLIC_TURNSTILE_SITE_KEY`，否則建置失敗。`robots.txt` 與 sitemap 依 `SITE_URL` 產生；`PUBLIC_REPO` 指定 GitHub repo（預設 `MrPippi/ModLangForge`），用於頁尾與翻譯需求連結。
- CI 在建置後統計 `apps/site/dist` 檔案數：超過 15,000 警告，超過 20,000（Workers 免費方案每版本上限）失敗。
- Workers Builds 故障時可手動部署：以上表建置變數執行 `npm run build`，再 `npx wrangler deploy`。

## 授權

- **程式碼**：MIT（見 [LICENSE](./LICENSE)）。
- **翻譯資料**：預設 CC BY-SA 4.0（見 [data/LICENSE](./data/LICENSE)），個別模組於 `mod.json` 的 `translation.license` 另有標示者（例如 CC BY-NC-SA 4.0）依其標示。
- **原文**：`en_us` 原文快照的著作權屬於各模組作者，僅用於比對翻譯，不在上述授權範圍內。本站與 Mojang、Microsoft 及各模組作者無關，不散布任何模組檔案。
- **移除申請**：模組作者或著作權人若希望移除其模組的原文或譯文，請到 [GitHub 開一個 issue](https://github.com/MrPippi/ModLangForge/issues/new)，說明模組名稱與要移除的內容，我們會儘速移除。

## 安全

發現漏洞請勿公開揭露，改用 GitHub 私密回報，詳見 [SECURITY.md](./SECURITY.md)。

## 貢獻

歡迎修正譯文、新增模組與改進程式，請見 [CONTRIBUTING.md](./CONTRIBUTING.md)。
