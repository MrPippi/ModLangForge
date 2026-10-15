# 第三階段：社群譯文建議與站內審核 — 設計規格

- 日期：2026-10-15
- 狀態：待審閱
- 前置：第一階段（目錄／下載／翻譯工具）、第二階段（LLM 預翻）已上線於 https://modlangforge.pages.dev

## 1. 目標

1. **開放社群協作**：任何人（含未登入）可對單條譯文提出修改建議；登入者獲得署名。
2. **維護者工具**：管理員／審核者在站內審核建議、直接編輯譯文、將模組標為「已校對」，以批次方式發佈回 repo。
3. **為成長預留空間**：平台遷至 Cloudflare Workers；商業邏輯與平台解耦；身分模型可擴充登入來源。

### 成功標準

- 未登入玩家可在 1 分鐘內對任一條譯文送出建議（含 Turnstile）。
- 管理員可在 `/admin/` 審核並按一次「發佈」產生**單一** commit，約 2 分鐘後上線。
- 已發佈的貢獻在 `/contributors/` 與模組頁可見署名。
- repo 可維持私人；網站不再依賴 GitHub 編輯／回報連結。

### 非目標（本階段不做）

整合包上傳比對、Email／Discord 通知、每日自動發佈、多語言、Minecraft 伺服器驗證（列為 3.1，見 §10）。

## 2. 已決定事項

| 決策 | 選擇 | 理由 |
|---|---|---|
| 投稿方式 | 免登入可送建議；登入者署名 | 門檻最低，仍保留署名誘因 |
| 發佈方式 | 核准後暫存，管理員手動批次發佈 | 控制上線時機，節省建置次數 |
| 平台 | 單一 Cloudflare Worker（靜態資產＋API）＋D1 | Cloudflare 新專案主推方向；付費方案可擴至 10 萬檔案 |
| 網域 | 自訂網域（使用者購買）；pages.dev 301 轉址 | 網址乾淨、不綁平台、SEO |
| 登入 | Discord、GitHub；資料模型預留 `minecraft` 等來源 | Discord 為台灣 MC 社群主力 |
| repo 寫入 | GitHub App（僅安裝於本 repo，contents 讀寫） | 不過期、權限最小、commit 以 bot 身分顯示 |

## 3. 架構

```
瀏覽器 ──► Worker「modlangforge」(自訂網域)
            ├─ run_worker_first 路徑
            │   /api/v1/auth/*         Discord／GitHub OAuth、登出、目前使用者
            │   /api/v1/suggestions*   送出、查詢
            │   /api/v1/me*            個人資料
            │   /api/v1/admin/*        審核、編輯、發佈、角色、封鎖
            │       └─► D1、GitHub API（App installation token）、Turnstile siteverify
            └─ 其他路徑 → 靜態資產 apps/site/dist（含既有 /api/v1/*.json、_headers、404 頁）
```

### 模組切分

| 位置 | 職責 | 依賴 |
|---|---|---|
| `packages/core/src/review/` | 純函式：建議驗證、套用變更、衝突偵測、commit 訊息與貢獻者合併 | 既有 `validate`、`catalog` |
| `apps/worker/` | Hono 路由、身分／權限、D1 存取（repository 介面）、GitHub／Turnstile／OAuth 轉接 | `@mlf/core`、Workers runtime |
| `apps/site/` | 新增 islands：建議表單、模組條目搜尋、`/admin/`、`/me/`、`/contributors/` | 呼叫 `/api/v1/*` |
| `migrations/` | D1 schema migrations | — |

原則：Worker 只做轉接；任何可離開 Workers 測試的邏輯一律進 `packages/core`。

### 設定與秘密

- `wrangler.jsonc`：`assets.directory = apps/site/dist`、`not_found_handling = "404-page"`、`run_worker_first = ["/api/v1/auth/*", "/api/v1/suggestions*", "/api/v1/me*", "/api/v1/admin/*"]`、D1 綁定 `DB`。
- Secrets（`wrangler secret`，不入版控）：`DISCORD_CLIENT_ID/SECRET`、`GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_APP_CLIENT_ID/SECRET`、`GITHUB_INSTALLATION_ID`、`TURNSTILE_SECRET`、`SESSION_SECRET`、`IP_HASH_SALT`。
- 一般變數：`SITE_URL`、`REPO`、`ADMIN_BOOTSTRAP`（如 `github:MrPippi`）、`GITHUB_API_BASE`（測試時指向假伺服器）。
- 啟動時驗證必要 secrets 存在，缺少即回 500 並記錄（不洩漏名稱給前端）。

## 4. 資料模型（D1）

