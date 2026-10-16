# 第三階段 3C1：個人資料、貢獻者頁與審核後台收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登入者在 `/me/` 設定顯示名稱、是否公開署名、自填 Minecraft 名稱（經 Mojang 公開 API 確認存在、取 UUID 顯示頭像、標「未驗證」）並查看自己的建議；任何人可在 `/contributors/` 看到依已發佈條數排名的公開貢獻者、在 `/contributors/<id>/` 看個人頁，模組頁連到該模組的貢獻者；同時處理 3B1／3B2 延後、會影響使用者的小問題。

**Architecture:** 名稱清理與驗證是 `packages/core/src/review/profile.ts` 的純函式（同時用在 `/me` 改名、新使用者建立與發佈署名）。Worker 新增 `UserRepo` 的個人資料方法、`ContributorRepo`（只讀 `suggestions.status='published'` 且作者公開、未停權）、Mojang 轉接（`MOJANG_API_BASE` 可替換，測試與 E2E 用同一個假 Mojang）與 `/api/v1/me/profile`、`/api/v1/me/minecraft`、`/api/v1/contributors*` 路由；`/contributors/<id>/` 由 Worker 回傳靜態頁殼 `/contributors/profile/`，資料由 island 向 API 取得，不需重新建置。所有新 UI 在 3C 切換網域前仍受 `SUGGEST_ENABLED` 旗標控制，所以本計畫可安全合併到 `main`（Pages 仍以旗標關閉建置正式站）；移除旗標屬 3C2。

**Tech Stack:** Hono 4.13.12、zod 4、D1、React 18、Astro 7、Vitest 5、Testing Library、Playwright、tsx。**不新增任何 npm 依賴、不新增 D1 migration**（`users.minecraft_name`、`minecraft_uuid`、`minecraft_verified`、`public` 已在 `migrations/0001_initial.sql`）。

**Spec:** `docs/superpowers/specs/2026-10-15-phase3-community-review-design.md`

**前置計畫：** `docs/superpowers/plans/2026-10-16-phase3b2-review-and-publish.md`（已合併，`main` = a3e08ed 或之後）。**後續計畫：** `docs/superpowers/plans/2026-10-16-phase3c2-cutover-and-builds.md`（Workers Builds、網域切換、移除旗標）。

## 範圍

- 規格 §5.4 `/me/`、§5.5 `/contributors/` 與個人頁、§1「已發佈的貢獻在 `/contributors/` 與模組頁可見署名」、§9 個人頁與貢獻者頁的 island 測試與 E2E。
- 3B1／3B2 延後項目中影響使用者者（見「延後項目分流」）。
- **不在本計畫：** Workers Builds、網域切換、移除 `PUBLIC_SUGGEST_ENABLED` 與 GitHub 編輯／回報連結、CI 檔案數警告（→ 3C2）；3.1 Minecraft 伺服器驗證（規格 §10，`minecraft_verified` 在 3C 一律為 0）。

## 為什麼可以先合併到 main（與 3C2 的順序）

- 正式站 https://modlangforge.com 目前仍是 Cloudflare **Pages**，push `main` 會以 `PUBLIC_SUGGEST_ENABLED` 未設定的方式重建；Pages 上沒有 Worker API。
- 因此本計畫所有會呼叫 Worker API 的新 UI（`/me/` 內容、`/contributors/` 內容、導覽列「貢獻者」、模組頁「查看本模組的社群貢獻者」、帳號選單的「個人資料」）都只在 `SUGGEST_ENABLED` 為真時渲染；旗標關閉時 `/me/`、`/contributors/` 只顯示「尚未啟用」文字。Task 7 有一步以旗標關閉建置並檢查 `dist`，證明 Pages 版不會出現這些入口。
- Worker（workers.dev）在 3C2 接上 Workers Builds 之前不會自動更新；本計畫不需要部署。若想先在 workers.dev 預覽，沿用 3B2 Task 11 Step 5 的手動部署指令（需使用者同意）。

## 設計決定（規格未明訂處）

| 情況 | 決定 |
|---|---|
| 顯示名稱規則 | NFC 正規化；控制字元（`\p{Cc}`）、零寬空白、行／段分隔、雙向文字控制與 BOM 換成空白；連續空白合併、去頭尾；清理後 1–32 字（code point）。保留 ZWJ（emoji）。 |
| 登入來源提供的名稱 | 新使用者建立時以同一清理函式處理、上限沿用 64；不強制 32（使用者可自行改短）。 |
| 發佈署名（3B2 M7） | `mergeContributors` 對新名字套用同一清理，換行無法偽造 commit trailer。既有 `mod.json` 內的名字不改。 |
| 名稱唯一性 | 不要求唯一；冒名風險以「Minecraft 名稱未驗證」標示與管理員停權處理。 |
| Minecraft 名稱格式 | `^[A-Za-z0-9_]{1,16}$`；儲存 Mojang 回傳的正確大小寫與 32 位小寫 hex UUID；`minecraft_verified` 一律 0。 |
| Mojang 端點 | `GET {MOJANG_API_BASE}/users/profiles/minecraft/<name>`，`MOJANG_API_BASE` 正式為 `https://api.mojang.com`；200 → 找到；204／404 → 不存在；429 → 503 `mojang_busy`；其他或連線失敗 → 502 `mojang_failed`。只送出名稱與 `User-Agent: ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)`。 |
| Mojang 查詢頻率 | 每位使用者每小時 10 次（`rate_events` 主體 `mc:user:<id>`）；名稱與目前相同（不分大小寫）時不查詢、不計次；清除名稱不計次。 |
| 頭像 | `https://mc-heads.net/avatar/<uuid>/<size>`（依 UUID，不依名稱）；`referrerpolicy="no-referrer"`、`loading="lazy"`；無 UUID 時顯示名稱首字。CSP `img-src` 加入 `https://mc-heads.net`。 |
| `/me` API 形狀 | `GET /api/v1/me` 不變（仍給 AccountMenu 與 CSRF 用）；新增 `GET/POST /api/v1/me/profile` 與 `POST /api/v1/me/minecraft`，回應皆為 `{ profile }`。改名不遞增 `session_version`（session 只存 id，每次請求重讀名稱）。 |
| 跨 island 同步 | `/me/` 存檔成功後 `resetMe()` 並在 `window` 發出 `mlf:me-changed`，AccountMenu 監聽後重新載入右上角名稱。 |
| 貢獻者排名 | 依 `status='published'` 條數，次序：條數多者先 → 最早一條已發佈建議的 id 小者先 → user id；最多 100 名；可用 `?modId=` 篩選。 |
| 個人頁可見性 | 非公開、停權或沒有任何已發佈貢獻 → 404（避免以 id 列舉所有帳號）。 |
| `/contributors/<id>/` 路由 | Worker 對 `/contributors/<數字>/` 回傳 `/contributors/profile/` 頁殼（200）；`/contributors/<數字>` 301 到加斜線版本；其餘交給靜態資產（含 404 頁）。`run_worker_first` 加入 `/contributors/*`。 |
| 模組頁署名 | 沿用 `mod.json` 的 `translation.contributors`（已由發佈寫入，含原譯者）；另加「查看本模組的社群貢獻者」連到 `/contributors/?mod=<id>`。不在靜態頁嘗試把名字對應到帳號。 |
| 公開開關的效果 | 關閉後立即從排名與個人頁消失、之後的發佈不署名；已寫入 `mod.json` 與 git 歷史的名字不移除（UI 說明）。 |
| 撤回模組狀態變更（3B2 M5） | `DELETE /api/v1/admin/mods/status-changes/:id`（`review` 權限）只刪 `batch_id IS NULL` 的列；有未過期發佈鎖時 409 `publish_in_progress`。 |
| 審核佇列截斷（3B2 M8） | API 多取一列判斷，回 `truncated: boolean`；UI 顯示提示。 |

## 延後項目分流

**納入本計畫：**

| 來源 | 項目 | Task |
|---|---|---|
| 3B2 M7 | 署名與 commit 訊息中的控制字元 | 1 |
| 3B1 M8（部分） | `/api/v1/me*` 與新路由其他方法回 405 | 4、5 |
| 3B1 M4 | 登出失敗沒有回饋（含 `bad_csrf` 重取 token 重試一次） | 8 |
| 3B1 T10 | 帳號選單 `<details>` 不會因 Escape、點外面、開啟對話框或登出而關閉 | 8 |
| 3B1 T10 | `auth_error` 參數不會從網址移除 | 8 |
| 3B2 M5 | 模組狀態變更無法撤回（缺模組的狀態變更永遠卡在批次前段） | 9、10 |
| 3B2 M6 | 推送後寫入 D1 失敗時未記錄 commit sha | 9 |
| 3B2 M8 | 審核佇列 500 條上限靜默截斷 | 9、10 |
| 3B2 T7 | 「封鎖此來源」沒有確認步驟 | 10 |
| 3B2 M9 | 同一 key 儲存中再次儲存被靜默丟棄 | 10 |
| 3B2 final | 直接編輯未儲存草稿在卸載／切換分頁時靜默捨棄（保留此取捨，加上明確說明） | 10 |

**已完成，關閉：** AdminUserView identities 排序（3B2 M10，`d1Users.ts` 子查詢已 `ORDER BY i.linked_at, i.provider`）；3B1 T7「同一身分同時首次登入 500」（已在 `create` 以回查處理）。

**不在 3C（一行理由）：**

- 3B1 M3 登出不撤銷 token：規格採無 session 表設計，已記錄；「登出所有裝置」留待需要時以遞增 `session_version` 實作。
- 3B1 M5 匿名「我的建議」同 IP 互見：已裁定接受（內容發佈後本就公開、`note` 不外露）。
- 3B1 T1 `isSubject` 允許超過 `MAX_SAFE_INTEGER` 的 16 位數：主體是字串，不會出錯。
- 3B1 T6 `issueOAuthState` 不重新清理 `returnTo`：唯一呼叫者已清理且值有簽章。
- 3B1 T7 綁定模式未綁定起始 uid：需同一 10 分鐘視窗內他人在同瀏覽器完成登入，且每次 OAuth 開始會覆寫 state。
- 3B1 T9 兩位管理員同時互相降級可能剩零位管理員：需兩人同時操作，可由 D1 console 或 `ADMIN_BOOTSTRAP` 恢復。
- 3B1／3B2 各項只缺測試斷言、描述文字、文件註解者（例如 405 只測 GET、`block_not_found` 未斷言、`superseded` 排序、`localeCompare`）：不影響行為。
- 3B2 M3 installation token 未限縮：Bot App 只安裝在本 repo 且只有 Contents 權限，限縮不會再縮小範圍。
- 3B2 T5 假 GitHub 的 `sha`／`apiBase` 未驗證、錯誤標籤含 sha：由設定控制、不是秘密。
- 3B2 T6 固定字母順序批次可能被同一模組卡住：Task 9 的撤回與既有「退回」即可解除。
- 3B2 T7 tablist 方向鍵、焦點移轉、狀態訊息不會清除、`strings` 載入失敗顯示「…」：管理頁僅少數工作人員使用，留待後台 UX 整理。
- 3B2 T8／T9 `busy` 未放在 `finally`：`apiSend` 不會丟出例外。
- 同模組同日重複的狀態變更造成只改 `updatedAt` 的 commit：Task 9／10 的撤回可手動排除，不再加自動規則。

## Global Constraints

- 不新增 npm 依賴；不新增 migration。
- 外部請求只有 Mojang：只送 Minecraft 名稱，`User-Agent: ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)`；**不得送出 email、IP、使用者 id 或任何 cookie**；base 由 `MOJANG_API_BASE` 設定（測試與 E2E 指向假 Mojang），測試的 `deps.fetch` 預設禁止對外連線。
- 顯示名稱：清理後 1–32 字；登入來源名稱清理後截到 64 字；署名清理同一規則。
- `minecraft_verified` 在 3C 一律寫 0；UI 一律標「未驗證」。
- 貢獻者資料只來自 `suggestions.status='published'`、`author_user_id` 非 NULL、`users.public=1`、`users.banned=0`。
- 所有寫入 API 沿用 `requireWrite`（Origin＋CSRF）；需登入的路由用 `requireLogin`（401 `login_required`）；所有輸入以 zod 驗證；回應 `{ ok, data, error }`，錯誤訊息中文且不含內部細節。
- 所有會呼叫 Worker API 的新 UI 在 3C2 前受 `SUGGEST_ENABLED` 控制（見上節）。
- 前端一律經 `apps/site/src/islands/api.ts`；新元件只用語意 class（`text-muted`、`text-danger`、`text-warn`、`bg-surface`、`border-line` 等）；文案集中在各功能的 `strings.ts` 或 `i18n/zh-TW.ts`。
- 不可變資料；檔案 < 400 行；函式 < 50 行。
- Commit 訊息結尾空一行後加：`Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX`

## Review Focus

1. **含換行、雙向控制字元、零寬空白或只有空白的名稱**（來自 Discord／GitHub 或使用者自填）：存入前清理或以 400 拒絕；發佈 commit 不會因名稱多出一行（無法偽造 `Co-authored-by:`）→ Task 1、Task 2、Task 4 測試。
2. **Mojang 的各種回應**：大小寫不同的名稱、查無此人、429、5xx、連線失敗、回應格式不對、短時間反覆查詢 → 找到時存正確大小寫，其他情況回清楚的中文錯誤、不寫入、不無限打 Mojang → Task 3、Task 4 測試。
3. **不該出現的人出現在排行**：匿名建議、未發佈建議、關閉公開或被停權的使用者，在排名、模組篩選與個人頁都不可見；關閉公開立即生效 → Task 5 測試。
4. **貢獻者個人頁網址的變形**：`/contributors/12`（無斜線）、`/contributors/abc/`、不存在或非公開的 id、直接開 `/contributors/profile/` → 301、404 頁或「找不到」，不會白屏 → Task 5、Task 7 測試。
5. **Pages 正式站（旗標關閉）出現呼叫 Worker 的入口**：導覽「貢獻者」、帳號選單、模組頁連結都不得出現，`/me/`、`/contributors/` 只顯示「尚未啟用」→ Task 7 Step 6 以旗標關閉建置並檢查 `dist`。

---

## File Structure

```
packages/core/src/review/
  profile.ts               cleanName、sanitizeName、validateDisplayName、isMinecraftName、常數
  contributors.ts          （修改）mergeContributors 套用 sanitizeName
  profile.test.ts、index.ts（修改）
apps/worker/src/
  repo/d1Profiles.ts       getProfile、updateProfile、setMinecraft
  repo/d1Contributors.ts   ranking、profile
  repo/types.ts、repo/d1Users.ts、repo/index.ts、repo/reviewTypes.ts、repo/d1Review.ts（修改）
  repo/profiles.test.ts、repo/contributors.test.ts
  mojang/client.ts、mojang/fakeMojang.ts、mojang/mojang.test.ts
  routes/meProfile.ts、routes/meProfile.test.ts
  routes/contributors.ts、routes/contributors.test.ts
  routes/me.ts、routes/adminReview.ts、routes/adminPublish.ts、publish/runPublish.ts（修改）
  routes/testLoginNames.test.ts
  auth/guard.ts、auth/resolveUser.ts、env.ts、testEnv.ts、app.ts（修改）
apps/site/src/
  components/Avatar.tsx
  me/strings.ts、me/meApi.ts、me/MeApp.tsx、me/ProfileForm.tsx、me/MinecraftForm.tsx、me/me.test.tsx
  contributors/strings.ts、contributors/contributorsApi.ts、contributors/ContributorsList.tsx、contributors/ContributorProfile.tsx、contributors/contributors.test.tsx
  islands/SuggestionList.tsx（自 MySuggestions 抽出）、islands/MySuggestions.tsx、islands/AccountMenu.tsx（修改）
  pages/me.astro、pages/contributors/index.astro、pages/contributors/profile.astro
  lib/config.ts、lib/links.test.ts、lib/siteMeta.ts、i18n/zh-TW.ts、components/Header.astro、pages/mods/[modId].astro（修改）
  admin/adminApi.ts、admin/strings.ts、admin/PublishPanel.tsx、admin/ReviewQueue.tsx、admin/SuggestionCard.tsx、admin/useDirectEdit.ts、admin/DirectEditor.tsx（修改）
apps/site/public/_headers（修改）
e2e/profile-contributors.spec.ts、e2e/fake-github.ts、playwright.config.ts（修改）
wrangler.jsonc、apps/worker/vitest.config.ts、README.md（修改）
```

---

### Task 0: 前置確認

- [ ] **Step 1:** Run: `git log origin/main --oneline | head -5`；Expected：包含 `a3e08ed`（3B2 與 e2e 修正已合併）。
- [ ] **Step 2:** Run: `npm ci && npm test && npm run test:coverage -w @mlf/worker && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`；Expected：全部通過，記下各 workspace 測試數。
- [ ] **Step 3:** Run: `git ls-files --eol | grep crlf`；Expected：無輸出（repo 一律 LF；新檔以 LF 寫入）。

---

### Task 1: core — 名稱清理、顯示名稱驗證、Minecraft 名稱格式；署名套用清理（3B2 M7）

**Files:**
- Create: `packages/core/src/review/profile.ts`、`packages/core/src/review/profile.test.ts`
- Modify: `packages/core/src/review/contributors.ts`、`packages/core/src/review/index.ts`

**Interfaces:**
- Produces:

```ts
export const DISPLAY_NAME_MAX = 32;
export const PROVIDER_NAME_MAX = 64;
cleanName(raw: string): string
sanitizeName(raw: string, max?: number /* 預設 PROVIDER_NAME_MAX */): string
export type DisplayNameRejection = 'empty' | 'too_long';
export type DisplayNameVerdict = { ok: true; name: string } | { ok: false; reason: DisplayNameRejection };
validateDisplayName(raw: string): DisplayNameVerdict
export const MINECRAFT_NAME_PATTERN: RegExp;   // /^[A-Za-z0-9_]{1,16}$/
isMinecraftName(value: string): boolean
export const MINECRAFT_UUID_PATTERN: RegExp;   // /^[0-9a-f]{32}$/
```

