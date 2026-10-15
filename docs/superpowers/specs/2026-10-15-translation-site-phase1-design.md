# ModLangForge 繁中模組翻譯站 — 第一階段設計規格

- 日期：2026-10-15
- 狀態：待審閱
- 取代：`2026-10-15-modlangforge-design.md`（純翻譯工具定位）。該文件的 jar 解析、語言檔、格式碼檢查、合併、匯出規則（§5–§7、§11）仍然有效，由本文件引用。

## 1. 定位與目標

ModLangForge 是**繁體中文 Minecraft 模組翻譯站**：以「查詢＋下載」為主、「翻譯」為輔。網站本身就是產品，透過 SEO、回訪與內容累積成長。

### 1.1 使用者已確認的決策

- 架構：Git 當資料庫＋靜態網站（Astro），部署在 Cloudflare Pages。
- 第一階段功能：模組目錄＋搜尋＋下載、勾選合併下載、上傳 jar 翻譯。
- 內容來源：匯入授權相容的既有翻譯、LLM 預翻熱門模組 → **第二階段**實作。
- 貢獻方式：「在 GitHub 修正」→ PR → CI 驗證 → 合併後自動重建。

### 1.2 階段劃分

| 階段 | 內容 | 公開？ |
|---|---|---|
| 1（本文件） | monorepo、資料格式、網站、合併下載、/translate、靜態 API、CI 驗證、3 個示範模組 | 否（預覽網址） |
| 2 | 匯入腳本（授權相容來源）、Modrinth 熱門模組 LLM 預翻管線 | 完成後正式開站 |
| 3 | 站內編輯器（GitHub OAuth，由後端代開 PR）、上傳 modpack 自動勾選 | 是 |
| 4 | 模組端入口（遊戲內下載）使用的 API 擴充 | 是 |

### 1.3 假設（已核准）

- 每個模組只維護一份「最新版」譯文，不分 MC 版本分支。
- 翻譯資料授權 **CC BY-SA 4.0**；程式碼授權 MIT。來源授權不同的模組（例如 BY-NC-SA）在 `mod.json` 個別標示，並顯示在模組頁。
- 不散布任何 jar 或模組程式碼，只散布譯文資源包。

### 1.4 非目標（第一階段）

帳號系統、站內編輯、評論、分析追蹤、modpack 解析、多 MC 版本分支、伺服器端打包。

### 1.5 成功標準

1. 搜尋「Create」「機械動力」「create」都能找到 Create 模組頁。
2. 模組頁可在 2 次點擊內下載可用的資源包。
3. 勾選 3 個模組後下載的合併資源包，放入 `resourcepacks/` 後三個模組都顯示繁中。
4. 搜尋無結果時顯示「上傳 jar 自己翻」入口。
5. 修改 `data/mods/*/zh_tw.json` 的 PR，若 JSON 損壞或 key 不在 `en_us.json` 中，CI 失敗。
6. Lighthouse SEO ≥ 95；每個模組頁有獨立 title、description、canonical、sitemap 項目。

## 2. Repo 結構

npm workspaces monorepo：

```
ModLangForge/
├── packages/core/            現有 src/core（jar、lang、validate、merge、export）＋ types
│   └── src/catalog/          新增：data 格式的 schema 與轉換
├── apps/site/                Astro 網站
│   ├── src/pages/            頁面與靜態 API 端點
│   ├── src/components/       Astro 元件（純靜態）
│   ├── src/islands/          React 互動元件（下載、購物車、搜尋）
│   ├── src/translator/       現有 src/store、src/ui（翻譯工具），掛在 /translate
│   └── src/lib/              site 設定、資料載入
├── data/
│   ├── LICENSE               CC BY-SA 4.0
│   └── mods/<modId>/
│       ├── mod.json
│       ├── en_us.json
│       └── zh_tw.json
├── scripts/
│   └── validate-data.ts      CI 資料驗證
└── docs/
```

## 3. 資料格式

### 3.1 `mod.json`（以 zod schema 驗證，schema 位於 `packages/core/src/catalog/schema.ts`）

```json
{
  "modId": "create",
  "name": "Create",
  "nameZh": "機械動力",
  "aliases": ["create mod"],
  "summary": "以齒輪與動力學打造自動化機械。",
  "authors": ["simibubi"],
  "links": {
    "modrinth": "https://modrinth.com/mod/create",
    "curseforge": "https://www.curseforge.com/minecraft/mc-mods/create",
    "source": "https://github.com/Creators-of-Create/Create"
  },
  "modVersion": "6.0.6",
  "mcVersions": ["1.20.1", "1.21.1"],
  "loaders": ["forge", "neoforge", "fabric"],
  "format": "json",
  "translation": {
    "status": "reviewed",
    "license": "CC-BY-SA-4.0",
    "source": { "name": "ModLangForge 貢獻者", "url": null },
    "contributors": ["github-username"]
  },
  "updatedAt": "2026-10-15"
}
```