```sql
users(
  id INTEGER PK, display_name TEXT NOT NULL, minecraft_name TEXT, minecraft_uuid TEXT,
  minecraft_verified INTEGER NOT NULL DEFAULT 0,          -- 3.1 才可能為 1
  role TEXT NOT NULL CHECK(role IN ('admin','reviewer','contributor')) DEFAULT 'contributor',
  public INTEGER NOT NULL DEFAULT 1, banned INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)

identities(
  provider TEXT NOT NULL CHECK(provider IN ('github','discord','minecraft')),
  provider_user_id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT, linked_at TEXT NOT NULL, PRIMARY KEY(provider, provider_user_id))

suggestions(
  id INTEGER PK, mod_id TEXT NOT NULL, key TEXT NOT NULL,
  base_target TEXT,                 -- 送出當下站上譯文（null = 未翻譯）
  proposed TEXT NOT NULL, note TEXT, format_warning INTEGER NOT NULL DEFAULT 0,
  author_user_id INTEGER REFERENCES users(id), author_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','superseded','conflict','published')),
  reviewer_id INTEGER REFERENCES users(id), review_note TEXT,
  batch_id INTEGER REFERENCES publish_batches(id), created_at TEXT NOT NULL, reviewed_at TEXT)
  -- INDEX(status, mod_id), INDEX(mod_id, key), INDEX(author_user_id)

mod_status_changes(id INTEGER PK, mod_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('partial','reviewed')),
  created_by INTEGER NOT NULL, batch_id INTEGER, created_at TEXT NOT NULL)

publish_batches(id INTEGER PK, commit_sha TEXT, created_by INTEGER NOT NULL,
  suggestion_count INTEGER NOT NULL, created_at TEXT NOT NULL)

rate_events(subject TEXT NOT NULL, created_at TEXT NOT NULL)  -- subject = user:<id> 或 ip:<hash>
blocked_subjects(subject TEXT PK, reason TEXT, created_at TEXT NOT NULL)
```

- 管理員直接編輯 = 建立 `status='approved'`、`reviewer_id=自己` 的建議，走同一發佈流程。
- 登入 session：HMAC 簽章 cookie（user id、session_version、到期），無 session 表；角色變更或封鎖時遞增 `users.session_version`，使舊 cookie 失效。
- `author_hash = SHA-256(IP_HASH_SALT + IP)`，不儲存原始 IP。

## 5. 流程

### 5.1 送出建議

1. 模組頁預覽表每列加「建議修改」；另提供「搜尋本模組所有條目」（讀既有 `/api/v1/mods/<id>.json`，前端過濾）。
2. 表單顯示原文、目前譯文，輸入新譯文與備註，附 Turnstile。
3. 前後端皆以 `checkFormat` 檢查格式碼：不一致時提示，仍可送出並標 `format_warning`。
4. 後端拒絕：key 不存在於該模組、與目前譯文相同、空白、長度 > max(原文×4, 50) 或 > 1000 字、Turnstile 失敗、頻率超限、主體被封鎖。
5. 同一主體對同一 key 已有 pending 建議時，以新內容覆蓋舊建議（避免洗版）。

### 5.2 審核（審核者／管理員，`/admin/`）

- 待審清單依模組分組，可篩選；同 key 多個建議並列比較。
- 動作：核准、修改後核准、退回（可附理由）。核准其一時，同 key 其他 pending 標 `superseded`。
- 直接編輯：開啟模組完整譯文表（虛擬捲動，沿用翻譯工具元件），修改即產生已核准建議。
- 模組狀態：標為「已校對」或改回「部分完成」。

### 5.3 發佈（僅管理員）

1. 取得 GitHub App installation token。
2. 讀取受影響模組的 `zh_tw.json`、`mod.json`（Contents API，記下 base commit SHA）。
3. `packages/core/review` 套用：逐條比對 `base_target` 與 repo 現值；不同則標 `conflict` 並跳過。
4. 合併署名：已登入且 `public=1` 的作者以顯示名稱加入 `mod.json` 的 `translation.contributors`（去重、保序）；模組狀態變更同步寫入 `translation.status`，`updatedAt` 更新。
5. 以 Git Data API 建 tree → commit（訊息列出條數、模組與貢獻者）→ 以 base SHA 做 fast-forward 更新 `main`。若 `main` 已前進，重試整個流程一次，仍失敗則回報。
6. 成功：建 `publish_batches`，相關建議標 `published`。失敗：全部維持 `approved`，可重試；不會部分發佈。
7. push 觸發 Workers Builds 重新部署。

### 5.4 登入與個人資料

- Discord（scope `identify`）、GitHub（GitHub App 使用者授權，僅讀身分）。OAuth `state` 存於短效簽章 cookie 防 CSRF。
- 首次登入建立 `users`；已登入者可綁定第二種來源到同一帳號。
- `ADMIN_BOOTSTRAP` 指定的身分首次登入時設為 admin。
- `/me/`：顯示名稱、Minecraft 名稱（自填、標「未驗證」，以 Mojang 公開 API 確認存在並取 UUID 顯示頭像）、是否公開、我的建議與狀態。