- [ ] **Step 1: 寫失敗測試**

```ts
// packages/core/src/review/profile.test.ts
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MAX, isMinecraftName, mergeContributors, sanitizeName, validateDisplayName } from './index';

describe('sanitizeName', () => {
  it('replaces control, zero-width and bidi characters and collapses whitespace', () => {
    expect(sanitizeName('Eve\nCo-authored-by: Mallory <m@x>')).toBe('Eve Co-authored-by: Mallory <m@x>');
    expect(sanitizeName('‮evil‬  name\t')).toBe('evil name');
    expect(sanitizeName('a\u0000b​c d')).toBe('a b c d');
  });

  it('normalizes to NFC and keeps emoji ZWJ sequences', () => {
    expect(sanitizeName('é')).toBe('é');
    expect(sanitizeName('👩‍💻 dev')).toBe('👩‍💻 dev');
  });

  it('truncates by code point without splitting surrogate pairs', () => {
    expect(sanitizeName('😀'.repeat(5), 3)).toBe('😀😀😀');
    expect([...sanitizeName('字'.repeat(80))]).toHaveLength(64);
  });
});

describe('validateDisplayName', () => {
  it('returns the cleaned name', () => {
    expect(validateDisplayName('  史蒂夫\n ')).toEqual({ ok: true, name: '史蒂夫' });
  });

  it('rejects blank and over-long names', () => {
    expect(validateDisplayName(' ​\t')).toEqual({ ok: false, reason: 'empty' });
    expect(validateDisplayName('字'.repeat(DISPLAY_NAME_MAX + 1))).toEqual({ ok: false, reason: 'too_long' });
    expect(validateDisplayName('字'.repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
  });
});

describe('isMinecraftName', () => {
  it.each(['Steve', 'jeb_', 'a', 'A'.repeat(16), 'Player_123'])('accepts %s', (name) => {
    expect(isMinecraftName(name)).toBe(true);
  });

  it.each(['', 'A'.repeat(17), 'Steve!', '史蒂夫', 'a b', 'name\n'])('rejects %j', (name) => {
    expect(isMinecraftName(name)).toBe(false);
  });
});

describe('mergeContributors', () => {
  it('sanitizes incoming names before deduping (commit trailers cannot be forged)', () => {
    expect(mergeContributors(['A'], ['Eve\nCo-authored-by: x', 'A​', null])).toEqual(['A', 'Eve Co-authored-by: x']);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/review/profile.test.ts`
Expected: FAIL（`sanitizeName` 等未匯出）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/review/profile.ts
/** 使用者自行設定的顯示名稱上限（以 Unicode code point 計） */
export const DISPLAY_NAME_MAX = 32;
/** 登入來源（Discord／GitHub）提供的名稱上限，沿用 3B1 */
export const PROVIDER_NAME_MAX = 64;

/** 控制字元、零寬空白、行／段分隔、雙向文字控制與 BOM；ZWJ（U+200D）保留給 emoji */
const UNSAFE_CHARS = /[\p{Cc}​  ‪-‮⁦-⁩﻿]/gu;

/** NFC 正規化、危險字元換成空白、連續空白合併、去頭尾 */
export function cleanName(raw: string): string {
  return raw.normalize('NFC').replace(UNSAFE_CHARS, ' ').replace(/\s+/gu, ' ').trim();
}

/** 清理後截斷到 max 個 code point（不切斷代理對） */
export function sanitizeName(raw: string, max: number = PROVIDER_NAME_MAX): string {
  return [...cleanName(raw)].slice(0, max).join('').trim();
}

export type DisplayNameRejection = 'empty' | 'too_long';
export type DisplayNameVerdict =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: DisplayNameRejection };

/** 使用者自填的顯示名稱：清理後 1–DISPLAY_NAME_MAX 字 */
export function validateDisplayName(raw: string): DisplayNameVerdict {
  const name = cleanName(raw);
  if (name === '') return { ok: false, reason: 'empty' };
  if ([...name].length > DISPLAY_NAME_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, name };
}

/** Mojang 帳號名稱：英數與底線，1–16 字 */
export const MINECRAFT_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

export function isMinecraftName(value: string): boolean {
  return MINECRAFT_NAME_PATTERN.test(value);
}

/** 本專案一律以 32 位小寫 hex（無連字號）儲存 UUID */
export const MINECRAFT_UUID_PATTERN = /^[0-9a-f]{32}$/;
```

`packages/core/src/review/contributors.ts` 的 `mergeContributors` 改為（`taipeiDate` 不變）：

```ts
import { sanitizeName } from './profile';

/** 附加新名字到尾端：清理（控制字元、雙向字元、空白）、去重、略過空值，保留既有順序 */
export function mergeContributors(existing: readonly string[], incoming: readonly (string | null)[]): string[] {
  return incoming.reduce<string[]>((acc, raw) => {
    const name = raw === null ? '' : sanitizeName(raw);
    return name === '' || acc.includes(name) ? acc : [...acc, name];
  }, [...existing]);
}
```

`packages/core/src/review/index.ts` 追加一行：

```ts
export {
  cleanName,
  DISPLAY_NAME_MAX,
  isMinecraftName,
  MINECRAFT_NAME_PATTERN,
  MINECRAFT_UUID_PATTERN,
  PROVIDER_NAME_MAX,
  sanitizeName,
  validateDisplayName,
  type DisplayNameRejection,
  type DisplayNameVerdict,
} from './profile';
```

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review && npm run lint`
Expected: PASS（含既有 `publish.test.ts` 的 `mergeContributors` 測試：`' Carol '` 仍得 `'Carol'`）；lint 無 `no-control-regex` 錯誤（使用 `\p{Cc}`）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): sanitize display names and validate Minecraft names

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 2: Worker — 個人資料存取與新使用者名稱清理

**Files:**
- Create: `apps/worker/src/repo/d1Profiles.ts`、`apps/worker/src/repo/profiles.test.ts`、`apps/worker/src/routes/testLoginNames.test.ts`
- Modify: `apps/worker/src/repo/types.ts`、`apps/worker/src/repo/d1Users.ts`、`apps/worker/src/auth/resolveUser.ts`

**Interfaces:**
- Consumes: `sanitizeName`、`PROVIDER_NAME_MAX`（Task 1）。
- Produces（`repo/types.ts`）：

```ts
export interface UserProfile {
  readonly id: number;
  readonly displayName: string;
  readonly isPublic: boolean;
  readonly minecraftName: string | null;
  readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean;
}
export interface ProfilePatch { readonly displayName?: string; readonly isPublic?: boolean }
export interface MinecraftProfile { readonly name: string; readonly uuid: string }
// UserRepo 新增：
getProfile(id: number): Promise<UserProfile | null>;
updateProfile(id: number, patch: ProfilePatch): Promise<UserProfile | null>;   // 不改 session_version
setMinecraft(id: number, profile: MinecraftProfile | null): Promise<UserProfile | null>;  // minecraft_verified 一律 0
```

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/repo/profiles.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { Repos } from './types';

const NOW = '2026-10-15T00:00:00.000Z';
const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