| 欄位 | 規則 |
|---|---|
| `modId` | 必填，`^[a-z0-9_.-]+$`，必須等於資料夾名稱 |
| `name` | 必填，英文名稱 |
| `nameZh` | 選填，常見中文名 |
| `aliases` | 選填，搜尋用別名 |
| `summary` | 必填，繁中一句話，≤ 120 字 |
| `links` | 至少一個網址；只接受 `https://` |
| `mcVersions` | 必填，至少一個，值須存在於 `PACK_FORMATS` |
| `loaders` | `forge` / `neoforge` / `fabric` / `quilt` 子集合，至少一個 |
| `format` | `json` 或 `lang` |
| `translation.status` | `machine`（機器翻譯・待校對）/ `partial`（部分校對）/ `reviewed`（已校對） |
| `translation.license` | SPDX 字串，例如 `CC-BY-SA-4.0`、`CC-BY-NC-SA-4.0` |
| `translation.source` | 出處名稱與網址（自製時 url 為 null） |
| `updatedAt` | `YYYY-MM-DD` |

### 3.2 `en_us.json` / `zh_tw.json`

- 一般 Minecraft 語言檔 JSON（`.lang` 格式模組也以 JSON 儲存，匯出時依 `format` 序列化）。
- `zh_tw.json` 的每個 key 必須存在於 `en_us.json`；缺少的 key 視為未翻譯。
- 統計（完成度、格式碼警告）於建置時以 `projectStats` 計算，不存在檔案中。

### 3.3 轉換

`packages/core/src/catalog/toProject.ts`：
`catalogToProject(meta: CatalogMod, en: Record<string,string>, zh: Record<string,string>): ModProject` — 依 `en_us` key 順序建立 entries，供 `projectStats` 與 `exportProjects` 使用。

## 4. 頁面

所有頁面由 Astro 靜態產生；互動部分用 React islands（`client:visible` / `client:load`）。

| 路徑 | 內容 |
|---|---|
| `/` | 標語、搜尋框（island）、統計（模組數、譯文條數）、最近更新、完成度最高；搜尋無結果時顯示「找不到？上傳 jar 自己翻」→ `/translate` |
| `/mods/` | 全部模組列表，依名稱排序，可依載入器與 MC 版本篩選（island，客戶端篩選） |
| `/mods/<modId>/` | 名稱（英／中）、摘要、作者、連結、支援版本、載入器、完成度條、翻譯狀態徽章、授權與出處；按鈕：「下載資源包」（選 MC 版本）、「加入合併包」、「在 GitHub 修正」、「回報問題」；前 50 條譯文預覽（靜態 HTML，有助 SEO） |
| `/pack/` | 合併包：列出已勾選模組（localStorage），可移除、選 MC 版本、下載合併資源包 |
| `/translate/` | 現有翻譯工具（拖入 jar、翻譯、匯出）；額外提供「打包成貢獻檔」：下載 `<modId>/mod.json`（預填）＋`en_us.json`＋`zh_tw.json` 的 zip 與投稿說明連結 |
| `/about/` | 網站介紹、如何貢獻、資料授權、出處列表 |
| `/404` | 繁中 404，附搜尋框 |

### 4.1 下載行為

- 下載 island 取得 `/api/v1/mods/<modId>.json`，以 `catalogToProject` → `exportProjects` 在瀏覽器內產生 zip。
- 單一模組：`kind: 'merged-pack'`，檔名 `<modId>-zh_tw-<mcVersion>.zip`。
- 合併包：`kind: 'merged-pack'`，檔名 `ModLangForge-zh_tw-<mcVersion>.zip`。
- 未翻譯 key：`keep-source`（保留英文）。
- MC 版本下拉預設為該模組 `mcVersions` 的最新一個；合併包預設為所選模組共同支援的最新版本，若無共同版本則取 `DEFAULT_MC_VERSION` 並顯示提示。
- 資源包描述：`ModLangForge 繁中翻譯 · <日期>`。

### 4.2 搜尋

