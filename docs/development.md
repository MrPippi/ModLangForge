# 開發與維護說明

這份文件寫給想在本機執行網站、修改程式或維護翻譯資料的人。一般玩家不需要閱讀，請回到 [README](../README.md)。

## 本機開發

需要 Node.js 24 以上。

```bash
npm install
npm run dev              # 開發伺服器 http://localhost:4321（只有網站前端，不含 API）
npm run build            # 建置網站與搜尋索引
npm run dev:worker       # 先建置，再於本機執行 Worker 與網站 http://localhost:8787
npm test                 # 單元測試
npm run test:e2e         # 先建置，再執行端對端（E2E）測試
npm run check:dist       # 檢查 apps/site/dist 的檔案數量（需先建置）
npm run validate:data    # 檢查 data/ 翻譯資料的格式
```

### 在本機執行 Worker

Worker 是網站的後端 API（登入、建議、審核與發佈），部署在 Cloudflare Workers 上。在本機執行時請留意：

- 先執行 `cp .dev.vars.example .dev.vars` 建立本機設定檔（不要提交到版控）。`.dev.vars` 需要包含 `SESSION_SECRET`、`DISCORD_*`、`GITHUB_APP_CLIENT_*`、`TEST_LOGIN_ENABLED` 等變數。如果你已經有 `.dev.vars`，`cp` 不會覆蓋它，請對照 `.dev.vars.example` 補上缺少的變數；之後專案新增變數時也請再次對照。
- `dev:worker` 已加上 `--local-upstream localhost:8787`。這是因為 `wrangler.jsonc` 設定了正式網域的路由，若不加這個參數，`wrangler dev` 會把請求改寫成正式網域，導致來源（Origin）檢查失敗。
- 本機可以用 `POST /api/v1/auth/test-login` 模擬登入。真正的 OAuth 登入只能在部署後的網址使用，因為回呼網址（callback）必須事先在 Discord／GitHub 登記。
- 本機的頻率限制紀錄存放在 `.wrangler/state`；測試時如果被限制，刪除這個資料夾即可。
- 測試管理頁與發佈功能：先執行 `npx tsx e2e/fake-github.ts`（模擬 GitHub 的假伺服器，使用連接埠 8788）與 `npx tsx e2e/prepare-dev-vars.ts`，再以 `--var GITHUB_API_BASE:http://localhost:8788` 啟動 `wrangler dev`。用 test-login 以 `github:MrPippi` 登入即具有管理員權限。
- Minecraft 玩家名稱查詢使用 `MOJANG_API_BASE`（預設為 `https://playerdb.co`）。Mojang 官方 API 會拒絕來自 Cloudflare 的請求（回應 403），所以改經 playerdb.co 代為查詢，且只會送出玩家名稱。頭像圖片來自 `https://mc-heads.net`，已在內容安全政策（CSP）的 `img-src` 中允許，設定見 `apps/site/public/_headers`。

### 端對端測試

`npm run test:e2e` 會用 `wrangler dev` 在連接埠 `8787` 執行，可用 `E2E_PORT=8790` 改用其他連接埠。模擬 GitHub 與 Mojang 的假伺服器會使用 `E2E_PORT+1`，所以同時在多個 worktree 執行測試時，各自的 `E2E_PORT` 至少要相差 2。

## 資料維護工具

```bash
npm run fetch:modrinth -- --limit 15      # 從 Modrinth 抓取熱門模組，建立待翻譯資料
npm run icons:fetch                       # 下載模組圖示到 apps/site/public/mod-icons（新增模組後執行；加 --force 重新下載）
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的翻譯條目（key）併入現有翻譯
npm run add:modpack -- --modrinth <slug>  # 新增或更新整合包；改用 --curseforge 時需要 CurseForge API Key（見下方說明）
npm run track:versions -- --max-builds 100  # 偵測已收錄模組的新版本與新的版本組合並寫入資料
npm run glossary:mine                     # 列出譯法不一致的候選詞與違反術語表的地方
npm run migrate:source-versions           # 把舊版 mod.json 的 modVersion 轉換為 sourceVersions
```