let repos: Repos;
beforeEach(async () => {
  const db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const newUser = () => repos.users.create({
  displayName: '史蒂夫', role: 'contributor', identity: { provider: 'github', providerUserId: '1', username: 'steve' }, now: NOW,
});

describe('UserRepo profile', () => {
  it('reads the default profile and returns null for unknown ids', async () => {
    const user = await newUser();
    expect(await repos.users.getProfile(user.id)).toEqual({
      id: user.id, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false,
    });
    expect(await repos.users.getProfile(999)).toBeNull();
  });

  it('updates only the given fields and keeps the session version', async () => {
    const user = await newUser();
    expect((await repos.users.updateProfile(user.id, { isPublic: false }))?.isPublic).toBe(false);
    expect(await repos.users.updateProfile(user.id, { displayName: '艾力克斯' })).toMatchObject({ displayName: '艾力克斯', isPublic: false });
    expect((await repos.users.findById(user.id))?.sessionVersion).toBe(0);
    expect(await repos.users.updateProfile(999, { isPublic: true })).toBeNull();
  });

  it('sets and clears the Minecraft profile, always unverified', async () => {
    const user = await newUser();
    expect(await repos.users.setMinecraft(user.id, { name: 'Steve', uuid: STEVE_UUID }))
      .toMatchObject({ minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false });
    expect(await repos.users.setMinecraft(user.id, null)).toMatchObject({ minecraftName: null, minecraftUuid: null, minecraftVerified: false });
    expect(await repos.users.setMinecraft(999, null)).toBeNull();
  });
});
```

```ts
// apps/worker/src/routes/testLoginNames.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

const LOCAL = 'http://localhost:8787';
let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

describe('new user display names', () => {
  it('stores a sanitized provider display name', async () => {
    const res = await createApp(testDeps()).request('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { ...(await writeHeaders()), Origin: LOCAL },
      body: JSON.stringify({ provider: 'discord', providerUserId: 'n1', username: 'eve', displayName: 'Eve\nCo-authored-by: x‮' }),
    }, testEnv({ DB: db, SITE_URL: LOCAL, TEST_LOGIN_ENABLED: 'true' }));
    expect(res.status).toBe(200);
    const { id } = (await readJson<{ id: number }>(res)).data;
    expect((await createD1Repos(db).users.findById(id))?.displayName).toBe('Eve Co-authored-by: x');
  });

  it('falls back to the username when the display name is only whitespace', async () => {
    const res = await createApp(testDeps()).request('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { ...(await writeHeaders()), Origin: LOCAL },
      body: JSON.stringify({ provider: 'discord', providerUserId: 'n2', username: 'bob', displayName: ' ​ ' }),
    }, testEnv({ DB: db, SITE_URL: LOCAL, TEST_LOGIN_ENABLED: 'true' }));
    const { id } = (await readJson<{ id: number }>(res)).data;
    expect((await createD1Repos(db).users.findById(id))?.displayName).toBe('bob');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo/profiles.test.ts src/routes/testLoginNames.test.ts`
Expected: FAIL（`getProfile` 不存在；名稱含換行）。

- [ ] **Step 3: 實作**

`apps/worker/src/repo/types.ts`：在 `AdminUserView` 那一行之前加入 `UserProfile`、`ProfilePatch`、`MinecraftProfile`（見 Interfaces），並在 `UserRepo` 介面最後加入：

```ts
  getProfile(id: number): Promise<UserProfile | null>;
  /** 只改傳入的欄位；不遞增 session_version（session 只存 id） */
  updateProfile(id: number, patch: ProfilePatch): Promise<UserProfile | null>;
  /** null 清除；minecraft_verified 一律 0（3.1 才會驗證） */
  setMinecraft(id: number, profile: MinecraftProfile | null): Promise<UserProfile | null>;
```

```ts
// apps/worker/src/repo/d1Profiles.ts
import type { UserProfile, UserRepo } from './types';

const PROFILE_COLUMNS = 'id, display_name, public, minecraft_name, minecraft_uuid, minecraft_verified';

interface ProfileRow {
  readonly id: number;
  readonly display_name: string;
  readonly public: number;
  readonly minecraft_name: string | null;
  readonly minecraft_uuid: string | null;
  readonly minecraft_verified: number;
}

const toProfile = (r: ProfileRow): UserProfile => ({
  id: r.id, displayName: r.display_name, isPublic: r.public === 1,
  minecraftName: r.minecraft_name, minecraftUuid: r.minecraft_uuid, minecraftVerified: r.minecraft_verified === 1,
});

export function profileActions(db: D1Database): Pick<UserRepo, 'getProfile' | 'updateProfile' | 'setMinecraft'> {
  const one = async (sql: string, ...args: unknown[]): Promise<UserProfile | null> => {
    const row = await db.prepare(sql).bind(...args).first<ProfileRow>();
    return row ? toProfile(row) : null;
  };
  return {
    getProfile: (id) => one(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ?`, id),
    updateProfile: (id, patch) => one(
      `UPDATE users SET display_name = COALESCE(?2, display_name), public = COALESCE(?3, public) WHERE id = ?1 RETURNING ${PROFILE_COLUMNS}`,
      id, patch.displayName ?? null, patch.isPublic === undefined ? null : patch.isPublic ? 1 : 0,
    ),
    setMinecraft: (id, profile) => one(
      `UPDATE users SET minecraft_name = ?2, minecraft_uuid = ?3, minecraft_verified = 0 WHERE id = ?1 RETURNING ${PROFILE_COLUMNS}`,
      id, profile?.name ?? null, profile?.uuid ?? null,
    ),
  };
}
```

`apps/worker/src/repo/d1Users.ts`：檔頭加 `import { profileActions } from './d1Profiles';`，`createD1Users` 回傳物件最後一行 `setBanned: …,` 之後加：

```ts
    ...profileActions(db),
```

`apps/worker/src/auth/resolveUser.ts`：匯入改為

```ts
import { isBootstrapAdmin, parseAdminBootstrap, PROVIDER_NAME_MAX, sanitizeName, type LoginProvider, type Role } from '@mlf/core/review';
```

刪除 `const MAX_DISPLAY_NAME = 64;`，並把 `const displayName = …` 那行改為：

```ts
  // 清理換行、雙向控制字元等；全部被清掉時退回帳號名稱，再退回來源名稱
  const displayName = sanitizeName(ident.displayName, PROVIDER_NAME_MAX) || sanitizeName(ident.username, PROVIDER_NAME_MAX) || provider;
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/repo apps/worker/src/auth/resolveUser.ts apps/worker/src/routes/testLoginNames.test.ts
git commit -m "feat(worker): profile repository and sanitized provider names

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 3: Worker — Mojang 名稱查詢與假 Mojang

**Files:**
- Create: `apps/worker/src/mojang/client.ts`、`apps/worker/src/mojang/fakeMojang.ts`、`apps/worker/src/mojang/mojang.test.ts`
- Modify: `apps/worker/src/env.ts`、`apps/worker/src/testEnv.ts`、`apps/worker/vitest.config.ts`、`wrangler.jsonc`

**Interfaces:**
- Consumes: `isMinecraftName`（Task 1）、`FetchLike`（`appEnv.ts`）。
- Produces:

```ts
export const MOJANG_USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';
export type MojangLookup =
  | { kind: 'found'; name: string; uuid: string }
  | { kind: 'not_found' } | { kind: 'rate_limited' } | { kind: 'failed'; status: number };
lookupMinecraftName(fetchImpl: FetchLike, apiBase: string, name: string): Promise<MojangLookup>
// fakeMojang.ts
export const FAKE_MOJANG_PROFILES: Record<string, { id: string; name: string }>;  // steve、alex
isMojangPath(pathname: string): boolean
createFakeMojang(profiles?): { fetch: FetchLike; requests(): readonly { url: string; userAgent: string | null }[] }
// env.ts
Env.MOJANG_API_BASE: string；ENV_GROUPS.mojang = ['MOJANG_API_BASE']
```

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/mojang/mojang.test.ts
import { describe, expect, it } from 'vitest';
import { missingEnv } from '../env';
import { testEnv } from '../testEnv';
import { lookupMinecraftName, MOJANG_USER_AGENT } from './client';
import { createFakeMojang } from './fakeMojang';

const BASE = 'https://mojang.test';
const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

describe('lookupMinecraftName', () => {
  it('returns the canonical name and a lowercase uuid, sending only the name and our User-Agent', async () => {
    const fake = createFakeMojang();
    expect(await lookupMinecraftName(fake.fetch, BASE, 'steve')).toEqual({ kind: 'found', name: 'Steve', uuid: STEVE_UUID });
    expect(fake.requests()).toEqual([{ url: `${BASE}/users/profiles/minecraft/steve`, userAgent: MOJANG_USER_AGENT }]);
  });

  it('accepts a base with a trailing slash and uppercase uuids', async () => {
    const upper = async () => Response.json({ id: STEVE_UUID.toUpperCase(), name: 'Steve' });
    expect(await lookupMinecraftName(upper, `${BASE}/`, 'Steve')).toEqual({ kind: 'found', name: 'Steve', uuid: STEVE_UUID });
  });

  it('maps 404 and 204 to not_found', async () => {
    expect(await lookupMinecraftName(createFakeMojang().fetch, BASE, 'nobody')).toEqual({ kind: 'not_found' });
    expect(await lookupMinecraftName(async () => new Response(null, { status: 204 }), BASE, 'x')).toEqual({ kind: 'not_found' });
  });

  it('maps 429 to rate_limited and everything else to failed', async () => {
    const fake = createFakeMojang();
    expect(await lookupMinecraftName(fake.fetch, BASE, 'ratelimited')).toEqual({ kind: 'rate_limited' });
    expect(await lookupMinecraftName(fake.fetch, BASE, 'broken')).toEqual({ kind: 'failed', status: 500 });
    expect(await lookupMinecraftName(async () => { throw new TypeError('network down'); }, BASE, 'x')).toEqual({ kind: 'failed', status: 0 });
    expect(await lookupMinecraftName(async () => Response.json({ id: 'nope', name: 'Steve' }), BASE, 'x')).toEqual({ kind: 'failed', status: 200 });
    expect(await lookupMinecraftName(async () => new Response('<html>', { status: 200 }), BASE, 'x')).toEqual({ kind: 'failed', status: 200 });
  });
});

describe('mojang env group', () => {
  it('requires MOJANG_API_BASE', () => {
    expect(missingEnv(testEnv({ MOJANG_API_BASE: '' }), 'mojang')).toEqual(['MOJANG_API_BASE']);
    expect(missingEnv(testEnv(), 'mojang')).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/mojang`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/mojang/client.ts
import { z } from 'zod';
import { isMinecraftName } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';

/** 專案對外請求一律使用此 User-Agent（與 scripts/lib/modrinth.ts 相同） */
export const MOJANG_USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';

const profileSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{32}$/).transform((s) => s.toLowerCase()),
  name: z.string().refine(isMinecraftName),
});

export type MojangLookup =
  | { readonly kind: 'found'; readonly name: string; readonly uuid: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'failed'; readonly status: number };

/** 以名稱查 Mojang 公開 API；只送出名稱，不帶任何使用者資料 */
export async function lookupMinecraftName(fetchImpl: FetchLike, apiBase: string, name: string): Promise<MojangLookup> {
  const url = `${apiBase.replace(/\/+$/, '')}/users/profiles/minecraft/${encodeURIComponent(name)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': MOJANG_USER_AGENT } });
  } catch {
    return { kind: 'failed', status: 0 };
  }
  if (res.status === 204 || res.status === 404) return { kind: 'not_found' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (!res.ok) return { kind: 'failed', status: res.status };
  const parsed = profileSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? { kind: 'found', name: parsed.data.name, uuid: parsed.data.id } : { kind: 'failed', status: res.status };
}
```

```ts
// apps/worker/src/mojang/fakeMojang.ts
// 單元測試與 E2E（e2e/fake-github.ts 轉送）共用的假 Mojang
import type { FetchLike } from '../appEnv';

export interface FakeMojangProfile {
  readonly id: string;
  readonly name: string;
}

/** 名稱（小寫）→ 個人資料；名稱 ratelimited 回 429、broken 回 500 */
export const FAKE_MOJANG_PROFILES: Readonly<Record<string, FakeMojangProfile>> = {
  steve: { id: '8667ba71b85a4004af54457a9734eed7', name: 'Steve' },
  alex: { id: 'ec561538f3fd461daff5086b22154bce', name: 'Alex' },
};

const PATH = /^\/users\/profiles\/minecraft\/([^/]+)$/;

export function isMojangPath(pathname: string): boolean {
  return PATH.test(pathname);
}

interface LoggedRequest {
  readonly url: string;
  readonly userAgent: string | null;
}

export function createFakeMojang(profiles: Readonly<Record<string, FakeMojangProfile>> = FAKE_MOJANG_PROFILES) {
  const log: LoggedRequest[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    log.push({ url, userAgent: headers.get('User-Agent') });
    const pathname = new URL(url).pathname;
    const name = decodeURIComponent(PATH.exec(pathname)?.[1] ?? '').toLowerCase();
    if (name === 'ratelimited') return new Response(null, { status: 429 });
    if (name === 'broken') return new Response('oops', { status: 500 });
    const profile = Object.hasOwn(profiles, name) ? profiles[name] : undefined;
    return profile
      ? Response.json(profile)
      : Response.json({ path: pathname, errorMessage: `Couldn't find any profile with name ${name}` }, { status: 404 });
  };
  return { fetch, requests: (): readonly LoggedRequest[] => [...log] };
}
```

`apps/worker/src/env.ts`：`Env` 介面在 `REPO` 之後加

```ts
  /** Mojang 公開 API（正式 https://api.mojang.com；測試指向假 Mojang） */
  readonly MOJANG_API_BASE: string;
```

`ENV_GROUPS` 加一列：

```ts
  mojang: ['MOJANG_API_BASE'],
```

`apps/worker/src/testEnv.ts`：在 `REPO: 'MrPippi/ModLangForge',` 之後加 `MOJANG_API_BASE: 'https://mojang.test',`。

`apps/worker/vitest.config.ts`：`coverage.exclude` 陣列末尾加 `'src/mojang/fakeMojang.ts'`。

`wrangler.jsonc` 的 `vars` 加：

```jsonc
    "MOJANG_API_BASE": "https://api.mojang.com"
```

（記得在前一行 `"REPO": "MrPippi/ModLangForge"` 後補逗號。）

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/mojang && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/mojang apps/worker/src/env.ts apps/worker/src/testEnv.ts apps/worker/vitest.config.ts wrangler.jsonc
git commit -m "feat(worker): Mojang name lookup with a shared fake

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 4: Worker — `/api/v1/me/profile` 與 `/api/v1/me/minecraft`

**Files:**
- Create: `apps/worker/src/routes/meProfile.ts`、`apps/worker/src/routes/meProfile.test.ts`
- Modify: `apps/worker/src/routes/me.ts`、`apps/worker/src/auth/guard.ts`、`apps/worker/src/app.ts`

**Interfaces:**
- Consumes: `validateDisplayName`、`isMinecraftName`、`DISPLAY_NAME_MAX`（Task 1）；`UserRepo.getProfile/updateProfile/setMinecraft`（Task 2）；`lookupMinecraftName`、`createFakeMojang`、`ENV_GROUPS.mojang`（Task 3）。
- Produces:
  - `requireLogin: MiddlewareHandler<AppEnv>`（`auth/guard.ts`）。
  - `registerMeRoutes(app, deps: AppDeps)`（簽章改為需要 deps）。
  - `GET /api/v1/me/profile` → 200 `{ profile: UserProfile }`｜401 `login_required`
  - `POST /api/v1/me/profile` `{ displayName?: string; isPublic?: boolean }`（至少一個）→ 200 `{ profile }`｜400 `invalid_body`／`display_name_empty`／`display_name_too_long`｜401｜403 `bad_origin`／`bad_csrf`
  - `POST /api/v1/me/minecraft` `{ name: string | null }` → 200 `{ profile }`｜400 `invalid_minecraft_name`｜404 `minecraft_not_found`｜429 `rate_limited`｜503 `mojang_busy`｜502 `mojang_failed`｜500 `misconfigured`
  - `MOJANG_LOOKUPS_PER_HOUR = 10`
  - 其他方法 → 405（含 `/api/v1/me`、`/api/v1/me/suggestions`）

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/routes/meProfile.test.ts
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { Env } from '../env';
import { createFakeMojang } from '../mojang/fakeMojang';
import type { UserProfile } from '../repo/types';
import { createUser, sessionCookie, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';
import { MOJANG_LOOKUPS_PER_HOUR } from './meProfile';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
type Actor = { id: number; sessionVersion: number };

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterEach(() => vi.restoreAllMocks());
afterAll(disposeTestDb);

function setup() {
  const mojang = createFakeMojang();
  const app = createApp(testDeps({ fetch: mojang.fetch }));
  const env = (over: Partial<Env> = {}) => testEnv({ DB: db, ...over });
  const post = async (path: string, body: unknown, who?: Actor, headerOver: Record<string, string> = {}, envOver: Partial<Env> = {}) =>
    app.request(path, { method: 'POST', headers: { ...(await writeHeaders(who)), ...headerOver }, body: JSON.stringify(body) }, env(envOver));
  const get = async (path: string, who?: Actor) =>
    app.request(path, { headers: who ? { Cookie: await sessionCookie(who) } : {} }, env());
  return { app, env, mojang, post, get };
}

const profileOf = async (res: Response) => (await readJson<{ profile: UserProfile }>(res)).data.profile;
const codeOf = async (res: Response) => (await readJson(res)).error.code;

describe('GET /api/v1/me/profile', () => {
  it('requires login', async () => {
    const res = await setup().get('/api/v1/me/profile');
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe('login_required');
  });

  it('returns the profile', async () => {
    const user = await createUser(db, 'contributor', '史蒂夫');
    expect(await profileOf(await setup().get('/api/v1/me/profile', user))).toEqual({
      id: user.id, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false,
    });
  });

  it('answers 405 for other methods on every /me path', async () => {
    const { app, env } = setup();
    for (const [path, allow] of [['/api/v1/me', 'GET'], ['/api/v1/me/suggestions', 'GET'], ['/api/v1/me/profile', 'GET, POST'], ['/api/v1/me/minecraft', 'POST']] as const) {
      const res = await app.request(path, { method: 'PUT' }, env());
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe(allow);
    }
  });
});

describe('POST /api/v1/me/profile', () => {
  it('renames with a cleaned name and toggles public; the session stays valid', async () => {
    const user = await createUser(db, 'contributor', '史蒂夫');
    const { post, get } = setup();
    const res = await post('/api/v1/me/profile', { displayName: '  艾力克斯\n', isPublic: false }, user);
    expect(res.status).toBe(200);
    expect(await profileOf(res)).toMatchObject({ displayName: '艾力克斯', isPublic: false });
    const me = await readJson<{ user: { displayName: string } | null }>(await get('/api/v1/me', user));
    expect(me.data.user?.displayName).toBe('艾力克斯');
  });

  it('rejects blank, too long and empty bodies', async () => {
    const user = await createUser(db);
    const { post } = setup();
    const blank = await post('/api/v1/me/profile', { displayName: ' ​ ' }, user);
    expect(blank.status).toBe(400);
    expect(await codeOf(blank)).toBe('display_name_empty');
    expect(await codeOf(await post('/api/v1/me/profile', { displayName: '字'.repeat(33) }, user))).toBe('display_name_too_long');
    expect(await codeOf(await post('/api/v1/me/profile', {}, user))).toBe('invalid_body');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: 'no' }, user))).toBe('invalid_body');
  });

  it('requires login, Origin and CSRF', async () => {
    const user = await createUser(db);
    const { post } = setup();
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }))).toBe('login_required');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }, user, { Origin: 'https://evil.test' }))).toBe('bad_origin');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }, user, { 'X-CSRF-Token': 'x'.repeat(43) }))).toBe('bad_csrf');
  });
});

describe('POST /api/v1/me/minecraft', () => {
  it('stores the canonical name and uuid as unverified', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    const res = await post('/api/v1/me/minecraft', { name: 'steve' }, user);
    expect(res.status).toBe(200);
    expect(await profileOf(res)).toMatchObject({ minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false });
    expect(mojang.requests().map((r) => r.url)).toEqual(['https://mojang.test/users/profiles/minecraft/steve']);
  });

  it('does not look up again when the name is unchanged (any case)', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    await post('/api/v1/me/minecraft', { name: 'Steve' }, user);
    expect((await post('/api/v1/me/minecraft', { name: 'STEVE' }, user)).status).toBe(200);
    expect(mojang.requests()).toHaveLength(1);
  });

  it('clears with null or an empty string without a lookup', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    await post('/api/v1/me/minecraft', { name: 'Steve' }, user);
    expect(await profileOf(await post('/api/v1/me/minecraft', { name: null }, user))).toMatchObject({ minecraftName: null, minecraftUuid: null });
    expect((await post('/api/v1/me/minecraft', { name: '' }, user)).status).toBe(200);
    expect(mojang.requests()).toHaveLength(1);
  });

  it('rejects invalid names before calling Mojang', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    const res = await post('/api/v1/me/minecraft', { name: 'Steve!' }, user);
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('invalid_minecraft_name');
    expect(await codeOf(await post('/api/v1/me/minecraft', {}, user))).toBe('invalid_body');
    expect(mojang.requests()).toHaveLength(0);
  });

  it('maps Mojang answers to clear errors without storing anything', async () => {
    const user = await createUser(db);
    const { post, get } = setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const missing = await post('/api/v1/me/minecraft', { name: 'nobody' }, user);
    expect([missing.status, await codeOf(missing)]).toEqual([404, 'minecraft_not_found']);
    const busy = await post('/api/v1/me/minecraft', { name: 'ratelimited' }, user);
    expect([busy.status, await codeOf(busy)]).toEqual([503, 'mojang_busy']);
    const broken = await post('/api/v1/me/minecraft', { name: 'broken' }, user);
    expect([broken.status, await codeOf(broken)]).toEqual([502, 'mojang_failed']);
    expect(errors).toHaveBeenCalledWith('mojang lookup failed', 500);
    expect((await profileOf(await get('/api/v1/me/profile', user))).minecraftName).toBeNull();
  });

  it('limits lookups per user per hour', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    for (let i = 0; i < MOJANG_LOOKUPS_PER_HOUR; i += 1) {
      expect((await post('/api/v1/me/minecraft', { name: `nobody${i}` }, user)).status).toBe(404);
    }
    const limited = await post('/api/v1/me/minecraft', { name: 'steve' }, user);
    expect([limited.status, await codeOf(limited)]).toEqual([429, 'rate_limited']);
    expect(mojang.requests()).toHaveLength(MOJANG_LOOKUPS_PER_HOUR);
  });

  it('returns misconfigured when MOJANG_API_BASE is missing', async () => {
    const user = await createUser(db);
    const res = await setup().post('/api/v1/me/minecraft', { name: 'steve' }, user, {}, { MOJANG_API_BASE: '' });
    expect([res.status, await codeOf(res)]).toEqual([500, 'misconfigured']);
  });

  it('requires login', async () => {
    expect(await codeOf(await setup().post('/api/v1/me/minecraft', { name: 'steve' }))).toBe('login_required');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/meProfile.test.ts`
Expected: FAIL（`./meProfile` 不存在）。

- [ ] **Step 3: 實作**

`apps/worker/src/auth/guard.ts` 追加：

```ts
/** 只需登入（任何角色）；未登入回 401 */
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return fail(c, 401, 'login_required', '請先登入。');
  await next();
};
```

```ts
// apps/worker/src/routes/meProfile.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { DISPLAY_NAME_MAX, isMinecraftName, validateDisplayName, type DisplayNameRejection } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requireLogin } from '../auth/guard';
import { envGuard } from '../env';
import { fail, methodNotAllowed, ok, parseJson } from '../http';
import { lookupMinecraftName } from '../mojang/client';
import type { ProfilePatch, UserProfile } from '../repo/types';

export const MOJANG_LOOKUPS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
/** 原始輸入上限；清理後的長度另由 validateDisplayName 判斷 */
const RAW_NAME_MAX = 200;

const profileBody = z
  .object({ displayName: z.string().max(RAW_NAME_MAX).optional(), isPublic: z.boolean().optional() })
  .refine((b) => b.displayName !== undefined || b.isPublic !== undefined);
const minecraftBody = z.object({ name: z.string().trim().max(32).nullable() });

const NAME_ERRORS: Readonly<Record<DisplayNameRejection, string>> = {
  empty: '顯示名稱不能空白。',
  too_long: `顯示名稱最多 ${DISPLAY_NAME_MAX} 個字。`,
};

function userId(c: Ctx): number {
  const user = c.get('user');
  if (!user) throw new Error('requireLogin must run before profile handlers');
  return user.id;
}

/** 使用者在請求途中被刪除時視同未登入 */
const respondProfile = (c: Ctx, profile: UserProfile | null): Response =>
  profile ? ok(c, { profile }) : fail(c, 401, 'login_required', '請先登入。');

async function handleProfile(c: Ctx): Promise<Response> {
  const body = await parseJson(c, profileBody);
  if (body instanceof Response) return body;
  const verdict = body.displayName === undefined ? null : validateDisplayName(body.displayName);
  if (verdict && !verdict.ok) return fail(c, 400, `display_name_${verdict.reason}`, NAME_ERRORS[verdict.reason]);
  const patch: ProfilePatch = {
    ...(verdict?.ok ? { displayName: verdict.name } : {}),
    ...(body.isPublic === undefined ? {} : { isPublic: body.isPublic }),
  };
  return respondProfile(c, await c.get('repos').users.updateProfile(userId(c), patch));
}

async function handleMinecraft(c: Ctx, deps: AppDeps): Promise<Response> {
  const body = await parseJson(c, minecraftBody);
  if (body instanceof Response) return body;
  const users = c.get('repos').users;
  const id = userId(c);
  if (body.name === null || body.name === '') return respondProfile(c, await users.setMinecraft(id, null));
  if (!isMinecraftName(body.name)) return fail(c, 400, 'invalid_minecraft_name', 'Minecraft 名稱只能有英文字母、數字與底線，最多 16 字。');
  const current = await users.getProfile(id);
  if (current?.minecraftName?.toLowerCase() === body.name.toLowerCase()) return respondProfile(c, current);
  if (!(await c.get('repos').suggestions.tryConsumeRate(`mc:user:${id}`, deps.now(), MOJANG_LOOKUPS_PER_HOUR, HOUR_MS))) {
    return fail(c, 429, 'rate_limited', '查詢太頻繁了，請稍後再試。');
  }
  const found = await lookupMinecraftName(deps.fetch, c.env.MOJANG_API_BASE, body.name);
  switch (found.kind) {
    case 'found':
      return respondProfile(c, await users.setMinecraft(id, { name: found.name, uuid: found.uuid }));
    case 'not_found':
      return fail(c, 404, 'minecraft_not_found', '找不到這個 Minecraft 名稱。');
    case 'rate_limited':
      return fail(c, 503, 'mojang_busy', 'Mojang 查詢服務忙碌中，請稍後再試。');
    case 'failed':
      console.error('mojang lookup failed', found.status);
      return fail(c, 502, 'mojang_failed', '暫時無法連線到 Mojang，請稍後再試。');
  }
}

export function registerProfileRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/me/profile', requireLogin, async (c) => respondProfile(c, await c.get('repos').users.getProfile(userId(c))));
  app.post('/api/v1/me/profile', requireWrite, requireLogin, (c) => handleProfile(c));
  app.all('/api/v1/me/profile', methodNotAllowed(['GET', 'POST']));
  app.post('/api/v1/me/minecraft', requireWrite, requireLogin, envGuard('mojang'), (c) => handleMinecraft(c, deps));
  app.all('/api/v1/me/minecraft', methodNotAllowed(['POST']));
}
```

`apps/worker/src/routes/me.ts` 全文改為：

```ts
import type { Hono } from 'hono';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { ensureCsrf } from '../auth/csrf';
import { methodNotAllowed, ok } from '../http';
import { clientIp, hashIp } from '../ipHash';
import { registerProfileRoutes } from './meProfile';

const MY_SUGGESTIONS_LIMIT = 50;

export function registerMeRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/me', async (c) => {
    const csrfToken = ensureCsrf(c);
    const user = c.get('user');
    if (!user) return ok(c, { user: null, csrfToken });
    const identities = await c.get('repos').users.listIdentities(user.id);
    return ok(c, { user: { ...user, identities: identities.map((i) => ({ provider: i.provider, username: i.username })) }, csrfToken });
  });
  app.all('/api/v1/me', methodNotAllowed(['GET']));

  app.get('/api/v1/me/suggestions', async (c) => {
    const user = c.get('user');
    const author = user ? { userId: user.id } : { hash: await hashIp(c.env.IP_HASH_SALT, clientIp(c.req.raw)) };
    return ok(c, { suggestions: await c.get('repos').suggestions.listByAuthor(author, MY_SUGGESTIONS_LIMIT) });
  });
  app.all('/api/v1/me/suggestions', methodNotAllowed(['GET']));

  registerProfileRoutes(app, deps);
}
```

`apps/worker/src/app.ts`：`registerMeRoutes(app);` 改為 `registerMeRoutes(app, deps);`。

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npm run typecheck && npm run test:coverage`
Expected: PASS；覆蓋率門檻（80%）通過。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): profile and Minecraft name endpoints under /api/v1/me

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 5: Worker — 貢獻者排名、個人頁 API 與 `/contributors/<id>/` 頁殼

**Files:**
- Create: `apps/worker/src/repo/d1Contributors.ts`、`apps/worker/src/repo/contributors.test.ts`、`apps/worker/src/routes/contributors.ts`、`apps/worker/src/routes/contributors.test.ts`
- Modify: `apps/worker/src/repo/types.ts`、`apps/worker/src/repo/index.ts`、`apps/worker/src/app.ts`、`wrangler.jsonc`

**Interfaces:**
- Produces（`repo/types.ts`）：

```ts
export interface ContributorSummary { readonly id: number; readonly displayName: string; readonly minecraftUuid: string | null; readonly published: number; readonly mods: number }
export interface ContributorModCount { readonly modId: string; readonly count: number }
export interface ContributorProfile {
  readonly id: number; readonly displayName: string; readonly minecraftName: string | null; readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean; readonly published: number; readonly mods: readonly ContributorModCount[];
}
export interface ContributorRepo {
  ranking(input: { readonly modId: string | null; readonly limit: number }): Promise<ContributorSummary[]>;
  profile(id: number, modLimit: number): Promise<ContributorProfile | null>;
}
// Repos 新增 readonly contributors: ContributorRepo
```

- 路由：`GET /api/v1/contributors[?modId=]` → `{ contributors: ContributorSummary[] }`｜400；`GET /api/v1/contributors/:id` → `{ contributor: ContributorProfile }`｜400｜404 `contributor_not_found`；`GET /contributors/<數字>/` → 頁殼 200；`GET /contributors/<數字>` → 301。
- 常數：`RANKING_LIMIT = 100`、`PROFILE_SHELL_PATH = '/contributors/profile/'`。

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/repo/contributors.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

let seq = 0;
async function suggestion(authorId: number | null, modId: string, status = 'published'): Promise<void> {
  seq += 1;
  await db.prepare(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
                    VALUES (?, ?, 'x', ?, 'h', ?, '2026-10-15T00:00:00.000Z')`).bind(modId, `k${seq}`, authorId, status).run();
}

async function seedWorld() {
  const repos = createD1Repos(db);
  const alice = await createUser(db, 'contributor', 'Alice');
  const bob = await createUser(db, 'contributor', 'Bob');
  const carol = await createUser(db, 'contributor', 'Carol');
  const dave = await createUser(db, 'contributor', 'Dave');
  for (const mod of ['create', 'create', 'jei']) await suggestion(alice.id, mod);
  await suggestion(bob.id, 'create');
  await suggestion(bob.id, 'create', 'pending');
  await suggestion(bob.id, 'create', 'approved');
  for (let i = 0; i < 5; i += 1) await suggestion(carol.id, 'create');
  for (let i = 0; i < 4; i += 1) await suggestion(dave.id, 'create');
  for (let i = 0; i < 6; i += 1) await suggestion(null, 'create');
  await repos.users.updateProfile(carol.id, { isPublic: false });
  await repos.users.setBanned(dave.id, true);
  await repos.users.setMinecraft(alice.id, { name: 'Steve', uuid: '8667ba71b85a4004af54457a9734eed7' });
  return { repos, alice, bob, carol, dave };
}

describe('ContributorRepo', () => {
  it('ranks only public, unbanned authors by published count', async () => {
    const { repos, alice, bob } = await seedWorld();
    expect(await repos.contributors.ranking({ modId: null, limit: 100 })).toEqual([
      { id: alice.id, displayName: 'Alice', minecraftUuid: '8667ba71b85a4004af54457a9734eed7', published: 3, mods: 2 },
      { id: bob.id, displayName: 'Bob', minecraftUuid: null, published: 1, mods: 1 },
    ]);
  });

  it('filters by mod and honours the limit', async () => {
    const { repos, alice } = await seedWorld();
    expect(await repos.contributors.ranking({ modId: 'jei', limit: 100 })).toEqual([
      { id: alice.id, displayName: 'Alice', minecraftUuid: '8667ba71b85a4004af54457a9734eed7', published: 1, mods: 1 },
    ]);
    expect(await repos.contributors.ranking({ modId: null, limit: 1 })).toHaveLength(1);
  });

  it('breaks ties by the earliest published suggestion', async () => {
    const late = await createUser(db, 'contributor', 'Late');
    const early = await createUser(db, 'contributor', 'Early');
    await suggestion(early.id, 'create');
    await suggestion(late.id, 'create');
    expect((await createD1Repos(db).contributors.ranking({ modId: null, limit: 10 })).map((c) => c.displayName)).toEqual(['Early', 'Late']);
  });

  it('builds a profile with per-mod counts and hides private, banned or empty ones', async () => {
    const { repos, alice, bob, carol, dave } = await seedWorld();
    expect(await repos.contributors.profile(alice.id, 100)).toEqual({
      id: alice.id, displayName: 'Alice', minecraftName: 'Steve', minecraftUuid: '8667ba71b85a4004af54457a9734eed7', minecraftVerified: false,
      published: 3, mods: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
    });
    expect((await repos.contributors.profile(alice.id, 1))?.mods).toEqual([{ modId: 'create', count: 2 }]);
    expect((await repos.contributors.profile(alice.id, 1))?.published).toBe(3);
    expect((await repos.contributors.profile(bob.id, 100))?.published).toBe(1);
    expect(await repos.contributors.profile(carol.id, 100)).toBeNull();
    expect(await repos.contributors.profile(dave.id, 100)).toBeNull();
    const idle = await createUser(db, 'contributor', 'Idle');
    expect(await repos.contributors.profile(idle.id, 100)).toBeNull();
  });
});
```

```ts
// apps/worker/src/routes/contributors.test.ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());
const call = (path: string, init: RequestInit = {}) => app.request(path, init, testEnv({ DB: db }));

async function publishedBy(name: string, modId = 'create'): Promise<number> {
  const user = await createUser(db, 'contributor', name);
  await db.prepare(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
                    VALUES (?, ?, 'x', ?, 'h', 'published', '2026-10-15T00:00:00.000Z')`).bind(modId, `k-${name}`, user.id).run();
  return user.id;
}

describe('contributors API', () => {
  it('lists the ranking, optionally filtered by mod', async () => {
    const alice = await publishedBy('Alice');
    await publishedBy('Bob', 'jei');
    const all = await readJson<{ contributors: { id: number }[] }>(await call('/api/v1/contributors'));
    expect(all.data.contributors).toHaveLength(2);
    const create = await readJson<{ contributors: { id: number }[] }>(await call('/api/v1/contributors?modId=create'));
    expect(create.data.contributors.map((c) => c.id)).toEqual([alice]);
    expect((await call('/api/v1/contributors?modId=..%2Fx')).status).toBe(400);
  });

  it('returns a profile, 404 for hidden ones and 400 for bad ids', async () => {
    const alice = await publishedBy('Alice');
    const res = await call(`/api/v1/contributors/${alice}`);
    expect((await readJson<{ contributor: { displayName: string } }>(res)).data.contributor.displayName).toBe('Alice');
    const missing = await call('/api/v1/contributors/999');
    expect([missing.status, (await readJson(missing)).error.code]).toEqual([404, 'contributor_not_found']);
    expect((await call('/api/v1/contributors/abc')).status).toBe(400);
  });

  it('answers 405 for writes and sends no-store', async () => {
    const res = await call('/api/v1/contributors', { method: 'POST' });
    expect(res.status).toBe(405);
    expect((await call('/api/v1/contributors')).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('/contributors/<id>/ page shell', () => {
  it('serves the profile shell for numeric ids and redirects the slash-less form', async () => {
    const page = await call('/contributors/12/');
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('asset:/contributors/profile/');
    const bare = await call('/contributors/12');
    expect(bare.status).toBe(301);
    expect(bare.headers.get('Location')).toBe('/contributors/12/');
  });

  it('leaves other paths to static assets', async () => {
    expect(await (await call('/contributors/abc/')).text()).toBe('asset:/contributors/abc/');
    expect(await (await call('/contributors/')).text()).toBe('asset:/contributors/');
  });

  it('routes the new paths to the Worker in wrangler.jsonc', () => {
    const config = readFileSync(new URL('../../../../wrangler.jsonc', import.meta.url), 'utf8');
    for (const pattern of ['"/api/v1/contributors"', '"/api/v1/contributors/*"', '"/contributors/*"']) expect(config).toContain(pattern);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo/contributors.test.ts src/routes/contributors.test.ts`
Expected: FAIL（`contributors` repo 與路由不存在）。

- [ ] **Step 3: 實作**

`apps/worker/src/repo/types.ts`：加入 Interfaces 列出的四個型別，並在 `Repos` 加 `readonly contributors: ContributorRepo;`。

```ts
// apps/worker/src/repo/d1Contributors.ts
import type { ContributorProfile, ContributorRepo, ContributorSummary } from './types';

/** 只公開 public=1 且未停權的作者；匿名建議（author_user_id 為 NULL）以 JOIN 排除 */
const VISIBLE = 'u.public = 1 AND u.banned = 0';

interface RankRow {
  readonly id: number;
  readonly display_name: string;
  readonly minecraft_uuid: string | null;
  readonly published: number;
  readonly mods: number;
}

interface ProfileRow {
  readonly id: number;
  readonly display_name: string;
  readonly minecraft_name: string | null;
  readonly minecraft_uuid: string | null;
  readonly minecraft_verified: number;
}

async function ranking(db: D1Database, modId: string | null, limit: number): Promise<ContributorSummary[]> {
  const { results } = await db
    .prepare(`SELECT u.id, u.display_name, u.minecraft_uuid, COUNT(*) AS published, COUNT(DISTINCT s.mod_id) AS mods
              FROM suggestions s JOIN users u ON u.id = s.author_user_id
              WHERE s.status = 'published' AND ${VISIBLE} AND (?1 IS NULL OR s.mod_id = ?1)
              GROUP BY u.id
              ORDER BY published DESC, MIN(s.id), u.id
              LIMIT ?2`)
    .bind(modId, limit)
    .all<RankRow>();
  return results.map((r) => ({ id: r.id, displayName: r.display_name, minecraftUuid: r.minecraft_uuid, published: r.published, mods: r.mods }));
}

async function profile(db: D1Database, id: number, modLimit: number): Promise<ContributorProfile | null> {
  const user = await db
    .prepare(`SELECT u.id, u.display_name, u.minecraft_name, u.minecraft_uuid, u.minecraft_verified FROM users u WHERE u.id = ? AND ${VISIBLE}`)
    .bind(id)
    .first<ProfileRow>();
  if (!user) return null;
  const { results } = await db
    .prepare(`SELECT mod_id, COUNT(*) AS count FROM suggestions WHERE author_user_id = ? AND status = 'published'
              GROUP BY mod_id ORDER BY count DESC, mod_id`)
    .bind(id)
    .all<{ mod_id: string; count: number }>();
  const published = results.reduce((n, r) => n + r.count, 0);
  if (published === 0) return null;
  return {
    id: user.id, displayName: user.display_name, minecraftName: user.minecraft_name, minecraftUuid: user.minecraft_uuid,
    minecraftVerified: user.minecraft_verified === 1, published,
    mods: results.slice(0, modLimit).map((r) => ({ modId: r.mod_id, count: r.count })),
  };
}

export function createD1Contributors(db: D1Database): ContributorRepo {
  return {
    ranking: ({ modId, limit }) => ranking(db, modId, limit),
    profile: (id, modLimit) => profile(db, id, modLimit),
  };
}
```

`apps/worker/src/repo/index.ts` 全文：

```ts
import { createD1Blocks } from './d1Blocks';
import { createD1Contributors } from './d1Contributors';
import { createD1Review } from './d1Review';
import { createD1Suggestions } from './d1Suggestions';
import { createD1Users } from './d1Users';
import type { Repos } from './types';

export function createD1Repos(db: D1Database): Repos {
  return {
    suggestions: createD1Suggestions(db), blocks: createD1Blocks(db), users: createD1Users(db),
    review: createD1Review(db), contributors: createD1Contributors(db),
  };
}
```

```ts
// apps/worker/src/routes/contributors.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Ctx } from '../appEnv';
import { fail, idParam, invalidBody, methodNotAllowed, modIdSchema, ok } from '../http';

export const RANKING_LIMIT = 100;
const PROFILE_MOD_LIMIT = 200;
/** /contributors/<id>/ 共用的靜態頁殼（apps/site/src/pages/contributors/profile.astro） */
export const PROFILE_SHELL_PATH = '/contributors/profile/';

const rankingQuery = z.object({ modId: modIdSchema.optional() });

/** 以頁殼內容回應任意 /contributors/<id>/；資料由 island 依網址向 API 取得 */
async function serveProfileShell(c: Ctx): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(new Request(new URL(PROFILE_SHELL_PATH, c.req.url), { headers: c.req.raw.headers }));
  return new Response(asset.body, { status: asset.ok ? 200 : asset.status, headers: asset.headers });
}

export function registerContributorRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/contributors', async (c) => {
    const query = rankingQuery.safeParse(c.req.query());
    if (!query.success) return invalidBody(c);
    const contributors = await c.get('repos').contributors.ranking({ modId: query.data.modId ?? null, limit: RANKING_LIMIT });
    return ok(c, { contributors });
  });
  app.all('/api/v1/contributors', methodNotAllowed(['GET']));

  app.get('/api/v1/contributors/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return invalidBody(c);
    const contributor = await c.get('repos').contributors.profile(id.data, PROFILE_MOD_LIMIT);
    return contributor ? ok(c, { contributor }) : fail(c, 404, 'contributor_not_found', '找不到這位貢獻者。');
  });
  app.all('/api/v1/contributors/:id', methodNotAllowed(['GET']));

  app.get('/contributors/:id{[0-9]+}/', (c) => serveProfileShell(c));
  app.get('/contributors/:id{[0-9]+}', (c) => c.redirect(`/contributors/${c.req.param('id')}/`, 301));
}
```

`apps/worker/src/app.ts`：匯入 `import { registerContributorRoutes } from './routes/contributors';`，並在 `registerAdminPublishRoutes(app, deps);` 之後加 `registerContributorRoutes(app);`（必須在 `app.all('/api/*', …)` 與 `app.all('*', …)` 之前）。

`wrangler.jsonc` 的 `run_worker_first` 陣列末尾加三項：

```jsonc
      "/api/v1/admin/*",
      "/api/v1/contributors",
      "/api/v1/contributors/*",
      "/contributors/*"
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npm run typecheck && npm run test:coverage`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src wrangler.jsonc
git commit -m "feat(worker): contributor ranking, profiles and profile page shell

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 6: 網站 — `/me/` 個人資料頁

**Files:**
- Create: `apps/site/src/components/Avatar.tsx`、`apps/site/src/islands/SuggestionList.tsx`、`apps/site/src/me/strings.ts`、`apps/site/src/me/meApi.ts`、`apps/site/src/me/MeApp.tsx`、`apps/site/src/me/ProfileForm.tsx`、`apps/site/src/me/MinecraftForm.tsx`、`apps/site/src/me/me.test.tsx`、`apps/site/src/pages/me.astro`、`apps/site/src/lib/links.test.ts`
- Modify: `apps/site/src/islands/MySuggestions.tsx`、`apps/site/src/lib/config.ts`、`apps/site/src/lib/siteMeta.ts`、`apps/site/src/lib/siteMeta.test.ts`、`apps/site/public/_headers`

**Interfaces:**
- Consumes: `GET/POST /api/v1/me/profile`、`POST /api/v1/me/minecraft`（Task 4）；`apiGet`、`apiSend`、`resetMe`（`islands/api.ts`）；`DISPLAY_NAME_MAX`（Task 1）。
- Produces:

```ts
// lib/config.ts
export const AVATAR_ORIGIN = 'https://mc-heads.net';
avatarUrl(uuid: string, size: number): string
contributorUrl(id: number): string          // '/contributors/<id>/'
contributorsUrl(modId?: string): string     // '/contributors/' 或 '/contributors/?mod=<id>'
// components/Avatar.tsx
Avatar({ uuid: string | null; name: string; size?: number })
// me/meApi.ts
export interface UserProfile { id; displayName; isPublic; minecraftName: string | null; minecraftUuid: string | null; minecraftVerified: boolean }
export const ME_CHANGED_EVENT = 'mlf:me-changed';
createMeApi(fetchImpl?): { profile(); updateProfile(patch); setMinecraft(name: string | null) }   // 皆回 ApiResult<{ profile: UserProfile }>
export type MeApi = ReturnType<typeof createMeApi>;
// islands/SuggestionList.tsx
SuggestionList({ fetchImpl?: FetchLike })   // 讀 /api/v1/me/suggestions
```

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/site/src/lib/links.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AVATAR_ORIGIN, avatarUrl, contributorsUrl, contributorUrl } from './config';

describe('community links', () => {
  it('builds avatar, contributor and filtered list URLs', () => {
    expect(avatarUrl('8667ba71b85a4004af54457a9734eed7', 48)).toBe('https://mc-heads.net/avatar/8667ba71b85a4004af54457a9734eed7/48');
    expect(contributorUrl(12)).toBe('/contributors/12/');
    expect(contributorsUrl()).toBe('/contributors/');
    expect(contributorsUrl('create')).toBe('/contributors/?mod=create');
  });

  it('allows the avatar origin in the CSP img-src', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(new RegExp(`img-src [^;]*${AVATAR_ORIGIN.replace(/[.]/g, '\\.')}`));
  });
});
```

```tsx
// apps/site/src/me/me.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { failure, routeFetch } from '../admin/testFetch';
import MeApp from './MeApp';
import { ME_CHANGED_EVENT } from './meApi';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
const PROFILE = { id: 5, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false };
const ME = { user: { id: 5, displayName: '史蒂夫', role: 'contributor', identities: [] }, csrfToken: 'csrf' };
const MINE = { suggestions: [{ id: 1, modId: 'create', key: 'a', proposed: '齒輪', status: 'published', reviewNote: null }] };

type Handler = (url: string, init?: RequestInit) => unknown;
function mount(extra: Record<string, Handler> = {}, me: unknown = ME) {
  const fetchImpl = routeFetch({
    'GET /api/v1/me/profile': () => ({ profile: PROFILE }),
    'GET /api/v1/me/suggestions': () => MINE,
    ...extra,
  }, me);
  render(<MeApp fetchImpl={fetchImpl as never} />);
  return fetchImpl;
}
const bodyOf = (fetchImpl: ReturnType<typeof mount>, path: string) =>
  JSON.parse(String(fetchImpl.mock.calls.find(([u, i]) => u === path && i?.method === 'POST')?.[1]?.body));

beforeEach(() => resetMe());
afterEach(() => vi.restoreAllMocks());

describe('MeApp', () => {
  it('asks anonymous visitors to log in but still lists their anonymous suggestions', async () => {
    mount({ 'GET /api/v1/me/profile': () => failure('login_required', '請先登入。', 401) }, { user: null, csrfToken: 'csrf' });
    expect(await screen.findByText(/請從右上角登入/)).toBeInTheDocument();
    expect(await screen.findByText('齒輪')).toBeInTheDocument();
    expect(screen.getByText('已發佈')).toBeInTheDocument();
    expect(screen.queryByLabelText('顯示名稱')).not.toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mount({ 'GET /api/v1/me/profile': () => failure('internal', 'x', 500) });
    expect(await screen.findByRole('alert')).toHaveTextContent('載入失敗');
  });

  it('saves the display name and public flag with CSRF, then announces the change', async () => {
    const onChange = vi.fn();
    window.addEventListener(ME_CHANGED_EVENT, onChange);
    const fetchImpl = mount({ 'POST /api/v1/me/profile': () => ({ profile: { ...PROFILE, displayName: '艾力克斯', isPublic: false } }) });
    const box = await screen.findByLabelText('顯示名稱');
    await userEvent.clear(box);
    await userEvent.type(box, '艾力克斯');
    await userEvent.click(screen.getByLabelText(/公開署名/));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已儲存。');
    expect(bodyOf(fetchImpl, '/api/v1/me/profile')).toEqual({ displayName: '艾力克斯', isPublic: false });
    expect(fetchImpl.mock.calls.find(([u, i]) => u === '/api/v1/me/profile' && i?.method === 'POST')?.[1])
      .toMatchObject({ headers: { 'X-CSRF-Token': 'csrf' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    window.removeEventListener(ME_CHANGED_EVENT, onChange);
  });

  it('shows server validation errors', async () => {
    mount({ 'POST /api/v1/me/profile': () => failure('display_name_empty', '顯示名稱不能空白。') });
    await userEvent.clear(await screen.findByLabelText('顯示名稱'));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('顯示名稱不能空白。');
  });

  it('looks up a Minecraft name and shows the avatar with an unverified badge', async () => {
    const fetchImpl = mount({
      'POST /api/v1/me/minecraft': () => ({ profile: { ...PROFILE, minecraftName: 'Steve', minecraftUuid: STEVE_UUID } }),
    });
    await userEvent.type(await screen.findByLabelText('玩家名稱'), 'steve');
    await userEvent.click(screen.getByRole('button', { name: '確認並儲存' }));
    expect(await screen.findByText('Steve')).toBeInTheDocument();
    expect(screen.getByText('未驗證')).toBeInTheDocument();
    expect(bodyOf(fetchImpl, '/api/v1/me/minecraft')).toEqual({ name: 'steve' });
    await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toBe(`https://mc-heads.net/avatar/${STEVE_UUID}/48`));
    expect(document.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('removes the Minecraft name', async () => {
    const withMc = { ...PROFILE, minecraftName: 'Steve', minecraftUuid: STEVE_UUID };
    const fetchImpl = mount({
      'GET /api/v1/me/profile': () => ({ profile: withMc }),
      'POST /api/v1/me/minecraft': () => ({ profile: PROFILE }),
    });
    await userEvent.click(await screen.findByRole('button', { name: '移除' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已移除 Minecraft 名稱。');
    expect(bodyOf(fetchImpl, '/api/v1/me/minecraft')).toEqual({ name: null });
  });

  it('reports a name Mojang does not know', async () => {
    mount({ 'POST /api/v1/me/minecraft': () => failure('minecraft_not_found', '找不到這個 Minecraft 名稱。', 404) });
    await userEvent.type(await screen.findByLabelText('玩家名稱'), 'nobody');
    await userEvent.click(screen.getByRole('button', { name: '確認並儲存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個 Minecraft 名稱。');
  });
});
```

`apps/site/src/lib/siteMeta.test.ts`：在既有 `isSitemapPage` 的 describe 內加一個 `it`：

```ts
  it('keeps /me/ and the contributor profile shell out of the sitemap', () => {
    expect(isSitemapPage('https://modlangforge.com/me/')).toBe(false);
    expect(isSitemapPage('https://modlangforge.com/contributors/profile/')).toBe(false);
    expect(isSitemapPage('https://modlangforge.com/contributors/')).toBe(true);
  });
```

（若該檔尚未匯入 `isSitemapPage`，於檔頭既有的 `./siteMeta` 匯入加上。）

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/me src/lib/links.test.ts src/lib/siteMeta.test.ts`
Expected: FAIL（模組與匯出不存在、`_headers` 未放行、NOINDEX 未包含）。

- [ ] **Step 3: 實作**

`apps/site/src/lib/config.ts` 末尾追加：

```ts
/** Minecraft 頭像服務（依 UUID）；CSP img-src 需同步放行（apps/site/public/_headers） */
export const AVATAR_ORIGIN = 'https://mc-heads.net';

export function avatarUrl(uuid: string, size: number): string {
  return `${AVATAR_ORIGIN}/avatar/${encodeURIComponent(uuid)}/${size}`;
}

export function contributorUrl(id: number): string {
  return `/contributors/${id}/`;
}

export function contributorsUrl(modId?: string): string {
  return modId ? `/contributors/?mod=${encodeURIComponent(modId)}` : '/contributors/';
}
```

`apps/site/src/lib/siteMeta.ts`：

```ts
export const NOINDEX_PATHS: readonly string[] = ['/pack/', '/404/', '/admin/', '/me/', '/contributors/profile/'];
```

`apps/site/public/_headers`：CSP 的 `img-src 'self' data:` 改為 `img-src 'self' data: https://mc-heads.net`（其他不變）。

```tsx
// apps/site/src/components/Avatar.tsx
import { avatarUrl } from '../lib/config';

interface Props {
  readonly uuid: string | null;
  readonly name: string;
  readonly size?: number;
}

/** 有 UUID 時顯示 Minecraft 頭像，否則顯示名稱首字；裝飾用，名稱另以文字呈現 */
export function Avatar({ uuid, name, size = 32 }: Props) {
  if (!uuid) {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-sm bg-surface-2 font-bold text-muted" style={{ width: size, height: size }}>
        {[...name][0] ?? '?'}
      </span>
    );
  }
  return <img src={avatarUrl(uuid, size)} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="shrink-0 rounded-sm [image-rendering:pixelated]" />;
}
```

```tsx
// apps/site/src/islands/SuggestionList.tsx
import { useEffect, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { apiGet, type FetchLike } from './api';

interface MySuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: string;
  readonly reviewNote: string | null;
}

const STATUS: Readonly<Record<string, string>> = t.account.status;

function statusText(s: MySuggestion): string {
  const label = Object.hasOwn(STATUS, s.status) ? STATUS[s.status] : s.status;
  return s.reviewNote ? `${label}：${s.reviewNote}` : `${label}`;
}

/** 目前使用者（未登入時為同一網路位置的匿名）送出的建議與狀態 */
export default function SuggestionList({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [state, setState] = useState<readonly MySuggestion[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void apiGet<{ suggestions: MySuggestion[] }>('/api/v1/me/suggestions', fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.suggestions : 'error');
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  if (state === 'loading') return <p className="text-muted">{t.suggest.loading}</p>;
  if (state === 'error') return <p role="alert" className="text-danger">{t.account.loadFailed}</p>;
  if (state.length === 0) return <p className="text-muted">{t.account.empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {state.map((s) => (
        <li key={s.id} className="py-2">
          <div className="text-xs text-muted"><code>{s.modId}</code> · <code>{s.key}</code></div>
          <div>{s.proposed}</div>
          <div className="text-xs">{statusText(s)}</div>
        </li>
      ))}
    </ul>
  );
}
```

`apps/site/src/islands/MySuggestions.tsx` 全文改為：

```tsx
import { createPortal } from 'react-dom';
import { t } from '../i18n/zh-TW';
import type { FetchLike } from './api';
import SuggestionList from './SuggestionList';
import { useModal } from './useModal';

export default function MySuggestions({ fetchImpl = fetch, loggedIn, onClose }: { readonly fetchImpl?: FetchLike; readonly loggedIn: boolean; readonly onClose: () => void }) {
  const box = useModal(true, onClose);
  // 掛到 body：Header 的 backdrop-blur 會讓 fixed 子層以 Header 為定位基準
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.account.mySuggestions} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={box} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{t.account.mySuggestions}</h3>
          <button type="button" className="link inline-flex min-h-11 items-center text-sm" onClick={onClose}>{t.account.close}</button>
        </div>
        {!loggedIn && <p className="mb-2 text-xs text-muted">{t.account.anonymousNote}</p>}
        <SuggestionList fetchImpl={fetchImpl} />
      </div>
    </div>,
    document.body,
  );
}
```

```ts
// apps/site/src/me/strings.ts
import { DISPLAY_NAME_MAX } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';

export const m = {
  title: '個人資料',
  description: '設定顯示名稱、Minecraft 名稱與是否公開署名，並查看你送出的建議。',
  disabled: '此網站尚未啟用帳號功能。',
  loading: '載入中…',
  loadFailed: '載入失敗，請稍後再試。',
  needLogin: '登入後可以設定顯示名稱與署名方式，請從右上角登入。',
  profileTitle: '顯示名稱與署名',
  displayName: '顯示名稱',
  displayNameHint: `最多 ${DISPLAY_NAME_MAX} 個字。已發佈的署名不會隨改名更新，之後的貢獻會使用新名稱。`,
  isPublic: '公開署名（列在貢獻者頁與模組署名）',
  isPublicHint: '關閉後立即從貢獻者頁移除，之後發佈的譯文也不會署名；已寫入模組資料的署名不會移除。',
  save: '儲存',
  saving: '儲存中…',
  saved: '已儲存。',
  mcTitle: 'Minecraft 帳號',
  mcName: '玩家名稱',
  mcHint: '自行填寫。會向 Mojang 確認名稱存在並顯示頭像；目前無法證明帳號屬於你，因此會標示「未驗證」。',
  mcSave: '確認並儲存',
  checking: '確認中…',
  mcClear: '移除',
  mcCleared: '已移除 Minecraft 名稱。',
  unverified: '未驗證',
  mySuggestions: t.account.mySuggestions,
  anonymousNote: t.account.anonymousNote,
} as const;
```

```ts
// apps/site/src/me/meApi.ts
import { apiGet, apiSend, resetMe, type ApiResult, type FetchLike } from '../islands/api';

export interface UserProfile {
  readonly id: number;
  readonly displayName: string;
  readonly isPublic: boolean;
  readonly minecraftName: string | null;
  readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean;
}

export type ProfileResult = ApiResult<{ profile: UserProfile }>;

/** 個人資料變更後發出；AccountMenu 監聽並重新載入右上角名稱 */
export const ME_CHANGED_EVENT = 'mlf:me-changed';

function announce(result: ProfileResult): ProfileResult {
  if (result.ok) {
    resetMe();
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
  }
  return result;
}

export function createMeApi(fetchImpl: FetchLike = fetch) {
  return {
    profile: (): Promise<ProfileResult> => apiGet<{ profile: UserProfile }>('/api/v1/me/profile', fetchImpl),
    updateProfile: async (patch: { readonly displayName?: string; readonly isPublic?: boolean }): Promise<ProfileResult> =>
      announce(await apiSend<{ profile: UserProfile }>('/api/v1/me/profile', 'POST', patch, fetchImpl)),
    setMinecraft: async (name: string | null): Promise<ProfileResult> =>
      announce(await apiSend<{ profile: UserProfile }>('/api/v1/me/minecraft', 'POST', { name }, fetchImpl)),
  };
}

export type MeApi = ReturnType<typeof createMeApi>;
```

```tsx
// apps/site/src/me/ProfileForm.tsx
import { useState } from 'react';
import type { MeApi, UserProfile } from './meApi';
import { m } from './strings';

type Notice = { readonly kind: 'ok' | 'error'; readonly text: string } | null;

interface Props {
  readonly api: MeApi;
  readonly profile: UserProfile;
  readonly onSaved: (profile: UserProfile) => void;
}

export function NoticeLine({ notice }: { readonly notice: Notice }) {
  if (!notice) return null;
  const error = notice.kind === 'error';
  return <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-danger' : 'text-sm'}>{notice.text}</p>;
}

export default function ProfileForm({ api, profile, onSaved }: Props) {
  const [name, setName] = useState(profile.displayName);
  const [isPublic, setIsPublic] = useState(profile.isPublic);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await api.updateProfile({ displayName: name, isPublic });
    setBusy(false);
    if (!r.ok) return setNotice({ kind: 'error', text: r.message });
    onSaved(r.data.profile);
    setName(r.data.profile.displayName);
    setNotice({ kind: 'ok', text: m.saved });
  };

  return (
    <form className="grid max-w-md gap-2" aria-labelledby="profile-title" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h2 id="profile-title" className="text-lg font-bold">{m.profileTitle}</h2>
      <label className="flex flex-col gap-1 text-sm">{m.displayName}
        <input className="input" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-xs text-muted">{m.displayNameHint}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />{m.isPublic}
      </label>
      <p className="text-xs text-muted">{m.isPublicHint}</p>
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.saving : m.save}</button></div>
      <NoticeLine notice={notice} />
    </form>
  );
}
```

```tsx
// apps/site/src/me/MinecraftForm.tsx
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { MeApi, UserProfile } from './meApi';
import { NoticeLine } from './ProfileForm';
import { m } from './strings';

type Notice = { readonly kind: 'ok' | 'error'; readonly text: string } | null;

interface Props {
  readonly api: MeApi;
  readonly profile: UserProfile;
  readonly onSaved: (profile: UserProfile) => void;
}

function Current({ profile }: { readonly profile: UserProfile }) {
  if (!profile.minecraftName) return null;
  return (
    <div className="flex items-center gap-3">
      <Avatar uuid={profile.minecraftUuid} name={profile.minecraftName} size={48} />
      <span className="font-semibold">{profile.minecraftName}</span>
      {!profile.minecraftVerified && <span className="rounded-sm border border-line px-1.5 text-xs text-muted">{m.unverified}</span>}
    </div>
  );
}

export default function MinecraftForm({ api, profile, onSaved }: Props) {
  const [name, setName] = useState(profile.minecraftName ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const run = async (value: string | null) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await api.setMinecraft(value);
    setBusy(false);
    if (!r.ok) return setNotice({ kind: 'error', text: r.message });
    onSaved(r.data.profile);
    setName(r.data.profile.minecraftName ?? '');
    setNotice({ kind: 'ok', text: value === null ? m.mcCleared : m.saved });
  };

  return (
    <form className="grid max-w-md gap-2" aria-labelledby="mc-title" onSubmit={(e) => { e.preventDefault(); void run(name.trim() === '' ? null : name.trim()); }}>
      <h2 id="mc-title" className="text-lg font-bold">{m.mcTitle}</h2>
      <Current profile={profile} />
      <label className="flex flex-col gap-1 text-sm">{m.mcName}
        <input className="input" value={name} maxLength={16} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-xs text-muted">{m.mcHint}</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? m.checking : m.mcSave}</button>
        {profile.minecraftName && <button type="button" className="btn" disabled={busy} onClick={() => void run(null)}>{m.mcClear}</button>}
      </div>
      <NoticeLine notice={notice} />
    </form>
  );
}
```

```tsx
// apps/site/src/me/MeApp.tsx
import { useEffect, useMemo, useState } from 'react';
import type { FetchLike } from '../islands/api';
import SuggestionList from '../islands/SuggestionList';
import { createMeApi, type UserProfile } from './meApi';
import MinecraftForm from './MinecraftForm';
import ProfileForm from './ProfileForm';
import { m } from './strings';

type State = UserProfile | 'loading' | 'anonymous' | 'error';

export default function MeApp({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const api = useMemo(() => createMeApi(fetchImpl), [fetchImpl]);
  const [state, setState] = useState<State>('loading');
  useEffect(() => {
    let alive = true;
    void api.profile().then((r) => {
      if (!alive) return;
      if (r.ok) setState(r.data.profile);
      else setState(r.code === 'login_required' ? 'anonymous' : 'error');
    });
    return () => { alive = false; };
  }, [api]);

  if (state === 'loading') return <p className="text-muted">{m.loading}</p>;
  if (state === 'error') return <p role="alert" className="text-danger">{m.loadFailed}</p>;
  return (
    <div className="grid gap-10">
      {state === 'anonymous' ? <p>{m.needLogin}</p> : (
        <>
          <ProfileForm api={api} profile={state} onSaved={setState} />
          <MinecraftForm api={api} profile={state} onSaved={setState} />
        </>
      )}
      <section aria-labelledby="my-suggestions-title">
        <h2 id="my-suggestions-title" className="mb-2 text-lg font-bold">{m.mySuggestions}</h2>
        {state === 'anonymous' && <p className="mb-2 text-xs text-muted">{m.anonymousNote}</p>}
        <SuggestionList fetchImpl={fetchImpl} />
      </section>
    </div>
  );
}
```

```astro
---
// apps/site/src/pages/me.astro
import BaseLayout from '../layouts/BaseLayout.astro';
import MeApp from '../me/MeApp';
import { m } from '../me/strings';
import { SITE_SHORT_NAME, SUGGEST_ENABLED } from '../lib/config';
---

<BaseLayout title={`${m.title} | ${SITE_SHORT_NAME}`} description={m.description} noindex>
  <h1 class="mb-6 text-2xl font-bold">{m.title}</h1>
  {SUGGEST_ENABLED ? <MeApp client:only="react" /> : <p>{m.disabled}</p>}
</BaseLayout>
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run && npm run typecheck`
Expected: PASS（含既有 `account.test.tsx` 的「我的建議」對話框測試）。

- [ ] **Step 5: Commit**

```bash
git add apps/site
git commit -m "feat(site): /me/ profile page with display name, public toggle and Minecraft name

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 7: 網站 — `/contributors/`、個人頁、導覽與模組頁連結

**Files:**
- Create: `apps/site/src/contributors/strings.ts`、`apps/site/src/contributors/contributorsApi.ts`、`apps/site/src/contributors/ContributorsList.tsx`、`apps/site/src/contributors/ContributorProfile.tsx`、`apps/site/src/contributors/contributors.test.tsx`、`apps/site/src/pages/contributors/index.astro`、`apps/site/src/pages/contributors/profile.astro`
- Modify: `apps/site/src/components/Header.astro`、`apps/site/src/pages/mods/[modId].astro`、`apps/site/src/i18n/zh-TW.ts`

**Interfaces:**
- Consumes: `GET /api/v1/contributors[?modId=]`、`GET /api/v1/contributors/:id`（Task 5）；`Avatar`、`contributorUrl`、`contributorsUrl`（Task 6）；`modUrl`、`SITE_SHORT_NAME`（`lib/config.ts`）；`MOD_ID_PATTERN`（`@mlf/core/catalog`）。
- Produces:

```ts
export interface ContributorSummary { id: number; displayName: string; minecraftUuid: string | null; published: number; mods: number }
export interface ContributorProfileData { id; displayName; minecraftName: string | null; minecraftUuid: string | null; minecraftVerified: boolean; published: number; mods: readonly { modId: string; count: number }[] }
listContributors(modId: string | null, fetchImpl?): Promise<ApiResult<{ contributors: ContributorSummary[] }>>
getContributor(id: number, fetchImpl?): Promise<ApiResult<{ contributor: ContributorProfileData }>>
contributorIdFromPath(pathname: string): number | null
modFilterFromSearch(search: string): string | null
```

- [ ] **Step 1: 寫失敗測試**

```tsx
// apps/site/src/contributors/contributors.test.tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { resetMe } from '../islands/api';
import { failure, routeFetch } from '../admin/testFetch';
import ContributorProfile from './ContributorProfile';
import ContributorsList from './ContributorsList';
import { contributorIdFromPath, modFilterFromSearch } from './contributorsApi';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
const RANKING = [
  { id: 7, displayName: 'Alice', minecraftUuid: STEVE_UUID, published: 3, mods: 2 },
  { id: 9, displayName: 'Bob', minecraftUuid: null, published: 1, mods: 1 },
];
const ALICE = {
  id: 7, displayName: 'Alice', minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false,
  published: 3, mods: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
};

beforeEach(() => resetMe());
afterEach(() => window.history.pushState({}, '', '/'));

describe('URL helpers', () => {
  it('parses contributor ids from the path', () => {
    expect(contributorIdFromPath('/contributors/12/')).toBe(12);
    expect(contributorIdFromPath('/contributors/12')).toBe(12);
    expect(contributorIdFromPath('/contributors/0/')).toBeNull();
    expect(contributorIdFromPath('/contributors/abc/')).toBeNull();
    expect(contributorIdFromPath('/contributors/profile/')).toBeNull();
    expect(contributorIdFromPath('/contributors/9999999999999999/')).toBeNull();
  });

  it('accepts only valid mod ids from ?mod=', () => {
    expect(modFilterFromSearch('?mod=create')).toBe('create');
    expect(modFilterFromSearch('?mod=..%2Fx')).toBeNull();
    expect(modFilterFromSearch('')).toBeNull();
  });
});

describe('ContributorsList', () => {
  it('ranks contributors with profile links and avatars', async () => {
    render(<ContributorsList fetchImpl={routeFetch({ 'GET /api/v1/contributors': () => ({ contributors: RANKING }) }) as never} />);
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/contributors/7/');
    expect(items[0]).toHaveTextContent('已發佈 3 條');
    expect(items[0]).toHaveTextContent('2 個模組');
    expect(items[0]!.querySelector('img')?.getAttribute('src')).toBe(`https://mc-heads.net/avatar/${STEVE_UUID}/32`);
    expect(items[1]!.querySelector('img')).toBeNull();
  });

  it('filters by ?mod= and links back to the full list', async () => {
    window.history.pushState({}, '', '/contributors/?mod=create');
    const fetchImpl = routeFetch({ 'GET /api/v1/contributors': () => ({ contributors: [] }) });
    render(<ContributorsList fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText('這個模組還沒有公開署名的社群貢獻。')).toBeInTheDocument();
    expect(screen.getByText('模組 create 的貢獻者')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看全部貢獻者' })).toHaveAttribute('href', '/contributors/');
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/contributors?modId=create')).toBe(true);
  });

  it('shows a load error', async () => {
    render(<ContributorsList fetchImpl={routeFetch({ 'GET /api/v1/contributors': () => failure('internal', 'x', 500) }) as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('載入失敗');
  });
});

describe('ContributorProfile', () => {
  it('loads the contributor from the path and lists their mods', async () => {
    window.history.pushState({}, '', '/contributors/7/');
    render(<ContributorProfile fetchImpl={routeFetch({ 'GET /api/v1/contributors/7': () => ({ contributor: ALICE }) }) as never} />);
    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('Steve')).toBeInTheDocument();
    expect(screen.getByText('未驗證')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'create' })).toHaveAttribute('href', '/mods/create/');
    expect(screen.getByText('已發佈 3 條')).toBeInTheDocument();
    expect(document.title).toContain('Alice');
  });

  it('says not found for hidden contributors and for the bare shell path', async () => {
    window.history.pushState({}, '', '/contributors/8/');
    const fetchImpl = routeFetch({ 'GET /api/v1/contributors/8': () => failure('contributor_not_found', '找不到這位貢獻者。', 404) });
    const { unmount } = render(<ContributorProfile fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText(/找不到這位貢獻者/)).toBeInTheDocument();
    unmount();
    window.history.pushState({}, '', '/contributors/profile/');
    const untouched = routeFetch({});
    render(<ContributorProfile fetchImpl={untouched as never} />);
    expect(await screen.findByText(/找不到這位貢獻者/)).toBeInTheDocument();
    expect(untouched.mock.calls.filter(([u]) => u.startsWith('/api/v1/contributors'))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/contributors`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// apps/site/src/contributors/strings.ts
export const cs = {
  title: '貢獻者',
  description: '依已發佈譯文條數排列的社群貢獻者。',
  disabled: '此網站尚未啟用貢獻者頁面。',
  loading: '載入中…',
  loadFailed: '載入失敗，請稍後再試。',
  empty: '還沒有公開署名的已發佈貢獻。',
  emptyMod: '這個模組還沒有公開署名的社群貢獻。',
  forMod: (modId: string) => `模組 ${modId} 的貢獻者`,
  showAll: '查看全部貢獻者',
  modPage: '回到模組頁',
  published: (n: number) => `已發佈 ${n} 條`,
  modCount: (n: number) => `${n} 個模組`,
  notFound: '找不到這位貢獻者，對方可能未公開署名或尚無已發佈的貢獻。',
  back: '回到貢獻者列表',
  mods: '貢獻的模組',
  unverified: '未驗證',
  note: '只列出登入且公開署名的貢獻者；匿名送出的建議被採用時不署名。Minecraft 名稱為本人自填，未經驗證。',
} as const;
```

```ts
// apps/site/src/contributors/contributorsApi.ts
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { apiGet, type ApiResult, type FetchLike } from '../islands/api';

export interface ContributorSummary {
  readonly id: number;
  readonly displayName: string;
  readonly minecraftUuid: string | null;
  readonly published: number;
  readonly mods: number;
}

export interface ContributorProfileData {
  readonly id: number;
  readonly displayName: string;
  readonly minecraftName: string | null;
  readonly minecraftUuid: string | null;
  readonly minecraftVerified: boolean;
  readonly published: number;
  readonly mods: readonly { readonly modId: string; readonly count: number }[];
}

export function listContributors(modId: string | null, fetchImpl: FetchLike = fetch): Promise<ApiResult<{ contributors: ContributorSummary[] }>> {
  const path = modId ? `/api/v1/contributors?modId=${encodeURIComponent(modId)}` : '/api/v1/contributors';
  return apiGet<{ contributors: ContributorSummary[] }>(path, fetchImpl);
}

export function getContributor(id: number, fetchImpl: FetchLike = fetch): Promise<ApiResult<{ contributor: ContributorProfileData }>> {
  return apiGet<{ contributor: ContributorProfileData }>(`/api/v1/contributors/${id}`, fetchImpl);
}

/** /contributors/<id>/ → id；格式不符或超出安全整數時回 null */
export function contributorIdFromPath(pathname: string): number | null {
  const match = /^\/contributors\/([1-9]\d{0,15})\/?$/.exec(pathname);
  const id = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(id) ? id : null;
}

/** ?mod= 參數；不合法時回 null */
export function modFilterFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('mod');
  return value !== null && MOD_ID_PATTERN.test(value) ? value : null;
}
```

```tsx
// apps/site/src/contributors/ContributorsList.tsx
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { FetchLike } from '../islands/api';
import { contributorsUrl, contributorUrl, modUrl } from '../lib/config';
import { listContributors, modFilterFromSearch, type ContributorSummary } from './contributorsApi';
import { cs } from './strings';

function Ranking({ list }: { readonly list: readonly ContributorSummary[] }) {
  return (
    <ol className="divide-y divide-line">
      {list.map((p, i) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
          <span aria-hidden="true" className="w-8 text-right font-pixel text-muted tabular-nums">{i + 1}</span>
          <Avatar uuid={p.minecraftUuid} name={p.displayName} size={32} />
          <a className="link font-semibold" href={contributorUrl(p.id)}>{p.displayName}</a>
          <span className="ml-auto text-sm text-muted">{cs.published(p.published)} · {cs.modCount(p.mods)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ContributorsList({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [modId] = useState(() => modFilterFromSearch(window.location.search));
  const [state, setState] = useState<readonly ContributorSummary[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void listContributors(modId, fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.contributors : 'error');
    });
    return () => { alive = false; };
  }, [modId, fetchImpl]);

  return (
    <div className="grid gap-4">
      {modId && (
        <p className="flex flex-wrap gap-x-3 text-sm">
          <span className="font-semibold">{cs.forMod(modId)}</span>
          <a className="link" href={contributorsUrl()}>{cs.showAll}</a>
          <a className="link" href={modUrl(modId)}>{cs.modPage}</a>
        </p>
      )}
      {state === 'loading' && <p className="text-muted">{cs.loading}</p>}
      {state === 'error' && <p role="alert" className="text-danger">{cs.loadFailed}</p>}
      {typeof state !== 'string' && state.length === 0 && <p className="text-muted">{modId ? cs.emptyMod : cs.empty}</p>}
      {typeof state !== 'string' && state.length > 0 && <Ranking list={state} />}
      <p className="text-xs text-muted">{cs.note}</p>
    </div>
  );
}
```

```tsx
// apps/site/src/contributors/ContributorProfile.tsx
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import type { FetchLike } from '../islands/api';
import { contributorsUrl, modUrl, SITE_SHORT_NAME } from '../lib/config';
import { contributorIdFromPath, getContributor, type ContributorProfileData } from './contributorsApi';
import { cs } from './strings';

type State = ContributorProfileData | 'loading' | 'missing' | 'error';

function Details({ p }: { readonly p: ContributorProfileData }) {
  return (
    <article className="grid gap-4">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar uuid={p.minecraftUuid} name={p.displayName} size={64} />
        <div>
          <h2 className="text-xl font-bold">{p.displayName}</h2>
          {p.minecraftName && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <span>{p.minecraftName}</span>
              {!p.minecraftVerified && <span className="rounded-sm border border-line px-1.5 text-xs">{cs.unverified}</span>}
            </p>
          )}
          <p className="text-sm">{cs.published(p.published)}</p>
        </div>
      </header>
      <section aria-labelledby="contributor-mods">
        <h3 id="contributor-mods" className="mb-2 font-bold">{cs.mods}</h3>
        <ul className="divide-y divide-line">
          {p.mods.map((x) => (
            <li key={x.modId} className="flex items-center justify-between py-2">
              <a className="link" href={modUrl(x.modId)}>{x.modId}</a>
              <span className="text-sm text-muted">{cs.published(x.count)}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export default function ContributorProfile({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [id] = useState(() => contributorIdFromPath(window.location.pathname));
  const [state, setState] = useState<State>(id === null ? 'missing' : 'loading');
  useEffect(() => {
    if (id === null) return undefined;
    let alive = true;
    void getContributor(id, fetchImpl).then((r) => {
      if (!alive) return;
      if (r.ok) setState(r.data.contributor);
      else setState(r.code === 'contributor_not_found' || r.code === 'invalid_body' ? 'missing' : 'error');
    });
    return () => { alive = false; };
  }, [id, fetchImpl]);
  useEffect(() => {
    if (typeof state === 'object') document.title = `${state.displayName} | ${cs.title} | ${SITE_SHORT_NAME}`;
  }, [state]);

  return (
    <div className="grid gap-6">
      {state === 'loading' && <p className="text-muted">{cs.loading}</p>}
      {state === 'error' && <p role="alert" className="text-danger">{cs.loadFailed}</p>}
      {state === 'missing' && <p>{cs.notFound}</p>}
      {typeof state === 'object' && <Details p={state} />}
      <p><a className="link" href={contributorsUrl()}>{cs.back}</a></p>
    </div>
  );
}
```

```astro
---
// apps/site/src/pages/contributors/index.astro
import BaseLayout from '../../layouts/BaseLayout.astro';
import ContributorsList from '../../contributors/ContributorsList';
import { cs } from '../../contributors/strings';
import { SITE_SHORT_NAME, SUGGEST_ENABLED } from '../../lib/config';
---

<BaseLayout title={`${cs.title} | ${SITE_SHORT_NAME}`} description={cs.description}>
  <h1 class="mb-6 text-2xl font-bold">{cs.title}</h1>
  {SUGGEST_ENABLED ? <ContributorsList client:only="react" /> : <p>{cs.disabled}</p>}
</BaseLayout>
```

```astro
---
// apps/site/src/pages/contributors/profile.astro
// Worker 對 /contributors/<id>/ 回傳此頁；island 依網址讀取 id
import BaseLayout from '../../layouts/BaseLayout.astro';
import ContributorProfile from '../../contributors/ContributorProfile';
import { cs } from '../../contributors/strings';
import { SITE_SHORT_NAME, SUGGEST_ENABLED } from '../../lib/config';
---

<BaseLayout title={`${cs.title} | ${SITE_SHORT_NAME}`} description={cs.description} noindex>
  <h1 class="mb-6 text-2xl font-bold">{cs.title}</h1>
  {SUGGEST_ENABLED ? <ContributorProfile client:only="react" /> : <p>{cs.disabled}</p>}
</BaseLayout>
```

`apps/site/src/i18n/zh-TW.ts`：`nav` 加 `contributors: '貢獻者',`；`modPage` 加 `community: '社群貢獻',` 與 `communityContributors: '查看本模組的社群貢獻者',`；`account` 加 `profile: '個人資料',`（Task 8 使用）。

`apps/site/src/components/Header.astro`：frontmatter 的 `nav` 改為

```ts
const nav = [
  { href: '/mods/', label: t.nav.mods },
  { href: '/pack/', label: t.nav.pack, badge: true },
  { href: '/translate/', label: t.nav.translate },
  // 貢獻者資料來自 Worker API；3C2 切換網域前只在建議功能開啟時顯示
  ...(SUGGEST_ENABLED ? [{ href: '/contributors/', label: t.nav.contributors }] : []),
  { href: '/about/', label: t.nav.about },
];
```

`apps/site/src/pages/mods/[modId].astro`：

- 匯入行改為 `import { contributorsUrl, githubEditUrl, githubIssueUrl, SUGGEST_ENABLED } from '../../lib/config';`
- 在 `{meta.translation.contributors.length > 0 && (…)}` 那一行之後加：

```astro
            {SUGGEST_ENABLED && (<><dt class="text-muted">{t.modPage.community}</dt><dd><a class="link" href={contributorsUrl(meta.modId)}>{t.modPage.communityContributors}</a></dd></>)}
```

（`mod.json` 的 `translation.contributors` 文字清單保留在原處，是 §1「模組頁可見署名」的來源；新的「社群貢獻」列導到 Worker 提供的即時清單。）

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: 建置兩種旗標並檢查入口（Review Focus 5）**

Run（Git Bash）：

```bash
npm run build && \
  ! grep -q 'href="/contributors/"' apps/site/dist/index.html && \
  grep -q '此網站尚未啟用貢獻者頁面' apps/site/dist/contributors/index.html && \
  grep -q '此網站尚未啟用帳號功能' apps/site/dist/me/index.html && \
  ! grep -q 'communityContributors\|查看本模組的社群貢獻者' apps/site/dist/mods/create/index.html && \
  echo "flag-off OK"
PUBLIC_SUGGEST_ENABLED=true npm run build && \
  grep -q 'href="/contributors/"' apps/site/dist/index.html && \
  grep -q '查看本模組的社群貢獻者' apps/site/dist/mods/create/index.html && \
  test -f apps/site/dist/contributors/profile/index.html && \
  echo "flag-on OK"
```

Expected: 印出 `flag-off OK` 與 `flag-on OK`。

- [ ] **Step 6: Commit**

```bash
git add apps/site
git commit -m "feat(site): contributor ranking and profile pages with mod page link

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 8: 帳號選單 — 個人資料連結、登出回饋、選單關閉、`auth_error` 清除

**Files:**
- Modify: `apps/site/src/islands/AccountMenu.tsx`、`apps/site/src/islands/account.test.tsx`

**Interfaces:**
- Consumes: `ME_CHANGED_EVENT`（Task 6）、`t.account.profile`（Task 7）、`apiSend`、`loadMe`、`resetMe`。
- Produces: 無新匯出。

- [ ] **Step 1: 寫失敗測試**（加到 `account.test.tsx` 的 `describe('AccountMenu', …)` 內；檔頭匯入補 `fireEvent`、`waitFor` 與 `import { ME_CHANGED_EVENT } from '../me/meApi';`）

```tsx
  const fail = (code: string, message: string, status = 403) => ({ ok: false, status, json: async () => ({ ok: false, error: { code, message } }) });
  const detailsOf = () => document.querySelector('details');

  it('links logged-in users to /me/', async () => {
    render(<AccountMenu fetchImpl={vi.fn(async () => res(admin)) as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    expect(screen.getByRole('link', { name: '個人資料' })).toHaveAttribute('href', '/me/');
  });

  it('closes the menu on Escape, outside clicks and after opening my suggestions', async () => {
    const fetchImpl = vi.fn(async (url: string) => res(url === '/api/v1/me/suggestions' ? { suggestions: [] } : anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('登入'));
    await waitFor(() => expect(detailsOf()).toHaveAttribute('open'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(detailsOf()).not.toHaveAttribute('open'));
    expect(document.activeElement?.tagName).toBe('SUMMARY');
    await userEvent.click(screen.getByText('登入'));
    await waitFor(() => expect(detailsOf()).toHaveAttribute('open'));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(detailsOf()).not.toHaveAttribute('open'));
    await userEvent.click(screen.getByText('登入'));
    await userEvent.click(screen.getByRole('button', { name: '我的建議' }));
    expect(await screen.findByRole('dialog', { name: '我的建議' })).toBeInTheDocument();
    expect(detailsOf()).not.toHaveAttribute('open');
  });

  it('retries logout once with a fresh CSRF token after bad_csrf', async () => {
    const meReplies = [{ ...admin, csrfToken: 'old' }, { ...admin, csrfToken: 'new' }, anon];
    let logoutCalls = 0;
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/v1/me') return res(meReplies.shift() ?? anon);
      logoutCalls += 1;
      return logoutCalls === 1 ? fail('bad_csrf', '頁面已過期，請重新整理後再試。') : res({ loggedOut: true });
    });
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByText('登入')).toBeInTheDocument();
    const tokens = fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/auth/logout').map(([, i]) => (i?.headers as Record<string, string>)['X-CSRF-Token']);
    expect(tokens).toEqual(['old', 'new']);
  });

  it('shows why logout failed', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === '/api/v1/me' ? res(admin) : fail('internal', '伺服器發生錯誤，請稍後再試。', 500)));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('伺服器發生錯誤，請稍後再試。');
    expect(screen.getByText('管理員')).toBeInTheDocument();
  });

  it('removes auth_error from the address after showing it', async () => {
    window.history.pushState({}, '', '/mods/create/?auth_error=cancelled&x=1#top');
    render(<AccountMenu fetchImpl={vi.fn(async () => res(anon)) as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('已取消登入。');
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/mods/create/?x=1#top'));
  });

  it('reloads the user when the profile changes elsewhere on the page', async () => {
    const replies = [admin, { ...admin, user: { ...admin.user, displayName: '新名字' } }];
    const fetchImpl = vi.fn(async () => res(replies.shift() ?? anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText('管理員')).toBeInTheDocument();
    resetMe();
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
    expect(await screen.findByText('新名字')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/islands/account.test.tsx`
Expected: FAIL（無「個人資料」連結、選單不會關閉、登出無訊息、參數未移除、事件未監聽）。

- [ ] **Step 3: 實作** — `apps/site/src/islands/AccountMenu.tsx` 全文：

```tsx
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n/zh-TW';
import { ME_CHANGED_EVENT } from '../me/meApi';
import { apiSend, loadMe, resetMe, type ApiResult, type FetchLike, type Me } from './api';
import MySuggestions from './MySuggestions';

const PROVIDERS = [
  { id: 'discord', label: 'Discord' },
  { id: 'github', label: 'GitHub' },
] as const;

const ERRORS: Readonly<Record<string, string>> = t.account.errors;
const LOGOUT_PATH = '/api/v1/auth/logout';

function startUrl(provider: string, link: boolean): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  const params = new URLSearchParams({ returnTo: `${url.pathname}${url.search}` });
  if (link) params.set('link', '1');
  return `/api/v1/auth/${provider}/start?${params.toString()}`;
}

function removeAuthErrorParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function AuthError() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));
  // 顯示一次後從網址移除，重新整理或分享連結時不會再出現
  useEffect(() => {
    if (code !== null) removeAuthErrorParam();
  }, [code]);
  if (!code) return null;
  return <p role="alert" className="absolute right-0 mt-1 w-56 text-xs text-danger">{Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.default}</p>;
}

/** CSRF cookie 過期（bad_csrf）時重新取得 token 再試一次 */
async function logoutWithRetry(fetchImpl: FetchLike): Promise<ApiResult<unknown>> {
  const first = await apiSend(LOGOUT_PATH, 'POST', {}, fetchImpl);
  if (first.ok || first.code !== 'bad_csrf') return first;
  resetMe();
  return apiSend(LOGOUT_PATH, 'POST', {}, fetchImpl);
}

/** 開啟時：Escape 關閉並把焦點還給 summary；點選單外關閉 */
function useMenuDismiss(open: boolean, close: () => void, root: RefObject<HTMLDivElement | null>, summary: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      summary.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close, root, summary]);
}

function useMe(fetchImpl: FetchLike) {
  const [me, setMe] = useState<Me | null>(null);
  const reload = useCallback(async () => {
    const result = await loadMe(fetchImpl);
    if (result.ok) setMe(result.data);
  }, [fetchImpl]);
  useEffect(() => {
    let alive = true;
    void loadMe(fetchImpl).then((result) => {
      if (alive && result.ok) setMe(result.data);
    });
    const onChanged = () => void reload();
    window.addEventListener(ME_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(ME_CHANGED_EVENT, onChanged);
    };
  }, [fetchImpl, reload]);
  return { me, reload };
}

export default function AccountMenu({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const { me, reload } = useMe(fetchImpl);
  const [open, setOpen] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const closeMine = useCallback(() => setShowMine(false), []);
  useMenuDismiss(open, close, root, summary);

  const logout = async () => {
    setLogoutError(null);
    const result = await logoutWithRetry(fetchImpl);
    if (!result.ok) return setLogoutError(result.message);
    setOpen(false);
    resetMe();
    await reload();
  };
  const openMine = () => {
    setOpen(false);
    setShowMine(true);
  };

  if (!me) return null;
  const user = me.user;
  const linked = new Set(user?.identities.map((i) => i.provider) ?? []);
  return (
    <div ref={root} className="relative text-sm">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary ref={summary} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-muted hover:bg-surface-2 hover:text-fg">
          {user ? user.displayName : t.account.login}
        </summary>
        <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-2 rounded-sm border-2 border-line-strong bg-surface p-3">
          {!user && PROVIDERS.map((p) => <a key={p.id} className="link" href={startUrl(p.id, false)}>{t.account.loginWith(p.label)}</a>)}
          {user && <a className="link" href="/me/">{t.account.profile}</a>}
          <button type="button" className="link text-left" onClick={openMine}>{t.account.mySuggestions}</button>
          {user && PROVIDERS.filter((p) => !linked.has(p.id)).map((p) => <a key={p.id} className="link" href={startUrl(p.id, true)}>{t.account.linkWith(p.label)}</a>)}
          {user && user.role !== 'contributor' && <a className="link" href="/admin/">{t.account.admin}</a>}
          {user && <button type="button" className="link text-left" onClick={() => void logout()}>{t.account.logout}</button>}
          {logoutError && <p role="alert" className="text-xs text-danger">{logoutError}</p>}
        </div>
      </details>
      <AuthError />
      {showMine && <MySuggestions fetchImpl={fetchImpl} loggedIn={user !== null} onClose={closeMine} />}
    </div>
  );
}
```

（若 jsdom 對 `summary` 點擊未切換 `open`：`userEvent.click` 會觸發原生 activation behavior，jsdom 29 已實作；若 CI 仍失敗，於測試中改以 `fireEvent.click(summary)` 後 `await waitFor(...)`，不要改元件。）

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run && npm run typecheck && cd ../.. && npm run lint`
Expected: PASS（既有三個 AccountMenu 測試仍通過）。

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/islands
git commit -m "fix(site): account menu closes properly, reports logout errors and links to /me/

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 9: Worker — 撤回模組狀態變更、審核佇列截斷旗標、推送後記錄 commit

**Files:**
- Modify: `apps/worker/src/repo/reviewTypes.ts`、`apps/worker/src/repo/d1Review.ts`、`apps/worker/src/routes/adminReview.ts`、`apps/worker/src/routes/adminPublish.ts`、`apps/worker/src/publish/runPublish.ts`
- Test: `apps/worker/src/routes/adminReview.test.ts`、`apps/worker/src/routes/adminPublish.test.ts`、`apps/worker/src/routes/adminAccess.test.ts`

**Interfaces:**
- Produces:

```ts
export type WithdrawOutcome = 'withdrawn' | 'not_found' | 'publish_in_progress';
// ReviewRepo 新增：
withdrawStatusChange(id: number, now: string): Promise<WithdrawOutcome>;
// adminReview.ts
export const QUEUE_LIMIT = 500;
GET /api/v1/admin/suggestions → { suggestions: AdminSuggestion[]; truncated: boolean }
DELETE /api/v1/admin/mods/status-changes/:id（review）→ 200 { id }｜400｜404 status_change_not_found｜409 publish_in_progress
// adminPublish.ts
GET /api/v1/admin/publish → statusChanges: { id: number; modId: string; status: string }[]
```

- [ ] **Step 1: 寫失敗測試**

`adminAccess.test.ts` 的 `ADMIN_ENDPOINTS` 末尾加：

```ts
  { method: 'DELETE', route: '/api/v1/admin/mods/status-changes/:id', path: '/api/v1/admin/mods/status-changes/999', minRole: 'reviewer' },
```

`adminReview.test.ts` 檔頭匯入加 `import { QUEUE_LIMIT } from './adminReview';`，檔尾加：

```ts
describe('status change withdrawal and queue truncation', () => {
  const del = async (path: string, who: Actor) => app.request(path, { method: 'DELETE', headers: await writeHeaders(who) }, testEnv({ DB: db }));
  const addStatus = (createdBy: number) =>
    createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy, now: TEST_NOW.toISOString() });

  it('withdraws a pending status change and removes it from the publish summary', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const admin = await createUser(db, 'admin');
    const id = await addStatus(reviewer.id);
    const before = await readJson<{ statusChanges: unknown[] }>(await get('/api/v1/admin/publish', admin));
    expect(before.data.statusChanges).toEqual([{ id, modId: 'create', status: 'reviewed' }]);
    expect((await del(`/api/v1/admin/mods/status-changes/${id}`, reviewer)).status).toBe(200);
    expect((await readJson<{ statusChanges: unknown[] }>(await get('/api/v1/admin/publish', admin))).data.statusChanges).toEqual([]);
    const again = await del(`/api/v1/admin/mods/status-changes/${id}`, reviewer);
    expect([again.status, (await readJson(again)).error.code]).toEqual([404, 'status_change_not_found']);
    expect((await del('/api/v1/admin/mods/status-changes/abc', reviewer)).status).toBe(400);
  });

  it('refuses while a publish holds the lock and never withdraws published changes', async () => {
    const admin = await createUser(db, 'admin');
    const repos = createD1Repos(db);
    const id = await addStatus(admin.id);
    const lock = await repos.review.acquirePublishLock(admin.id, TEST_NOW);
    if (!lock) throw new Error('setup');
    const busy = await del(`/api/v1/admin/mods/status-changes/${id}`, admin);
    expect([busy.status, (await readJson(busy)).error.code]).toEqual([409, 'publish_in_progress']);
    await repos.review.completePublish({ lock, commitSha: 'abc123', results: [], statusChangeIds: [id] });
    expect((await del(`/api/v1/admin/mods/status-changes/${id}`, admin)).status).toBe(404);
  });

  it('flags a truncated queue', async () => {
    const reviewer = await createUser(db, 'reviewer');
    await db.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
                      INSERT INTO suggestions (mod_id, key, proposed, author_hash, status, created_at)
                      SELECT 'create', 'k' || i, 'x', 'h', 'pending', ?2 FROM n`).bind(QUEUE_LIMIT + 1, TEST_NOW.toISOString()).run();
    const full = await readJson<{ suggestions: unknown[]; truncated: boolean }>(await get('/api/v1/admin/suggestions', reviewer));
    expect(full.data.suggestions).toHaveLength(QUEUE_LIMIT);
    expect(full.data.truncated).toBe(true);
    const other = await readJson<{ truncated: boolean }>(await get('/api/v1/admin/suggestions?modId=jei', reviewer));
    expect(other.data.truncated).toBe(false);
  });
});
```

`adminPublish.test.ts` 的 `describe('POST /api/v1/admin/publish', …)` 內加：

```ts
  it('logs the pushed commit when recording the publish fails afterwards', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = (d: D1Database): Repos => {
      const repos = createD1Repos(d);
      return { ...repos, review: { ...repos.review, completePublish: async () => { throw new Error('d1 down'); } } };
    };
    const { fake, publish } = setup({ repos: failing });
    const res = await publish(admin);
    expect(res.status).toBe(500);
    expect(errors).toHaveBeenCalledWith('publish pushed but recording it failed', fake.head());
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/adminReview.test.ts src/routes/adminPublish.test.ts src/routes/adminAccess.test.ts`
Expected: FAIL（`QUEUE_LIMIT` 未匯出、DELETE 路由不存在、摘要缺 id、未記錄 sha）。

- [ ] **Step 3: 實作**

`apps/worker/src/repo/reviewTypes.ts`：在 `RejectOutcome` 之後加

```ts
export type WithdrawOutcome = 'withdrawn' | 'not_found' | 'publish_in_progress';
```

`ReviewRepo` 的 `listPendingStatusChanges()` 之後加：

```ts
  /** 只刪尚未發佈（batch_id 為 NULL）的狀態變更；有未過期發佈鎖時回 publish_in_progress */
  withdrawStatusChange(id: number, now: string): Promise<WithdrawOutcome>;
```

`apps/worker/src/repo/d1Review.ts`：`createD1Review` 回傳物件中 `listPendingStatusChanges` 之後加：

```ts
    async withdrawStatusChange(id, now) {
      // 發佈進行中不可撤回：該變更可能已在發佈計畫中
      const staleBefore = new Date(new Date(now).getTime() - PUBLISH_LOCK_TTL_MS).toISOString();
      const result = await db
        .prepare(`DELETE FROM mod_status_changes WHERE id = ?1 AND batch_id IS NULL
                    AND NOT EXISTS (SELECT 1 FROM publish_batches WHERE commit_sha IS NULL AND created_at > ?2)`)
        .bind(id, staleBefore)
        .run();
      if (result.meta.changes === 1) return 'withdrawn';
      const row = await db.prepare('SELECT batch_id FROM mod_status_changes WHERE id = ?').bind(id).first<{ batch_id: number | null }>();
      return row !== null && row.batch_id === null ? 'publish_in_progress' : 'not_found';
    },
```

`apps/worker/src/routes/adminReview.ts`：

- `const LIST_LIMIT = 500;` 改為 `export const QUEUE_LIMIT = 500;`
- 新增處理函式（放在 `handleModStatus` 之後）：

```ts
async function handleWithdrawStatus(c: Ctx, deps: AppDeps): Promise<Response> {
  const parsed = idParam.safeParse(c.req.param('id'));
  if (!parsed.success) return invalidBody(c);
  const outcome = await c.get('repos').review.withdrawStatusChange(parsed.data, deps.now().toISOString());
  if (outcome === 'publish_in_progress') return fail(c, 409, 'publish_in_progress', '發佈進行中，請稍後再撤回。');
  return outcome === 'withdrawn' ? ok(c, { id: parsed.data }) : fail(c, 404, 'status_change_not_found', '找不到這筆待發佈的模組狀態變更。');
}
```

- `registerAdminReviewRoutes` 的 GET 清單改為多取一列判斷截斷，並註冊 DELETE：

```ts
  app.get('/api/v1/admin/suggestions', requirePermission('review'), async (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return invalidBody(c);
    const rows = await c.get('repos').review.list({ status: query.data.status, modId: query.data.modId ?? null, limit: QUEUE_LIMIT + 1 });
    return ok(c, { suggestions: rows.slice(0, QUEUE_LIMIT), truncated: rows.length > QUEUE_LIMIT });
  });
```

```ts
  app.delete('/api/v1/admin/mods/status-changes/:id', requireWrite, requirePermission('review'), (c) => handleWithdrawStatus(c, deps));
```

`apps/worker/src/routes/adminPublish.ts` 的 `handleSummary`：

```ts
    statusChanges: statusChanges.map((s) => ({ id: s.id, modId: s.modId, status: s.status })),
```

`apps/worker/src/publish/runPublish.ts` 的 `publishBatch` 中 `catch (err)` 區塊改為：

```ts
  } catch (err) {
    if (err instanceof Error && err.message === LOCK_LOST) return { kind: 'lock_lost', commitSha: sha };
    // commit 已在 main 但 D1 未更新：記下 sha 供人工比對（下次發佈會把已套用的條目標為已取代）
    if (sha !== null) console.error('publish pushed but recording it failed', sha);
    throw err;
  }
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npm run typecheck && npm run test:coverage`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): withdraw status changes, flag truncated queues, log pushed sha on failure

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 10: 管理頁 — 撤回、截斷提示、封鎖確認、儲存中提示、草稿說明

**Files:**
- Modify: `apps/site/src/admin/adminApi.ts`、`apps/site/src/admin/strings.ts`、`apps/site/src/admin/PublishPanel.tsx`、`apps/site/src/admin/ReviewQueue.tsx`、`apps/site/src/admin/SuggestionCard.tsx`、`apps/site/src/admin/useDirectEdit.ts`、`apps/site/src/admin/DirectEditor.tsx`
- Test: `apps/site/src/admin/panels.test.tsx`、`apps/site/src/admin/review.test.tsx`、`apps/site/src/admin/editor.test.tsx`

**Interfaces:**
- Consumes: Task 9 的 API。
- Produces（`adminApi.ts`）：

```ts
export interface PendingStatusChange { readonly id: number; readonly modId: string; readonly status: string }
PublishSummary.statusChanges: readonly PendingStatusChange[]
listSuggestions(...) → ApiResult<{ suggestions: AdminSuggestion[]; truncated?: boolean }>
withdrawStatusChange(id: number) → ApiResult<{ id: number }>
```

- [ ] **Step 1: 改寫／新增測試**

`panels.test.tsx`：

- `const summary = …` 的 `statusChanges` 改為 `[{ id: 1, modId: 'create', status: 'reviewed' }]`；`labels pending status changes in Chinese` 測試的 `statusChanges` 改為 `[{ id: 1, modId: 'create', status: 'reviewed' }, { id: 2, modId: 'jei', status: 'partial' }]`（文字放在獨立的 `<span>`，既有 `getByText` 斷言不需修改）。
- 在 `describe('PublishPanel', …)` 內加：

```tsx
  it('withdraws a pending status change and reloads the summary', async () => {
    let withdrawn = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => (withdrawn ? { approved: 0, mods: [], statusChanges: [] } : { approved: 0, mods: [], statusChanges: [{ id: 4, modId: 'create', status: 'reviewed' }] }),
      'DELETE /api/v1/admin/mods/status-changes/4': () => { withdrawn = true; return { id: 4 }; },
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '撤回 create 的狀態變更' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已撤回模組狀態變更。');
    expect(await screen.findByText('目前沒有可發佈的變更。')).toBeInTheDocument();
    const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/mods/status-changes/4');
    expect(call?.[1]).toMatchObject({ method: 'DELETE', headers: { 'X-CSRF-Token': 'csrf' } });
  });
```

`review.test.tsx`：

- 把 `lets admins block the author subject` 改為需要確認：

```tsx
  it('lets admins block the author subject after confirming', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/blocks': () => ({ subject: 'x' }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '封鎖此來源' }));
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/blocks')).toBe(false);
    await userEvent.click(within(card).getByRole('button', { name: '取消' }));
    await userEvent.click(within(card).getByRole('button', { name: '封鎖此來源' }));
    await userEvent.click(within(card).getByRole('button', { name: '確認封鎖' }));
    await waitFor(() => {
      const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/blocks');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ subject: `ip:${'a'.repeat(64)}`, reason: '由建議 #1 封鎖' });
    });
  });
```

- 在 `describe('ReviewQueue', …)` 內加：

```tsx
  it('says when the queue is truncated', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/suggestions': () => ({ suggestions: [item()], truncated: true }),
      'GET /api/v1/mods/create.json': () => ({ ok: true, status: 200, json: async () => MOD }),
    });
    render(<AdminApp fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText(/清單過長/)).toBeInTheDocument();
  });
```

`editor.test.tsx`：

- 在 `does not send duplicate writes for the same key while one is in flight` 測試中，第二次按「儲存 b」之後、`release()` 之前加：

```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('b 仍在儲存中');
```

- 在 `describe('DirectEditor', …)` 內加：

```tsx
  it('explains that unsaved drafts are discarded', async () => {
    mount();
    await open();
    expect(await screen.findByText(/只有按 Enter 或「儲存」的修改會暫存/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/admin`
Expected: FAIL（無撤回按鈕、無截斷提示、封鎖直接送出、無儲存中提示與草稿說明）。

- [ ] **Step 3: 實作**

`adminApi.ts`：

```ts
export interface PendingStatusChange {
  readonly id: number;
  readonly modId: string;
  readonly status: string;
}

export interface PublishSummary {
  readonly approved: number;
  readonly mods: readonly { readonly modId: string; readonly count: number }[];
  readonly statusChanges: readonly PendingStatusChange[];
}
```

`createAdminApi` 中：

```ts
    listSuggestions: (status: SuggestionStatus, modId?: string) =>
      apiGet<{ suggestions: AdminSuggestion[]; truncated?: boolean }>(`/api/v1/admin/suggestions?${query({ status, modId })}`, fetchImpl),
```

並在 `setModStatus` 之後加：

```ts
    withdrawStatusChange: (id: number) => apiSend<{ id: number }>(`/api/v1/admin/mods/status-changes/${id}`, 'DELETE', undefined, fetchImpl),
```

`strings.ts` 加：

```ts
  withdraw: '撤回',
  withdrawFor: (modId: string) => `撤回 ${modId} 的狀態變更`,
  withdrawn: '已撤回模組狀態變更。',
  truncated: '清單過長，只顯示前面的部分；請以模組 ID 篩選查看其餘建議。',
  confirmBlock: '確認封鎖',
  stillSaving: (key: string) => `${key} 仍在儲存中，請等它完成後再儲存一次。`,
  draftHint: '只有按 Enter 或「儲存」的修改會暫存；捲動離開、切換分頁或關閉頁面會捨棄未儲存的輸入。',
```

`PublishPanel.tsx`：在 `publish` 函式之後加

```tsx
  const withdraw = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const r = await api.withdrawStatusChange(id);
    setBusy(false);
    setResult(r.ok ? { kind: 'ok', text: s.withdrawn } : { kind: 'error', text: r.message });
    await load();
  };
```

並把狀態變更清單改為：

```tsx
          <ul>
            {summary.statusChanges.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <span>{`${x.modId} → ${statusLabel(x.status)}`}</span>
                <button type="button" className="link text-xs" disabled={busy} aria-label={s.withdrawFor(x.modId)} onClick={() => void withdraw(x.id)}>{s.withdraw}</button>
              </li>
            ))}
          </ul>
```

`ReviewQueue.tsx`：

- 在 `const [notice, setNotice] = …` 之後加 `const [truncated, setTruncated] = useState(false);`
- effect 內 `then` 改為：

```tsx
    void api.listSuggestions(filter.status, filter.modId || undefined).then((result) => {
      if (!alive) return;
      setList(result.ok ? result.data.suggestions : 'error');
      setTruncated(result.ok && result.data.truncated === true);
    });
```

- 在 `{notice && …}` 之後加：

```tsx
      {truncated && <p className="mb-2 text-sm text-warn">{s.truncated}</p>}
```

`SuggestionCard.tsx`：

- `type Mode = 'view' | 'edit' | 'reject';` 改為 `type Mode = 'view' | 'edit' | 'reject' | 'block';`
- view 模式的封鎖按鈕改為 `onClick={() => setMode('block')}`：

```tsx
          {isAdmin && <button type="button" className="btn" onClick={() => setMode('block')}>{s.blockAuthor}</button>}
```

- 在 `{mode === 'reject' && …}` 之後加：

```tsx
      {mode === 'block' && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => void run(() => api.addBlock(item.authorSubject, s.blockReason(item.id)), s.blocked)}>{s.confirmBlock}</button>
          <button type="button" className="btn" onClick={back}>{s.cancel}</button>
        </div>
      )}
```

`useDirectEdit.ts` 的 `commit` 開頭改為：

```ts
    if (inFlight.current.has(key)) {
      setMessage({ kind: 'error', text: s.stillSaving(key) });
      return;
    }
```

`DirectEditor.tsx`：在 `<ModStatusControl … />` 之後加：

```tsx
          <p className="text-xs text-muted">{s.draftHint}</p>
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/admin
git commit -m "feat(site): admin withdraw, truncation notice, block confirm and save feedback

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 11: E2E — 個人資料、Minecraft 名稱與貢獻者頁

**Files:**
- Create: `e2e/profile-contributors.spec.ts`
- Modify: `e2e/fake-github.ts`、`playwright.config.ts`

**Interfaces:**
- Consumes: `createFakeMojang`、`isMojangPath`（Task 3）；`POST /api/v1/auth/test-login`；Task 4–8 的頁面。
- 假伺服器：`E2E_PORT + 1` 同時回應 GitHub 與 Mojang（`/users/profiles/minecraft/*`）。

- [ ] **Step 1: 寫失敗的 E2E**

```ts
// e2e/profile-contributors.spec.ts
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const WRANGLER_BIN = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

function d1(sql: string): void {
  execFileSync(process.execPath, [WRANGLER_BIN, 'd1', 'execute', 'DB', '--local', '--command', sql], { stdio: 'pipe' });
}

async function testLogin(page: Page, providerUserId: string, displayName: string): Promise<void> {
  const status = await page.evaluate(async ({ id, name }) => {
    const me = await fetch('/api/v1/me');
    const { data } = (await me.json()) as { data: { csrfToken: string } };
    const res = await fetch('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
      body: JSON.stringify({ provider: 'discord', providerUserId: id, username: id, displayName: name }),
    });
    return res.status;
  }, { id: providerUserId, name: displayName });
  expect(status).toBe(200);
}

test('a contributor edits the profile and appears on the contributor pages', async ({ page }) => {
  // 每次執行用新身分，避免本機 D1 殘留的名稱或頻率紀錄影響結果
  const stamp = Date.now();
  const providerUserId = `e2e-profile-${stamp}`;
  const newName = `E2E 改名 ${stamp % 100000}`;
  await page.route('https://mc-heads.net/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));

  await page.goto('/me/');
  await expect(page.getByText(/請從右上角登入/)).toBeVisible();
  await testLogin(page, providerUserId, 'E2E 貢獻者');
  await page.reload();

  await page.getByLabel('顯示名稱', { exact: true }).fill(newName);
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已儲存。' })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: newName })).toBeVisible();

  await page.getByLabel('玩家名稱').fill('steve');
  await page.getByRole('button', { name: '確認並儲存' }).click();
  await expect(page.getByText('Steve', { exact: true })).toBeVisible();
  await expect(page.getByText('未驗證')).toBeVisible();

  // 已發佈的建議直接寫入本機 D1；完整發佈流程由 review-publish.spec 覆蓋（平行執行時避免爭用發佈鎖）
  d1(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
      SELECT 'create', 'e2e.profile.${stamp}', 'x', user_id, 'e2e', 'published', '2026-10-16T00:00:00.000Z'
      FROM identities WHERE provider = 'discord' AND provider_user_id = '${providerUserId}'`);

  await page.goto('/contributors/?mod=create');
  const link = page.getByRole('link', { name: newName });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/contributors\/\d+\/$/);
  await link.click();
  await expect(page.getByRole('heading', { name: newName })).toBeVisible();
  await expect(page.getByRole('link', { name: 'create' })).toHaveAttribute('href', '/mods/create/');
  await expect(page.locator(`img[src*="${STEVE_UUID}"]`).first()).toBeVisible();

  // 無斜線的網址 301 到頁殼
  const bare = await page.request.get(href!.replace(/\/$/, ''), { maxRedirects: 0 });
  expect(bare.status()).toBe(301);
});