- 建置後以 Pagefind 建立索引（索引模組頁的名稱、中文名、別名、摘要、modId）。
- 首頁搜尋 island 使用 Pagefind JS API；結果顯示模組名稱、中文名、完成度。
- 無結果時顯示 `/translate` 入口與「到 GitHub 提出翻譯需求」連結。

### 4.3 合併包購物車

- 以 localStorage 儲存 modId 陣列（key：`mlf.cart.v1`），讀寫包在 try/catch；不可用時退回記憶體。
- 頂部導覽列顯示購物車數量徽章。

## 5. 靜態 API（`/api/v1/`）

建置時產生的 JSON，供下載 island 與未來模組端使用：

| 端點 | 內容 |
|---|---|
| `/api/v1/index.json` | `{ version: 1, generatedAt, mods: [{ modId, name, nameZh, mcVersions, loaders, status, percent, updatedAt }] }` |
| `/api/v1/mods/<modId>.json` | `{ version: 1, meta: CatalogMod, en_us: {...}, zh_tw: {...} }` |

API 版本號寫在路徑與內容中；欄位只增不減。

## 6. SEO

- 每頁 `<title>`：模組頁為 `「<name>（<nameZh>）繁體中文翻譯下載 | ModLangForge」`。
- `meta description`、canonical、Open Graph、`lang="zh-Hant-TW"`。
- `@astrojs/sitemap` 產生 sitemap；`robots.txt` 指向 sitemap。
- 模組頁靜態輸出譯文預覽表格，讓搜尋引擎可索引中文內容。
- 網站網址由 `SITE_URL` 設定（`apps/site/src/lib/config.ts`，預設 `https://modlangforge.pages.dev`）。

## 7. 貢獻流程與 CI

- 「在 GitHub 修正」連結：`https://github.com/<REPO>/edit/main/data/mods/<modId>/zh_tw.json`；`REPO` 由設定檔提供。
- 「回報問題」：預填標題的 GitHub new issue 連結。
- GitHub Actions（PR 與 push main）：`npm ci` → lint → 單元測試 → `npm run validate:data` → 建置網站。
- `validate:data` 失敗條件：`mod.json` 不符 schema、資料夾名與 `modId` 不一致、JSON 無法解析、`zh_tw` 含 `en_us` 沒有的 key。格式碼不一致**不會**失敗，但輸出 GitHub Actions `::warning` 註記（列出檔案與 key）。
- 部署：Cloudflare Pages 連接 GitHub repo，建置指令 `npm run build -w apps/site`，輸出 `apps/site/dist`。PR 自動產生預覽網址。

## 8. 錯誤處理

- 下載失敗（取 API 失敗、打包失敗）：island 內顯示繁中錯誤訊息與重試按鈕，開發模式 `console.error` 詳細錯誤。
- 購物車中的 modId 已不存在：顯示「此模組已下架」並可移除。
- Pagefind 載入失敗：搜尋框改為連到 `/mods/` 列表。
- 建置時資料不合法：建置直接失敗並列出原因（與 CI 驗證相同函式）。

## 9. 安全

- 純靜態站，無伺服器端程式、無祕密金鑰。
- 外部連結一律 `rel="noopener noreferrer"`；`mod.json` 的網址只允許 `https://`。
- 所有資料以文字節點輸出，不使用 `set:html` / `dangerouslySetInnerHTML`。
- 設定 `_headers`：`Content-Security-Policy`（default-src 'self'）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`。
- `/translate` 維持原規格：檔案不上傳、大小限制、命名空間檢查。

## 10. 示範資料

第一階段放 3 個模組，覆蓋不同情境（內容為自行撰寫的少量 key，不複製第三方譯文）：

| modId | 情境 |
|---|---|
| `create` | 完整、`reviewed`、多載入器 |
| `jei` | 部分翻譯、`partial` |
| `examplelegacy` | `.lang` 格式、1.12.2、`machine` |

## 11. 測試

- `packages/core`：既有 59 個測試全數保留；新增 `catalog/` schema 與 `catalogToProject` 測試；覆蓋率 ≥ 80%。
- `scripts/validate-data`：以暫存資料夾 fixture 測試每個失敗條件。
- `apps/site`：
  - island 元件測試（Vitest + Testing Library）：購物車、下載按鈕、搜尋無結果狀態。
  - 翻譯工具既有測試搬移後須全數通過。
- E2E（Playwright，對 `astro preview`）：搜尋 → 模組頁 → 下載單包並驗證 zip；加入兩個模組 → `/pack` → 下載合併包並驗證；搜尋不存在模組 → 出現 `/translate` 入口。