從 CurseForge 匯入整合包時，請先到 [CurseForge for Studios](https://console.curseforge.com) 申請 API Key，並在專案根目錄的 `.env` 檔加入一行 `CURSEFORGE_API_KEY=你的金鑰`（也可以改用環境變數）。`.env` 已被版本控制忽略，金鑰不會被提交，也不會寫入任何資料檔或印出。

### 自動追蹤模組新版本

`.github/workflows/track-versions.yml` 會在每週一 02:00（UTC）執行 `track:versions`，有變動時會開立或更新 `auto/track-versions` 分支的 Pull Request。你也可以在 GitHub 的 Actions 頁面手動執行，並指定這次最多處理幾個版本。Pull Request 的摘要會列出有新增文字、需要補翻譯的模組。

- 建議在 repo 的 secrets 設定 `TRACKER_TOKEN`：使用只授權本 repo 的 fine-grained token（Contents 與 Pull requests 讀寫權限），不要使用 classic PAT。用這個 token 開出的 Pull Request 會照常觸發 CI。
- 沒有設定 `TRACKER_TOKEN` 時，workflow 會改用 `GITHUB_TOKEN`。這時需要在 repo 設定中開啟「Settings → Actions → General → Allow GitHub Actions to create and approve pull requests」，否則無法開立 Pull Request；而且受 GitHub 限制，這樣開出的 Pull Request 不會自動觸發 CI，因此 workflow 會事先執行 `validate:data`。

## 專案架構

| 路徑 | 說明 |
|------|------|
| `apps/site` | 使用 Astro 建置的靜態網站，互動元件使用 React（包含 `/translate` 翻譯工具） |
| `apps/worker` | 執行於 Cloudflare Workers 的後端（Hono 框架＋D1 資料庫）：API、登入、審核與發佈 |
| `packages/core` | 網站與工具共用的邏輯：讀取 jar、處理語言檔、檢查格式碼、合併、匯出與資料驗證 |
| `data/mods` | 翻譯資料，直接以 Git 版本控管；授權見 [data/LICENSE](../data/LICENSE) |
| `data/modpacks` | 整合包資料（`modpack.json`、整合包的 KubeJS 文字與 FTB 任務文字） |
| `migrations` | D1 資料庫的結構變更（migrations） |
| `scripts` | 資料驗證與維護用的命令列工具 |
| `e2e` | Playwright 端對端測試，以及模擬外部服務的假伺服器 |
| `docs` | 開發過程中的設計規格與實作計畫 |

## 部署

正式站 https://modlangforge.com 由 Cloudflare Worker `modlangforge` 提供（包含靜態網頁、API 與 D1 資料庫），並透過 **Workers Builds** 連接本 repo。只要 `main` 分支有新的 commit（包括審核者在 `/admin/` 發佈譯文時產生的 commit），就會自動建置、套用 D1 資料庫變更並部署，大約 2–3 分鐘後上線。

| Workers Builds 設定 | 值 |
|---|---|
| Production branch | `main`（其他分支不會建置） |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
| 建置變數 | `NODE_VERSION=24`、`SITE_URL=https://modlangforge.com`、`PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key>` |

- 執行時使用的一般變數（`SITE_URL`、`ADMIN_BOOTSTRAP`、`GITHUB_API_BASE`、`REPO`、`MOJANG_API_BASE`）寫在 `wrangler.jsonc`。機密資料只存放在 Worker secrets 中（`TURNSTILE_SECRET`、`IP_HASH_SALT`、`SESSION_SECRET`、`DISCORD_CLIENT_ID`／`DISCORD_CLIENT_SECRET`、`GITHUB_APP_CLIENT_ID`／`GITHUB_APP_CLIENT_SECRET`、`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`），不會放進建置變數或版本控制。
- 當 `SITE_URL` 是正式網址時，必須設定 `PUBLIC_TURNSTILE_SITE_KEY`，否則建置會失敗。`robots.txt` 與 sitemap 會依 `SITE_URL` 產生；`PUBLIC_REPO` 用來指定 GitHub repo（預設為 `MrPippi/ModLangForge`），供頁尾與「翻譯需求」連結使用。
- CI 會在建置後統計 `apps/site/dist` 的檔案數量：超過 15,000 個時發出警告，超過 20,000 個（Workers 免費方案每個版本的上限）時判定失敗。
- 如果 Workers Builds 暫時無法使用，可以手動部署：依上表設定建置變數後執行 `npm run build`，再執行 `npx wrangler deploy`。
