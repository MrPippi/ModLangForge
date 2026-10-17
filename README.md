<div align="center">

# ModLangForge 繁中模組翻譯站

**Minecraft 模組的繁體中文（台灣用語）翻譯與資源包下載**

搜尋模組、下載翻譯好的資源包，或把多個模組的翻譯合成一個資源包一次下載。<br>
找不到想要的模組時，也可以直接在瀏覽器裡翻譯並分享給大家。

[![CI](https://github.com/MrPippi/ModLangForge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MrPippi/ModLangForge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/MrPippi/ModLangForge)](LICENSE)
[![Site](https://img.shields.io/badge/site-modlangforge.com-2ea44f)](https://modlangforge.com)

[**前往網站**](https://modlangforge.com) · [**貢獻指南**](CONTRIBUTING.md) · [**安全政策**](SECURITY.md)

</div>

---

## 目錄

- [給玩家：下載與使用](#給玩家下載與使用)
- [給翻譯貢獻者：一起改善譯文](#給翻譯貢獻者一起改善譯文)
- [給開發者](#給開發者)
  - [本機開發](#本機開發)
  - [專案架構](#專案架構)
  - [部署](#部署)
- [授權](#授權)
- [給模組作者：移除申請](#給模組作者移除申請)
- [安全性回報](#安全性回報)

## 給玩家：下載與使用

### 你可以做什麼

- **搜尋模組**：用英文名稱、中文名稱、常見別名或模組 ID（例如 `create`）都找得到。
- **下載資源包**：在模組頁選擇你玩的 Minecraft 版本，網站會直接在瀏覽器裡產生對應的資源包；也支援舊版遊戲使用的 `.lang` 語言檔格式。
- **合併資源包**：玩整合包時，可以把多個模組加入「合併資源包」，一次下載一個資源包就好，不必逐一安裝。
- **整合包**：「整合包」頁面列出各整合包用到的模組與翻譯完成度，可一鍵下載包含所有已收錄模組（含手冊）與整合包自己文字（KubeJS）的合併資源包；Minecraft 1.21 以上的整合包另附 FTB 任務的翻譯，下載後解壓縮到整合包資料夾即可。
- **自己動手翻譯**：網站還沒收錄的模組，可以到「自己翻譯」頁面把模組檔（`.jar`）拖進網頁翻譯。檔案只在你的電腦上處理，不會上傳；翻到一半的進度也會自動保存在瀏覽器裡。

### 使用步驟

1. 開啟 [modlangforge.com](https://modlangforge.com)，搜尋模組並進入模組頁。
2. 選擇 Minecraft 版本後下載資源包（`.zip`，不用解壓縮）。
3. 把資源包放進遊戲的 `resourcepacks` 資料夾，在「選項 → 資源包」中啟用，並把語言設為「繁體中文（台灣）」。
4. 要同時使用多個模組的翻譯：在各模組頁按「加入合併資源包」，再到「合併資源包」頁面一次下載。

## 給翻譯貢獻者：一起改善譯文

- **建議修改譯文**：在模組頁按譯文旁的「建議修改」，或用「搜尋這個模組的所有文字」找到想改的句子後送出。不登入也可以送出，只需通過一個簡單的人機驗證（Cloudflare Turnstile）。
- **登入並署名**：使用 Discord 或 GitHub 帳號登入後，你送出的建議通過審核時會在「貢獻者」頁面署名。你也可以在個人頁面設定顯示名稱、選擇是否公開署名、填寫 Minecraft 玩家名稱，以及查看自己送出過的建議。
- **審核與更新**：維護者審核通過後，譯文會發佈到本 repo，網站在幾分鐘內自動更新。
- **貢獻者排行**：「貢獻者」頁面依已發佈的譯文條數，列出選擇公開署名的貢獻者。
- **新增模組、翻譯原則與 Pull Request**：請參考 [貢獻指南（CONTRIBUTING.md）](./CONTRIBUTING.md)。

## 給開發者

### 本機開發

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

#### 在本機執行 Worker

Worker 是網站的後端 API（登入、建議、審核與發佈），部署在 Cloudflare Workers 上。在本機執行時請留意：

- 先執行 `cp .dev.vars.example .dev.vars` 建立本機設定檔（不要提交到版控）。`.dev.vars` 需要包含 `SESSION_SECRET`、`DISCORD_*`、`GITHUB_APP_CLIENT_*`、`TEST_LOGIN_ENABLED` 等變數。如果你已經有 `.dev.vars`，`cp` 不會覆蓋它，請對照 `.dev.vars.example` 補上缺少的變數；之後專案新增變數時也請再次對照。
- `dev:worker` 已加上 `--local-upstream localhost:8787`。這是因為 `wrangler.jsonc` 設定了正式網域的路由，若不加這個參數，`wrangler dev` 會把請求改寫成正式網域，導致來源（Origin）檢查失敗。
- 本機可以用 `POST /api/v1/auth/test-login` 模擬登入。真正的 OAuth 登入只能在部署後的網址使用，因為回呼網址（callback）必須事先在 Discord／GitHub 登記。
- 本機的頻率限制紀錄存放在 `.wrangler/state`；測試時如果被限制，刪除這個資料夾即可。
- 測試管理頁與發佈功能：先執行 `npx tsx e2e/fake-github.ts`（模擬 GitHub 的假伺服器，使用連接埠 8788）與 `npx tsx e2e/prepare-dev-vars.ts`，再以 `--var GITHUB_API_BASE:http://localhost:8788` 啟動 `wrangler dev`。用 test-login 以 `github:MrPippi` 登入即具有管理員權限。
- Minecraft 玩家名稱查詢使用 `MOJANG_API_BASE`（預設為 `https://playerdb.co`）。Mojang 官方 API 會拒絕來自 Cloudflare 的請求（回應 403），所以改經 playerdb.co 代為查詢，且只會送出玩家名稱。頭像圖片來自 `https://mc-heads.net`，已在內容安全政策（CSP）的 `img-src` 中允許，設定見 `apps/site/public/_headers`。

#### 端對端測試

`npm run test:e2e` 會用 `wrangler dev` 在連接埠 `8787` 執行，可用 `E2E_PORT=8790` 改用其他連接埠。模擬 GitHub 與 Mojang 的假伺服器會使用 `E2E_PORT+1`，所以同時在多個 worktree 執行測試時，各自的 `E2E_PORT` 至少要相差 2。

#### 資料維護工具

```bash
npm run fetch:modrinth -- --limit 15      # 從 Modrinth 抓取熱門模組，建立待翻譯資料
npm run icons:fetch                       # 下載模組圖示到 apps/site/public/mod-icons（新增模組後執行；加 --force 重新下載）
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的翻譯條目（key）併入現有翻譯
npm run add:modpack -- --modrinth <slug>  # 新增或更新整合包；--curseforge 需要 .env 的 CURSEFORGE_API_KEY（見 .env.example）
npm run track:versions -- --max-builds 100  # 偵測已收錄模組的新版本與新的版本組合並寫入資料
npm run glossary:mine                     # 列出譯法不一致的候選詞與違反術語表的地方
npm run migrate:source-versions           # 把舊版 mod.json 的 modVersion 轉換為 sourceVersions
```

#### 自動追蹤模組新版本

`.github/workflows/track-versions.yml` 會在每週一 02:00（UTC）執行 `track:versions`，有變動時會開立或更新 `auto/track-versions` 分支的 Pull Request。你也可以在 GitHub 的 Actions 頁面手動執行，並指定這次最多處理幾個版本。

- 需要先在 repo 設定中開啟「Settings → Actions → General → Allow GitHub Actions to create and approve pull requests」。
- 預設使用 `GITHUB_TOKEN` 開 Pull Request；受 GitHub 的限制，這樣開出的 Pull Request 不會自動觸發 CI，因此 workflow 會事先執行 `validate:data`。如果設定了 `TRACKER_TOKEN` secret，自動開出的 Pull Request 就會照常觸發 CI。建議使用只授權本 repo 的 fine-grained token（Contents 與 Pull requests 讀寫權限），不要使用 classic PAT。

### 專案架構

| 路徑 | 說明 |
|------|------|
| `apps/site` | 使用 Astro 建置的靜態網站，互動元件使用 React（包含 `/translate` 翻譯工具） |
| `apps/worker` | 執行於 Cloudflare Workers 的後端（Hono 框架＋D1 資料庫）：API、登入、審核與發佈 |
| `packages/core` | 網站與工具共用的邏輯：讀取 jar、處理語言檔、檢查格式碼、合併、匯出與資料驗證 |
| `data/mods` | 翻譯資料，直接以 Git 版本控管；授權見 [data/LICENSE](./data/LICENSE) |
| `data/modpacks` | 整合包資料（`modpack.json`、整合包的 KubeJS 文字與 FTB 任務文字） |
| `migrations` | D1 資料庫的結構變更（migrations） |
| `scripts` | 資料驗證與維護用的命令列工具 |
| `e2e` | Playwright 端對端測試，以及模擬外部服務的假伺服器 |
| `docs` | 開發過程中的設計規格與實作計畫 |

### 部署

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

## 授權

- **程式碼**：以 MIT 授權釋出，見 [LICENSE](./LICENSE)。
- **翻譯資料**：預設以 CC BY-SA 4.0 授權釋出，見 [data/LICENSE](./data/LICENSE)。個別模組若在 `mod.json` 的 `translation.license` 另有標示（例如 CC BY-NC-SA 4.0），則以該標示為準。
- **英文原文**：資料中的英文原文（`en_us`）著作權屬於各模組作者，僅用於比對翻譯，不適用上述授權。
- 本站與 Mojang、Microsoft 及各模組作者沒有任何關係，也不散布任何模組檔案。

## 給模組作者：移除申請

感謝你製作了這些模組！如果你是模組作者或著作權人，不希望本站收錄你的模組原文或譯文，歡迎直接告訴我們：

1. 到 GitHub [開一個 issue](https://github.com/MrPippi/ModLangForge/issues/new)。
2. 寫明模組名稱，以及希望移除的範圍（部分原文字串、譯文，或整個模組）。

我們收到後會儘快處理並移除，不需要任何正式文件。

## 安全性回報

如果你發現安全性漏洞，請不要公開揭露，而是透過 GitHub 的私密回報功能告訴我們。詳細說明請見 [SECURITY.md](./SECURITY.md)。

---

歡迎一起修正譯文、新增模組或改進程式，詳見 [貢獻指南](./CONTRIBUTING.md)。