### 5.5 署名

- `/contributors/`：依已發佈條數排名（僅 `public=1` 且未封鎖），顯示頭像、名稱、貢獻模組；`/contributors/<id>/` 個人頁。
- 頁面由 Worker API 提供資料、前端 island 呈現（不需重新建置即更新）。
- 匿名建議可被採用，但不署名。

## 6. 權限

| 動作 | 匿名／一般貢獻者 | 審核者 | 管理員 |
|---|---|---|---|
| 送出建議、查詢自己的建議 | ✓ | ✓ | ✓ |
| 審核、直接編輯、模組狀態 | | ✓ | ✓ |
| 發佈 | | | ✓ |
| 角色管理、封鎖 | | | ✓ |

權限檢查集中於 Worker middleware；每支 admin API 皆有拒絕測試。

## 7. 安全與防濫用

- 寫入 API：檢查 `Origin` 等於 `SITE_URL`，並驗證雙重提交 CSRF token；cookie `HttpOnly; Secure; SameSite=Lax`。
- Turnstile 伺服器端驗證；頻率：每主體每小時 30 條建議（`rate_events`，定期清除 > 24h 紀錄）。
- 輸入：zod 驗證所有請求；輸出一律以文字節點呈現（React 預設跳脫），不插入 HTML。
- 回應格式 `{ ok, data, error }`；錯誤訊息中文且不含內部細節，詳細內容記錄於 Workers Logs。
- CSP：沿用雜湊式 CSP；新增 Turnstile 所需來源（`challenges.cloudflare.com` 於 script-src、frame-src）。
- GitHub App 私鑰與所有 OAuth secret 僅存 Worker secrets。

## 8. 遷移步驟（每步可回退）

1. 新增 `wrangler.jsonc`、`apps/worker`、`migrations/`；本機 `wrangler dev` 可同時提供靜態站與 API。
2. 建立 D1，部署至 workers.dev 冒煙測試；舊 Pages 不受影響。
3. 使用者購買網域並交由 Cloudflare 管理 → 綁定 Worker 自訂網域，`SITE_URL` 改為新網域。
4. 建立 Discord 應用程式與 GitHub App（使用者依步驟操作），設定 secrets。
5. Workers Builds 連 GitHub（push `main` 自動部署；build 前套用 D1 migrations）。
6. Pages 專案改為僅含 `_redirects`（`/* https://<網域>/:splat 301`），斷開其 Git 自動部署。
7. 移除網站上的 GitHub 編輯／回報連結，改為站內「建議修改」。

## 9. 測試策略（覆蓋率 ≥ 80%）

| 層級 | 工具 | 範圍 |
|---|---|---|
| `packages/core/review` | Vitest | 驗證規則、套用、衝突、署名合併、commit 訊息 |
| `apps/worker` | Vitest + `@cloudflare/vitest-pool-workers`（本機 D1） | 每支 API、權限拒絕、頻率限制、CSRF／Origin、OAuth state、發佈（fetch mock GitHub）、Turnstile 測試金鑰 |
| `apps/site` islands | Vitest + Testing Library | 建議表單、條目搜尋、管理頁、個人頁、貢獻者頁 |
| E2E | Playwright 對 `wrangler dev` | 匿名送建議 → 管理員登入（測試用登入路由，僅在測試環境啟用）→ 核准 → 發佈 → 假 GitHub 收到預期 commit |

## 10. 未來：3.1 Minecraft 伺服器驗證

- 架設驗證用 Minecraft 伺服器（`verify.<網域>`，`minecraft-protocol`，online-mode），玩家連線經 Mojang session server 驗證後，伺服器產生 6 碼一次性驗證碼（10 分鐘），以 HMAC 簽章請求送至 Worker，再踢出玩家並顯示驗證碼。
- 玩家於 `/me/` 輸入驗證碼 → 綁定 `identities(provider='minecraft', provider_user_id=UUID)`，`minecraft_verified=1`；亦可作為登入方式。
- 需非 Cloudflare 主機（約每月 US$4–6）與維護；本階段資料模型已預留，不需 schema 變更。

## 11. 限制與監控

- Workers 靜態資產：免費方案每版本 2 萬檔、付費 10 萬檔；建置時記錄 `dist` 檔案數，超過 15,000 於 CI 警告。
- Workers Builds 建置次數依方案計；批次發佈可控制次數。
- D1 免費額度足以支撐初期流量；`rate_events` 定期清理。

## 12. 需使用者處理

1. 購買自訂網域。
2. 依提供步驟建立 Discord 應用程式與 GitHub App。
3. 同意部署與遷移各步驟（push `main` 即發佈）。

## 13. 與進行中工作的關係

`feat/source-versions`（sourceVersions schema）若先合併，`review` 模組套用變更時需一併處理對應欄位；實作計畫撰寫時以當時 `main` 為準。