test('a hidden contributor profile says not found', async ({ page }) => {
  await page.goto('/contributors/999999999/');
  await expect(page.getByText(/找不到這位貢獻者/)).toBeVisible();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test e2e/profile-contributors.spec.ts`
Expected: FAIL（`MOJANG_API_BASE` 仍指向 api.mojang.com，假伺服器不回應 Mojang 路徑 → 502「暫時無法連線到 Mojang」或本機無網路時連線失敗）。

- [ ] **Step 3: 假伺服器轉送 Mojang、Playwright 傳入變數**

`e2e/fake-github.ts`：

- 匯入加 `import { createFakeMojang, isMojangPath } from '../apps/worker/src/mojang/fakeMojang';`，在 `const fake = createFakeGithub(files);` 之後加 `const mojang = createFakeMojang();`
- 新增共用回寫函式（放在 `readBody` 之後）：

```ts
async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
```

- `handle` 中 `/__reset` 判斷之後、`const method = …` 之前加：

```ts
  // 同一個假伺服器也扮演 Mojang（MOJANG_API_BASE 指向此埠）
  if (isMojangPath(url.pathname)) {
    await send(res, await mojang.fetch(url.href, { headers: { 'User-Agent': String(req.headers['user-agent'] ?? '') } }));
    return;
  }
```

- `handle` 尾端原本的三行（設定 statusCode、headers、`res.end`）改為 `await send(res, response);`。

`playwright.config.ts`：wrangler dev 指令加 `--var MOJANG_API_BASE:${FAKE_GITHUB_ORIGIN}`：

```ts
      command: `npx tsx e2e/prepare-dev-vars.ts && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT} --var SITE_URL:${ORIGIN} --var GITHUB_API_BASE:${FAKE_GITHUB_ORIGIN} --var MOJANG_API_BASE:${FAKE_GITHUB_ORIGIN}`,
```

並把 `// 假 GitHub 佔用 E2E_PORT + 1` 註解改為 `// 假 GitHub／假 Mojang 佔用 E2E_PORT + 1：並行 worktree 的 E2E_PORT 至少要差 2。`

- [ ] **Step 4: 執行確認通過**

Run: `cp .dev.vars.example .dev.vars && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`
Expected: 全部 E2E 通過（含新兩個）。本機重複執行超過 100 次使排名超出上限時，刪除 `.wrangler/state` 後重跑。

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: e2e profile editing, Minecraft lookup and contributor pages

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

### Task 12: 文件與全套驗證

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

「功能」清單在「靜態 API」之前加：

```markdown
- **個人資料**（`/me/`）：登入者可設定顯示名稱、是否公開署名、自填 Minecraft 名稱（向 Mojang 確認存在並顯示頭像，標示「未驗證」），並查看自己送出的建議。
- **貢獻者**（`/contributors/`）：依已發佈譯文條數排列公開署名的貢獻者，`/contributors/<id>/` 為個人頁；資料由 Worker 即時提供。
```

「開發」程式碼區塊中，在 `# 管理頁與發佈：…` 兩行之後加：

```
# Minecraft 名稱查詢走 MOJANG_API_BASE（wrangler.jsonc 預設 https://api.mojang.com）；E2E 以 --var 指向假伺服器（E2E_PORT+1，名稱 steve／alex 存在）。
# 頭像來自 https://mc-heads.net（CSP img-src 已放行，見 apps/site/public/_headers）。
```

- [ ] **Step 2: 全套驗證**

Run: `npm run lint && npm test && npm run test:coverage -w @mlf/core && npm run test:coverage -w @mlf/worker && npm run typecheck -w @mlf/site && npm run typecheck -w @mlf/worker && npm run validate:data && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`
Expected: 全部通過；記下測試數（core、site、worker、E2E）與 worker 覆蓋率。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: profile, contributor pages and Mojang lookup notes

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

---

## 自我檢查（撰寫時已完成）

- 規格對照：§5.4 `/me/` 顯示名稱、Minecraft 名稱（自填、未驗證、Mojang 確認、UUID 頭像）、是否公開、我的建議與狀態（Task 1–4、6）；§5.5 排名（僅 public=1 且未封鎖）、頭像、名稱、貢獻模組、`/contributors/<id>/`、由 Worker API 提供＋island 呈現、匿名不署名（Task 5、7）；§1 模組頁可見署名（既有 `mod.json` 清單＋Task 7 連結）；§3 `run_worker_first` 的 `/api/v1/me*` 已存在、新增 `/api/v1/contributors*`、`/contributors/*`（Task 5）；§7 寫入 API Origin＋CSRF、zod、中文錯誤、外部請求記錄不含使用者資料（Task 4）；§9 個人頁、貢獻者頁 island 測試與 E2E（Task 6、7、11）；§10 3.1 不做，`minecraft_verified` 恆 0（Task 2、4）。
- 不在本計畫：§5.3 步驟 7、§8 步驟 3、5、6、7、§11 檔案數警告 → 3C2。
- 型別一致：`UserProfile`（worker `repo/types.ts` ↔ site `me/meApi.ts` 欄位相同）；`ContributorSummary`／`ContributorProfile`（worker）↔ `ContributorSummary`／`ContributorProfileData`（site）欄位相同；`PendingStatusChange.id` ↔ `handleSummary` 的 `id`；`QUEUE_LIMIT`、`MOJANG_LOOKUPS_PER_HOUR`、`PROFILE_SHELL_PATH` 只在定義檔與測試使用；`ME_CHANGED_EVENT` 由 Task 6 定義、Task 8 消費。
- Review Focus 每一項都有對應測試或建置檢查（Task 1/2/4、3/4、5、5/7/11、7 Step 5）。
