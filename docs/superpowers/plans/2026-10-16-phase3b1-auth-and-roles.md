# 第三階段 3B1：登入、Session、CSRF 與角色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者以 Discord／GitHub 登入（可綁定第二種來源）、以簽章 cookie 維持 session，所有寫入 API 加上 Origin＋雙重提交 CSRF，建立 admin／reviewer／contributor 角色、封鎖與停權，登入者的建議帶署名並可查詢「我的建議」。

**Architecture:** 權限表、身分來源、主體格式等純邏輯放 `packages/core/src/review`；Worker 端以 WebCrypto 做 HMAC 簽章 token（session 與 OAuth state 共用、以 `typ` 區分），session 不建表，靠 `users.session_version` 使舊 cookie 失效。所有 repo 改為只有 D1 實作，測試以 wrangler `getPlatformProxy` 開本機 D1（每個測試檔一個）。前端以 `api.ts` 統一呼叫 API 並自動帶 CSRF header，Header 加上帳號選單 island。

**Tech Stack:** Hono 4.13.12（`hono/cookie`）、zod 4、WebCrypto（HMAC-SHA256）、wrangler 4.145.0 `getPlatformProxy`、Vitest 5、React 18、Playwright。**不新增任何 npm 依賴。**

**Spec:** `docs/superpowers/specs/2026-10-15-phase3-community-review-design.md`

**後續計畫：** `docs/superpowers/plans/2026-10-16-phase3b2-review-and-publish.md`（審核 UI／API、直接編輯、模組狀態、GitHub App 發佈、完整 E2E、部署）。

## 範圍

**3B 拆成兩份計畫，各自產出可測、可運作的軟體：**

| 計畫 | 內容 |
|---|---|
| **3B1（本檔）** | 規格 §5.4 登入（Discord、GitHub App 使用者授權）、綁定第二來源、`ADMIN_BOOTSTRAP`、§4 session cookie／`session_version`、§7 Origin＋CSRF、§6 權限 middleware 與每支 admin API 拒絕測試、角色管理與封鎖（API）、停權、登入者署名建議（rate subject `user:<id>`）、查詢我的建議、最小登入 UI、測試用登入路由、啟動時 secrets 驗證、`run_worker_first` 擴充 |
| **3B2** | §5.2 審核（`/admin/` UI 與 API、比較、核准／修改後核准／退回、superseded）、直接編輯（虛擬捲動全表）、模組狀態、§5.3 發佈（GitHub App installation token、Contents API、core 套用與衝突、署名合併、Git Data API fast-forward、重試一次、全有或全無）、`/admin/` 角色與封鎖面板、完整 E2E、部署 |
| **3C（不在 3B）** | `/me/` 個人頁與 Minecraft 名稱／Mojang 查詢、`/contributors/` 頁、modlangforge.com 從 Pages 移到 Worker 自訂網域、Workers Builds、Pages 轉址、檔案數 CI 警告、移除 `PUBLIC_SUGGEST_ENABLED` 旗標 |

3B 只保留最小的 `GET /api/v1/me`（目前使用者＋CSRF token）供登入 UI 使用；完整個人資料頁屬 3C。

## 目前部署狀態（執行前須知）

- 正式站 https://modlangforge.com 由 Cloudflare **Pages** 提供（push `main` 自動部署，`PUBLIC_SUGGEST_ENABLED` 未開）；www 與 modlangforge.pages.dev 301 到它。
- Worker `modlangforge` 測試站 https://modlangforge.jack3555tw.workers.dev 為手動 `wrangler deploy`，建議功能旗標已開。D1 `modlangforge`（id `fad76eba-4f80-4439-bf81-9eb1d2012870`）已套用 0001。Turnstile sitekey `0x4AAAAAAFXt3PiifcT-YOeA`。
- 3B1 不部署；3B2 最後一個 Task 一併部署（需使用者逐步同意）。本計畫的 `wrangler.jsonc`／secret 變更在部署前不影響線上。

## 3A 遺留小問題（本計畫處理）

| 問題 | 處理位置 |
|---|---|
| `run_worker_first` 未涵蓋規格 §3 全部路徑 | Task 11 |
| repo 契約測試缺登入作者情境 | Task 2 |
| upsert 非原子（先 SELECT 再 UPDATE／INSERT） | Task 2（單一 D1 batch 交易） |
| 頻率限制先查再寫（check-then-act） | Task 2（單一條件 INSERT） |
| 失敗嘗試不計入頻率 | Task 3、Task 8（通過格式檢查即計數，早於 Turnstile 與內容驗證） |
| Turnstile 未比對 `hostname` | Task 8 |
| POST 路由收到 GET 回 404 而非 405 | Task 3 |
| `deps.repo(env)` 每請求建兩次 | Task 3（middleware 建一次放進 context） |
| `memoryRepo.ts` 重複 import | Task 3（移除記憶體 repo） |
| `TurnstileWidget` 載入競態（script 已載入後再掛載會永遠等不到 load） | Task 10 |
| 每列「建議修改」按鈕無障礙名稱相同 | Task 10（`aria-label` 含 key） |

## Global Constraints

- 不新增 npm 依賴；HMAC、隨機值一律用 WebCrypto（`crypto.subtle`、`crypto.getRandomValues`）。
- 回應格式 `{ ok: true, data } | { ok: false, error: { code, message } }`；`message` 為中文、不含內部細節；所有 `/api/*` 回應帶 `Cache-Control: no-store`。
- Cookie 一律 `HttpOnly; Secure; SameSite=Lax`。Session cookie `mlf_session`（`Path=/`，30 天）；CSRF cookie `mlf_csrf`（`Path=/`，30 天，值由 `GET /api/v1/me` 回傳給前端）；OAuth state cookie `mlf_oauth`（`Path=/api/v1/auth`，10 分鐘）。
- 所有寫入 API（POST／DELETE）：`Origin` 必須等於 `SITE_URL`，且 header `X-CSRF-Token` 必須等於 cookie `mlf_csrf`（常數時間比較）。
- Session payload：`{ typ: 'session', uid, sv, exp }`；`sv ≠ users.session_version`、`banned=1`、過期、簽章不符 → 視為未登入。角色變更與停權一律遞增 `session_version`。
- 頻率：每主體每小時 30 次；登入者主體 `user:<id>`，否則 `ip:<SHA-256(IP_HASH_SALT+IP)>`；封鎖檢查同時看 `ip:` 與 `user:`。
- `ADMIN_BOOTSTRAP`：逗號分隔 `provider:username`（大小寫不敏感），只在**建立新使用者**時套用。
- 測試用登入路由 `POST /api/v1/auth/test-login` 只在 `TEST_LOGIN_ENABLED=true` **且** `SITE_URL` 主機為 `localhost`／`127.0.0.1`／`[::1]` 時存在，否則 404。
- `SESSION_SECRET` 至少 32 字元；缺少或過短時 API 回 500 `misconfigured`，名稱只寫入 log。
- Worker 測試的 D1 一律用 wrangler `getPlatformProxy`（勿用 `@cloudflare/vitest-pool-workers`：與 vitest 5 衝突）。
- 不可變資料；檔案 < 400 行；函式 < 50 行。
- 前端新元件只用 `feat/site-redesign` 的語意 class（`text-muted`、`text-danger`、`text-warn`、`text-link`、`bg-surface`、`bg-surface-2`、`border-line`、`border-line-strong`），不直接寫 `slate-*`／`emerald-*`。
- 任何 secret 不得寫入檔案、log 或對話輸出。
- Commit 訊息結尾空一行後加：`Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX`

## Review Focus

1. **過期、竄改或舊版本的 session cookie**（例如被改角色、被停權後仍帶舊 cookie）：一律視為未登入，`GET /api/v1/me` 回 `user: null`，admin API 回 401 → Task 5 測試。
2. **OAuth 回呼異常**：state 不符、state cookie 遺失或過期、使用者在 Discord／GitHub 按取消（只有 `error=access_denied` 沒有 `code`）、provider 回非 JSON → 轉址並帶 `auth_error`，不發 session、不建使用者 → Task 7 測試。
3. **開放轉址**：`returnTo` 為 `//evil.test`、`https://evil.test`、`/\evil.test`、含控制字元或超長 → 一律改為 `/` → Task 6 測試。
4. **綁定已屬於他人的身分**：回 `identity_taken`，不得把身分轉移到目前帳號；已綁定同來源另一帳號回 `provider_linked` → Task 4、Task 7 測試。
5. **管理員對自己降級或停權**（會把唯一管理員鎖在門外）：回 400 `self_change` → Task 9 測試。

---

## File Structure

```
packages/core/src/review/
  permissions.ts            ROLES、Role、Action、can()、LOGIN_PROVIDERS、ADMIN_BOOTSTRAP 解析
  subjects.ts               ipSubject／userSubject／isSubject
  statuses.ts               SUGGESTION_STATUSES
  permissions.test.ts
  index.ts                  （修改）匯出
apps/worker/src/
  appEnv.ts                 AppEnv（Bindings＋Variables）、Ctx、SessionUser、FetchLike
  app.ts                    （修改）repos／session middleware、註冊路由
  env.ts                    （修改）Env 擴充、ENV_GROUPS、envGuard
  http.ts                   （修改）methodNotAllowed、parseJson
  siteUrl.ts                isLocalSite、turnstileHostname
  turnstile.ts              （修改）hostname 比對
  index.ts                  （修改）正式依賴
  auth/crypto.ts            base64url、HMAC、隨機 token、常數時間比較
  auth/signedToken.ts       簽章 token（session、OAuth state 共用）
  auth/session.ts           session cookie 發行／清除／讀取
  auth/csrf.ts              ensureCsrf、requireWrite（Origin＋CSRF）
  auth/oauthState.ts        OAuth state cookie、safeReturnTo、callbackUrl
  auth/providers.ts         Discord／GitHub 轉接
  auth/resolveUser.ts       登入／綁定／bootstrap／停權判斷
  auth/guard.ts             requirePermission
  repo/types.ts             （重寫）Repos 聚合與各介面
  repo/d1Suggestions.ts、repo/d1Blocks.ts、repo/d1Users.ts、repo/index.ts
  routes/auth.ts、routes/testLogin.ts、routes/me.ts、routes/suggestions.ts（修改）
  routes/adminUsers.ts、routes/adminBlocks.ts
  testDb.ts、testAuth.ts、testDeps.ts（修改）、testEnv.ts（修改）
  刪除：repo/memoryRepo.ts、repo/memoryRepo.test.ts、repo/d1Repo.ts、repo/d1Repo.test.ts、repo/repo.contract.ts
apps/site/src/islands/
  api.ts                    ApiResult、apiGet、apiSend（自動帶 CSRF）、loadMe
  AccountMenu.tsx           登入／綁定／我的建議／管理後台／登出
  MySuggestions.tsx         我的建議對話框
  suggestApi.ts、TurnstileWidget.tsx（修改）
apps/site/src/components/Header.astro、pages/mods/[modId].astro、i18n/zh-TW.ts（修改）
wrangler.jsonc、.dev.vars.example、e2e/auth.spec.ts、README.md
```

---

### Task 0: 前置確認

**Files:** 無。

- [ ] **Step 1: 確認 `feat/site-redesign` 已合併**

Task 10 修改的 `Header.astro`、`[modId].astro`、`SuggestForm.tsx`、`i18n/zh-TW.ts` 正被 `feat/site-redesign` 大幅改寫，且新 UI 依賴其語意 class。

Run: `git fetch origin && git log origin/main --oneline | grep -i redesign`
Expected: 有 redesign 的合併 commit。若沒有：Task 1–9（純 Worker／core）可先做，Task 10–11 等它合併後 `git rebase origin/main` 再做。

- [ ] **Step 2: 基線**

Run: `npm ci && npm test && npm run test:coverage -w @mlf/worker && npm run build && npx playwright test`
Expected: 全部通過。記下各 workspace 測試數。

---

### Task 1: core — 權限表、登入來源、主體與建議狀態

**Files:**
- Create: `packages/core/src/review/permissions.ts`、`packages/core/src/review/subjects.ts`、`packages/core/src/review/statuses.ts`
- Modify: `packages/core/src/review/index.ts`
- Test: `packages/core/src/review/permissions.test.ts`

**Interfaces:**
- Produces:
  - `ROLES = ['admin', 'reviewer', 'contributor'] as const`；`type Role`
  - `type Action = 'suggest' | 'review' | 'publish' | 'manage'`；`can(role: Role | null, action: Action): boolean`
  - `LOGIN_PROVIDERS = ['github', 'discord'] as const`；`type LoginProvider`
  - `parseAdminBootstrap(value: string | undefined): ReadonlySet<string>`；`isBootstrapAdmin(list: ReadonlySet<string>, provider: string, username: string | null): boolean`
  - `ipSubject(hash: string): string`、`userSubject(id: number): string`、`isSubject(value: string): boolean`
  - `SUGGESTION_STATUSES`（與 D1 CHECK 相同順序）；`type SuggestionStatus`

- [ ] **Step 1: 寫失敗測試**

```ts
// packages/core/src/review/permissions.test.ts
import { describe, expect, it } from 'vitest';
import { can, ipSubject, isBootstrapAdmin, isSubject, parseAdminBootstrap, SUGGESTION_STATUSES, userSubject } from './index';

describe('can', () => {
  it.each([
    [null, 'suggest', true],
    [null, 'review', false],
    [null, 'publish', false],
    [null, 'manage', false],
    ['contributor', 'suggest', true],
    ['contributor', 'review', false],
    ['reviewer', 'review', true],
    ['reviewer', 'publish', false],
    ['reviewer', 'manage', false],
    ['admin', 'review', true],
    ['admin', 'publish', true],
    ['admin', 'manage', true],
  ] as const)('%s may %s: %s', (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });
});

describe('admin bootstrap', () => {
  const list = parseAdminBootstrap(' github:MrPippi , discord:Admin2,bogus, ');

  it('matches provider:username case-insensitively', () => {
    expect(isBootstrapAdmin(list, 'github', 'mrpippi')).toBe(true);
    expect(isBootstrapAdmin(list, 'discord', 'ADMIN2')).toBe(true);
  });

  it('does not cross providers or accept missing usernames', () => {
    expect(isBootstrapAdmin(list, 'discord', 'MrPippi')).toBe(false);
    expect(isBootstrapAdmin(list, 'github', null)).toBe(false);
    expect(isBootstrapAdmin(parseAdminBootstrap(undefined), 'github', 'MrPippi')).toBe(false);
    expect(list.has('bogus')).toBe(false);
  });
});

describe('subjects', () => {
  const hash = 'a'.repeat(64);

  it('formats and validates subjects', () => {
    expect(ipSubject(hash)).toBe(`ip:${hash}`);
    expect(userSubject(12)).toBe('user:12');
    expect(isSubject(`ip:${hash}`)).toBe(true);
    expect(isSubject('user:12')).toBe(true);
  });

  it.each(['user:0', 'user:-1', 'user:abc', 'ip:xyz', `ip:${'A'.repeat(64)}`, 'email:a@b', ''])('rejects %s', (value) => {
    expect(isSubject(value)).toBe(false);
  });

  it('lists suggestion statuses in schema order', () => {
    expect(SUGGESTION_STATUSES).toEqual(['pending', 'approved', 'rejected', 'superseded', 'conflict', 'published']);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/review`
Expected: FAIL（`can` 等未匯出）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/review/permissions.ts
/** 規格 §6 權限表 */
export const ROLES = ['admin', 'reviewer', 'contributor'] as const;
export type Role = (typeof ROLES)[number];

/** 可登入的來源；'minecraft' 保留給 3.1 */
export const LOGIN_PROVIDERS = ['github', 'discord'] as const;
export type LoginProvider = (typeof LOGIN_PROVIDERS)[number];

export type Action = 'suggest' | 'review' | 'publish' | 'manage';

const MATRIX: Readonly<Record<Action, readonly Role[]>> = {
  suggest: ['admin', 'reviewer', 'contributor'],
  review: ['admin', 'reviewer'],
  publish: ['admin'],
  manage: ['admin'],
};

/** 未登入（null）只能送出建議 */
export function can(role: Role | null, action: Action): boolean {
  if (role === null) return action === 'suggest';
  return MATRIX[action].includes(role);
}

const BOOTSTRAP_ENTRY = /^[a-z]+:.+$/;

/** ADMIN_BOOTSTRAP：逗號分隔的 provider:username，大小寫不敏感 */
export function parseAdminBootstrap(value: string | undefined): ReadonlySet<string> {
  const entries = (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => BOOTSTRAP_ENTRY.test(s));
  return new Set(entries);
}

export function isBootstrapAdmin(list: ReadonlySet<string>, provider: string, username: string | null): boolean {
  return username !== null && list.has(`${provider}:${username}`.toLowerCase());
}
```

```ts
// packages/core/src/review/subjects.ts
/** 頻率限制與封鎖的主體：ip:<64 位小寫 hex> 或 user:<正整數> */
const SUBJECT_PATTERN = /^(ip:[0-9a-f]{64}|user:[1-9]\d{0,15})$/;

export function ipSubject(hash: string): string {
  return `ip:${hash}`;
}

export function userSubject(id: number): string {
  return `user:${id}`;
}

export function isSubject(value: string): boolean {
  return SUBJECT_PATTERN.test(value);
}
```

```ts
// packages/core/src/review/statuses.ts
/** 與 migrations/0001_initial.sql 的 suggestions.status CHECK 一致 */
export const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'superseded', 'conflict', 'published'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
```

`index.ts` 追加：

```ts
export { can, isBootstrapAdmin, LOGIN_PROVIDERS, parseAdminBootstrap, ROLES, type Action, type LoginProvider, type Role } from './permissions';
export { ipSubject, isSubject, userSubject } from './subjects';
export { SUGGESTION_STATUSES, type SuggestionStatus } from './statuses';
```

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review && npm run test:coverage`
Expected: PASS；coverage 門檻通過。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): add role permissions, login providers and subjects"
```

---

### Task 2: Worker — 測試用 D1 與 Repos（建議、封鎖）

**Files:**
- Create: `apps/worker/src/testDb.ts`
- Create: `apps/worker/src/repo/d1Suggestions.ts`、`apps/worker/src/repo/d1Blocks.ts`、`apps/worker/src/repo/index.ts`
- Modify: `apps/worker/src/repo/types.ts`（整檔重寫）、`apps/worker/vitest.config.ts`
- Test: `apps/worker/src/repo/d1Repos.test.ts`

本 Task 只新增 repo 層；舊的 `memoryRepo.ts`／`d1Repo.ts` 仍被 `app.ts` 使用，Task 3 才切換並刪除。為了讓兩者暫時並存，`types.ts` 保留舊介面 `SuggestionRepo` 的舊名稱為 `LegacySuggestionRepo` 匯出，Task 3 刪除。

**Interfaces:**
- Consumes: `SuggestionStatus`（Task 1）。
- Produces（`repo/types.ts`）：

```ts
export interface NewSuggestion { modId; key; baseTarget: string | null; proposed; note: string | null; formatWarning: boolean; authorUserId: number | null; authorHash: string; createdAt: string }
export interface StoredSuggestion extends NewSuggestion { readonly id: number; readonly status: 'pending' }
export type AuthorRef = { readonly userId: number } | { readonly hash: string };
export interface MySuggestion { id; modId; key; proposed; status: SuggestionStatus; reviewNote: string | null; createdAt: string; reviewedAt: string | null }
export interface SuggestionRepo {
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  tryConsumeRate(subject: string, at: Date, limit: number, windowMs: number): Promise<boolean>;
  listByAuthor(author: AuthorRef, limit: number): Promise<MySuggestion[]>;
}
export interface BlockRecord { subject: string; reason: string | null; createdAt: string }
export interface BlockRepo {
  isBlocked(subjects: readonly string[]): Promise<boolean>;
  list(limit: number): Promise<BlockRecord[]>;
  add(subject: string, reason: string | null, nowIso: string): Promise<void>;
  remove(subject: string): Promise<boolean>;
}
export interface Repos { readonly suggestions: SuggestionRepo; readonly blocks: BlockRepo }
```

- `createD1Repos(db: D1Database): Repos`
- `testDb(): Promise<D1Database>`、`resetDb(db): Promise<void>`、`disposeTestDb(): Promise<void>`、`seedUser(db, displayName?): Promise<number>`

- [ ] **Step 1: 建立測試用 D1 輔助**

```ts
// apps/worker/src/testDb.ts
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';

const root = fileURLToPath(new URL('../../..', import.meta.url).href);

/** 依外鍵相依順序清空 */
const TABLES = ['suggestions', 'mod_status_changes', 'publish_batches', 'identities', 'users', 'rate_events', 'blocked_subjects'] as const;

let pending: Promise<PlatformProxy<{ DB: D1Database }>> | null = null;

async function createProxy(): Promise<PlatformProxy<{ DB: D1Database }>> {
  // wrangler 會檢查 assets 目錄存在；測試不需要先建置網站
  mkdirSync(join(root, 'apps', 'site', 'dist'), { recursive: true });
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(root, 'wrangler.jsonc'),
    persist: { path: mkdtempSync(join(tmpdir(), 'mlf-d1-')) },
  });
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
    await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  }
  return proxy;
}

/** 每個測試檔共用一個本機 D1（vitest 預設每檔隔離模組） */
export async function testDb(): Promise<D1Database> {
  pending ??= createProxy();
  return (await pending).env.DB;
}

export async function resetDb(db: D1Database): Promise<void> {
  await db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)));
}

export async function disposeTestDb(): Promise<void> {
  const current = pending;
  pending = null;
  if (current) await (await current).dispose();
}

/** 不經 UserRepo 直接建立使用者（供外鍵需要） */
export async function seedUser(db: D1Database, displayName = '測試者'): Promise<number> {
  const row = await db
    .prepare('INSERT INTO users (display_name, created_at) VALUES (?, ?) RETURNING id')
    .bind(displayName, '2026-10-15T00:00:00.000Z')
    .first<{ id: number }>();
  if (!row) throw new Error('seed user failed');
  return row.id;
}
```

`vitest.config.ts` 的 coverage `exclude` 改為：

```ts
exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/testEnv.ts', 'src/testDeps.ts', 'src/testDb.ts', 'src/testAuth.ts'],
```

- [ ] **Step 2: 寫失敗測試**

```ts
// apps/worker/src/repo/d1Repos.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, seedUser, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewSuggestion, Repos } from './types';

const sample = (over: Partial<NewSuggestion> = {}): NewSuggestion => ({
  modId: 'create', key: 'block.create.cogwheel', baseTarget: '齒輪', proposed: '小齒輪', note: null,
  formatWarning: false, authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});

const HOUR = 60 * 60 * 1000;
const AT = new Date('2026-10-15T12:00:00.000Z');

let db: D1Database;
let repos: Repos;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const countRows = async (sql: string) => (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;

describe('SuggestionRepo.upsertPending', () => {
  it('inserts a pending suggestion', async () => {
    expect(await repos.suggestions.upsertPending(sample())).toMatchObject({ id: expect.any(Number), status: 'pending', proposed: '小齒輪' });
  });

  it('overwrites the same anonymous author pending suggestion for the same key', async () => {
    const first = await repos.suggestions.upsertPending(sample());
    const second = await repos.suggestions.upsertPending(sample({ proposed: '大齒輪' }));
    expect(second.id).toBe(first.id);
    expect(await countRows(`SELECT COUNT(*) AS n FROM suggestions WHERE proposed = '大齒輪'`)).toBe(1);
  });

  it('keeps separate rows for different authors or keys', async () => {
    const a = await repos.suggestions.upsertPending(sample());
    const b = await repos.suggestions.upsertPending(sample({ authorHash: 'h2' }));
    const c = await repos.suggestions.upsertPending(sample({ key: 'other' }));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('treats a logged-in author as one author across IP hashes', async () => {
    const uid = await seedUser(db);
    const a = await repos.suggestions.upsertPending(sample({ authorUserId: uid, authorHash: 'h1' }));
    const b = await repos.suggestions.upsertPending(sample({ authorUserId: uid, authorHash: 'h2', proposed: '大齒輪' }));
    expect(b.id).toBe(a.id);
  });

  it('does not merge a logged-in author with an anonymous one on the same IP', async () => {
    const uid = await seedUser(db);
    const anon = await repos.suggestions.upsertPending(sample());
    const user = await repos.suggestions.upsertPending(sample({ authorUserId: uid }));
    expect(user.id).not.toBe(anon.id);
  });

  it('does not overwrite suggestions that are no longer pending', async () => {
    const first = await repos.suggestions.upsertPending(sample());
    await db.prepare(`UPDATE suggestions SET status = 'rejected' WHERE id = ?`).bind(first.id).run();
    const second = await repos.suggestions.upsertPending(sample({ proposed: '大齒輪' }));
    expect(second.id).not.toBe(first.id);
  });

  it('keeps exactly one pending row under concurrent upserts', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => repos.suggestions.upsertPending(sample({ proposed: `齒輪${n}` }))));
    expect(await countRows(`SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'`)).toBe(1);
  });
});

describe('SuggestionRepo.tryConsumeRate', () => {
  it('allows up to the limit within the window, per subject', async () => {
    for (let i = 0; i < 3; i += 1) expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)).toBe(true);
    expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)).toBe(false);
    expect(await repos.suggestions.tryConsumeRate('ip:h2', AT, 3, HOUR)).toBe(true);
  });

  it('ignores events outside the window', async () => {
    expect(await repos.suggestions.tryConsumeRate('ip:h1', new Date(AT.getTime() - 2 * HOUR), 1, HOUR)).toBe(true);
    expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 1, HOUR)).toBe(true);
  });

  it('never exceeds the limit under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it('purges events older than 24h', async () => {
    await repos.suggestions.tryConsumeRate('ip:old', new Date(AT.getTime() - 25 * HOUR), 30, HOUR);
    await repos.suggestions.tryConsumeRate('ip:h1', AT, 30, HOUR);
    expect(await countRows('SELECT COUNT(*) AS n FROM rate_events')).toBe(1);
  });
});

describe('SuggestionRepo.listByAuthor', () => {
  it('lists a user suggestions newest first', async () => {
    const uid = await seedUser(db);
    await repos.suggestions.upsertPending(sample({ authorUserId: uid }));
    await repos.suggestions.upsertPending(sample({ authorUserId: uid, key: 'k2' }));
    await repos.suggestions.upsertPending(sample({ key: 'anon' }));
    const mine = await repos.suggestions.listByAuthor({ userId: uid }, 10);
    expect(mine.map((s) => s.key)).toEqual(['k2', 'block.create.cogwheel']);
    expect(mine[0]).toMatchObject({ status: 'pending', reviewNote: null, reviewedAt: null });
  });

  it('lists anonymous suggestions by hash only, excluding logged-in rows from the same IP', async () => {
    const uid = await seedUser(db);
    await repos.suggestions.upsertPending(sample({ authorUserId: uid, key: 'mine-logged-in' }));
    await repos.suggestions.upsertPending(sample({ key: 'anon' }));
    expect((await repos.suggestions.listByAuthor({ hash: 'h1' }, 10)).map((s) => s.key)).toEqual(['anon']);
  });
});

describe('BlockRepo', () => {
  it('adds, updates the reason, lists, checks and removes subjects', async () => {
    await repos.blocks.add('ip:bad', '洗版', '2026-10-15T00:00:00.000Z');
    await repos.blocks.add('ip:bad', '重複洗版', '2026-10-15T01:00:00.000Z');
    expect(await repos.blocks.isBlocked(['user:1', 'ip:bad'])).toBe(true);
    expect(await repos.blocks.isBlocked([])).toBe(false);
    expect(await repos.blocks.list(10)).toEqual([{ subject: 'ip:bad', reason: '重複洗版', createdAt: '2026-10-15T00:00:00.000Z' }]);
    expect(await repos.blocks.remove('ip:bad')).toBe(true);
    expect(await repos.blocks.remove('ip:bad')).toBe(false);
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo/d1Repos.test.ts`
Expected: FAIL（`./index` 不存在）。

- [ ] **Step 4: 實作 types**

```ts
// apps/worker/src/repo/types.ts
import type { SuggestionStatus } from '@mlf/core/review';

export interface NewSuggestion {
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly authorUserId: number | null;
  readonly authorHash: string;
  readonly createdAt: string;
}

export interface StoredSuggestion extends NewSuggestion {
  readonly id: number;
  readonly status: 'pending';
}

export type AuthorRef = { readonly userId: number } | { readonly hash: string };

export interface MySuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: SuggestionStatus;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

/** rate_events 保留 24 小時，寫入新事件時順便清除更舊的列 */
export const RATE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SuggestionRepo {
  /** 同主體（authorUserId ?? authorHash）對同 mod/key 已有 pending 時覆蓋該列，否則新增；單一交易 */
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  /** 原子操作：視窗內未達上限才記錄一次並回傳 true */
  tryConsumeRate(subject: string, at: Date, limit: number, windowMs: number): Promise<boolean>;
  listByAuthor(author: AuthorRef, limit: number): Promise<MySuggestion[]>;
}

export interface BlockRecord {
  readonly subject: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface BlockRepo {
  isBlocked(subjects: readonly string[]): Promise<boolean>;
  list(limit: number): Promise<BlockRecord[]>;
  /** 已存在時只更新理由 */
  add(subject: string, reason: string | null, nowIso: string): Promise<void>;
  remove(subject: string): Promise<boolean>;
}

export interface Repos {
  readonly suggestions: SuggestionRepo;
  readonly blocks: BlockRepo;
}

/** 3A 介面：Task 3 切換後刪除 */
export interface LegacySuggestionRepo {
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  countRateEvents(subject: string, sinceIso: string): Promise<number>;
  recordRateEvent(subject: string, atIso: string): Promise<void>;
  isBlocked(subjects: readonly string[]): Promise<boolean>;
}

export function sameAuthor(a: NewSuggestion, b: NewSuggestion): boolean {
  return a.authorUserId !== null || b.authorUserId !== null
    ? a.authorUserId === b.authorUserId
    : a.authorHash === b.authorHash;
}
```

把 `memoryRepo.ts`、`d1Repo.ts`、`repo.contract.ts`、`app.ts`、`testDeps.ts` 中的 `SuggestionRepo` 型別參照改為 `LegacySuggestionRepo`（只改型別名稱，Task 3 會整批刪除這些用法）。

- [ ] **Step 5: 實作 D1 repos**

```ts
// apps/worker/src/repo/d1Suggestions.ts
import { RATE_RETENTION_MS, type AuthorRef, type MySuggestion, type NewSuggestion, type StoredSuggestion, type SuggestionRepo } from './types';

/** ?1 mod_id、?2 key、?3 author_user_id、?4 author_hash */
const PENDING_SAME_AUTHOR = `status = 'pending' AND mod_id = ?1 AND key = ?2
  AND ((?3 IS NOT NULL AND author_user_id = ?3) OR (?3 IS NULL AND author_user_id IS NULL AND author_hash = ?4))`;

const MY_COLUMNS = 'id, mod_id, key, proposed, status, review_note, created_at, reviewed_at';

interface MyRow {
  readonly id: number;
  readonly mod_id: string;
  readonly key: string;
  readonly proposed: string;
  readonly status: MySuggestion['status'];
  readonly review_note: string | null;
  readonly created_at: string;
  readonly reviewed_at: string | null;
}

const toMine = (r: MyRow): MySuggestion => ({
  id: r.id, modId: r.mod_id, key: r.key, proposed: r.proposed, status: r.status,
  reviewNote: r.review_note, createdAt: r.created_at, reviewedAt: r.reviewed_at,
});

async function upsertPending(db: D1Database, s: NewSuggestion): Promise<StoredSuggestion> {
  const args = [s.modId, s.key, s.authorUserId, s.authorHash, s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.createdAt];
  // D1 batch 為單一交易：UPDATE 命中則 INSERT 因 NOT EXISTS 略過，反之亦然
  const results = await db.batch<{ id: number }>([
    db.prepare(`UPDATE suggestions SET base_target = ?5, proposed = ?6, note = ?7, format_warning = ?8, created_at = ?9
                WHERE ${PENDING_SAME_AUTHOR}`).bind(...args),
    db.prepare(`INSERT INTO suggestions (mod_id, key, author_user_id, author_hash, base_target, proposed, note, format_warning, created_at, status)
                SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending'
                WHERE NOT EXISTS (SELECT 1 FROM suggestions WHERE ${PENDING_SAME_AUTHOR})`).bind(...args),
    db.prepare(`SELECT id FROM suggestions WHERE ${PENDING_SAME_AUTHOR} ORDER BY id LIMIT 1`).bind(...args.slice(0, 4)),
  ]);
  const id = results[2]?.results[0]?.id;
  if (id === undefined) throw new Error('upsert suggestion returned no id');
  return { ...s, id, status: 'pending' };
}

export function createD1Suggestions(db: D1Database): SuggestionRepo {
  return {
    upsertPending: (s) => upsertPending(db, s),
    async tryConsumeRate(subject, at, limit, windowMs) {
      const since = new Date(at.getTime() - windowMs).toISOString();
      const cutoff = new Date(at.getTime() - RATE_RETENTION_MS).toISOString();
      const [, inserted] = await db.batch([
        db.prepare('DELETE FROM rate_events WHERE created_at < ?').bind(cutoff),
        db.prepare(`INSERT INTO rate_events (subject, created_at) SELECT ?1, ?2
                    WHERE (SELECT COUNT(*) FROM rate_events WHERE subject = ?1 AND created_at >= ?3) < ?4`)
          .bind(subject, at.toISOString(), since, limit),
      ]);
      return (inserted?.meta.changes ?? 0) === 1;
    },
    async listByAuthor(author: AuthorRef, limit) {
      const stmt = 'userId' in author
        ? db.prepare(`SELECT ${MY_COLUMNS} FROM suggestions WHERE author_user_id = ? ORDER BY id DESC LIMIT ?`).bind(author.userId, limit)
        : db.prepare(`SELECT ${MY_COLUMNS} FROM suggestions WHERE author_user_id IS NULL AND author_hash = ? ORDER BY id DESC LIMIT ?`).bind(author.hash, limit);
      const { results } = await stmt.all<MyRow>();
      return results.map(toMine);
    },
  };
}
```

```ts
// apps/worker/src/repo/d1Blocks.ts
import type { BlockRepo } from './types';

interface BlockRow {
  readonly subject: string;
  readonly reason: string | null;
  readonly created_at: string;
}

export function createD1Blocks(db: D1Database): BlockRepo {
  return {
    async isBlocked(subjects) {
      if (subjects.length === 0) return false;
      const placeholders = subjects.map(() => '?').join(', ');
      const row = await db
        .prepare(`SELECT 1 AS hit FROM blocked_subjects WHERE subject IN (${placeholders}) LIMIT 1`)
        .bind(...subjects)
        .first<{ hit: number }>();
      return row !== null;
    },
    async list(limit) {
      const { results } = await db
        .prepare('SELECT subject, reason, created_at FROM blocked_subjects ORDER BY created_at DESC, subject LIMIT ?')
        .bind(limit)
        .all<BlockRow>();
      return results.map((r) => ({ subject: r.subject, reason: r.reason, createdAt: r.created_at }));
    },
    async add(subject, reason, nowIso) {
      await db
        .prepare(`INSERT INTO blocked_subjects (subject, reason, created_at) VALUES (?, ?, ?)
                  ON CONFLICT(subject) DO UPDATE SET reason = excluded.reason`)
        .bind(subject, reason, nowIso)
        .run();
    },
    async remove(subject) {
      const result = await db.prepare('DELETE FROM blocked_subjects WHERE subject = ?').bind(subject).run();
      return result.meta.changes > 0;
    },
  };
}
```

```ts
// apps/worker/src/repo/index.ts
import { createD1Blocks } from './d1Blocks';
import { createD1Suggestions } from './d1Suggestions';
import type { Repos } from './types';

export function createD1Repos(db: D1Database): Repos {
  return { suggestions: createD1Suggestions(db), blocks: createD1Blocks(db) };
}
```

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit`
Expected: 新檔 14 個測試 PASS；舊測試仍全過；typecheck 0 errors。

- [ ] **Step 7: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): add atomic D1 repos for suggestions and blocks"
```

---

### Task 3: Worker — AppEnv、每請求一次 repos、設定分組、405 與 no-store

**Files:**
- Create: `apps/worker/src/appEnv.ts`
- Modify: `apps/worker/src/app.ts`、`apps/worker/src/env.ts`、`apps/worker/src/http.ts`、`apps/worker/src/index.ts`、`apps/worker/src/routes/suggestions.ts`、`apps/worker/src/testDeps.ts`、`apps/worker/src/testEnv.ts`、`apps/worker/src/repo/types.ts`、`.dev.vars.example`
- Delete: `apps/worker/src/repo/memoryRepo.ts`、`memoryRepo.test.ts`、`d1Repo.ts`、`d1Repo.test.ts`、`repo.contract.ts`
- Test: `apps/worker/src/app.test.ts`、`apps/worker/src/routes/suggestions.test.ts`（整檔重寫）

**Interfaces:**
- Consumes: `createD1Repos`、`Repos`、`testDb`（Task 2）。
- Produces:
  - `type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`
  - `interface SessionUser { id: number; displayName: string; role: Role }`
  - `interface AppEnv { Bindings: Env; Variables: { repos: Repos; user: SessionUser | null } }`；`type Ctx = Context<AppEnv>`
  - `interface AppDeps { repos(db: D1Database): Repos; verifyTurnstile(secret, token, ip): Promise<boolean>; loadMod(env, modId): Promise<ModStrings | null>; now(): Date; fetch: FetchLike }`
  - `Env` 新增 `SESSION_SECRET`、`DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`GITHUB_APP_CLIENT_ID`、`GITHUB_APP_CLIENT_SECRET`、`GITHUB_API_BASE`、選填 `ADMIN_BOOTSTRAP`、`TEST_LOGIN_ENABLED`
  - `ENV_GROUPS = { core, discord, github }`；`missingEnv(env, group = 'core'): string[]`；`envGuard(group): MiddlewareHandler<AppEnv>`
  - `methodNotAllowed(allow: readonly string[])`、`parseJson<T>(c, schema): Promise<T | Response>`
  - `TEST_SESSION_SECRET`（testEnv.ts）；`testDeps(over?)`、`readJson<T>(res)`、`TEST_NOW`（testDeps.ts）

- [ ] **Step 1: 改寫測試**

```ts
// apps/worker/src/app.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { readJson, testDeps } from './testDeps';
import { testEnv } from './testEnv';

const env = () => testEnv({ DB: {} as D1Database });

afterEach(() => vi.restoreAllMocks());

describe('app', () => {
  it('returns a JSON 404 envelope with no-store for unknown API paths', async () => {
    const res = await createApp(testDeps()).request('/api/v1/suggestions/nope', {}, env());
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found', message: '找不到這個 API。' } });
  });

  it('falls through to static assets for non-API paths', async () => {
    const res = await createApp(testDeps()).request('/mods/create/', {}, env());
    expect(await res.text()).toBe('asset:/mods/create/');
  });

  it('answers 405 with Allow for the wrong method on a POST route', async () => {
    const res = await createApp(testDeps()).request('/api/v1/suggestions', {}, env());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect((await readJson(res)).error.code).toBe('method_not_allowed');
  });

  it.each([
    ['TURNSTILE_SECRET', { TURNSTILE_SECRET: '' }],
    ['SESSION_SECRET', { SESSION_SECRET: '' }],
    ['SESSION_SECRET', { SESSION_SECRET: 'short' }],
  ])('returns 500 misconfigured without leaking %s', async (name, override) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await createApp(testDeps()).request('/api/v1/x', {}, testEnv({ DB: {} as D1Database, ...override }));
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('misconfigured');
    expect(JSON.stringify(body)).not.toContain(name);
  });

  it('builds repos once per request', async () => {
    const repos = vi.fn(testDeps().repos);
    await createApp(testDeps({ repos })).request('/api/v1/nope', {}, env());
    expect(repos).toHaveBeenCalledTimes(1);
  });

  it('returns 500 internal with a generic message when a dependency throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp(testDeps({ repos: () => { throw new Error('kaboom'); } }));
    const res = await app.request('/api/v1/nope', {}, env());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'internal', message: '伺服器發生錯誤，請稍後再試。' } });
  });
});
```

```ts
// apps/worker/src/routes/suggestions.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../app';
import { hashIp } from '../ipHash';
import { createD1Repos } from '../repo';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

function setup(over: Partial<AppDeps> = {}) {
  const deps = testDeps({ verifyTurnstile: vi.fn(async () => true), ...over });
  const app = createApp(deps);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://mlf.test', 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, testEnv({ DB: db }));
  return { post, deps };
}

const countRows = async (table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;
const valid = { modId: 'create', key: 'a', proposed: '蘋果（%s）', turnstileToken: 'tok' };

describe('POST /api/v1/suggestions', () => {
  it('stores a valid suggestion', async () => {
    const res = await setup().post(valid);
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ ok: true, data: { id: expect.any(Number), formatWarning: false } });
  });

  it('flags format warnings', async () => {
    expect((await readJson(await setup().post({ ...valid, proposed: '蘋果' }))).data.formatWarning).toBe(true);
  });

  it('accepts suggestions for untranslated keys', async () => {
    expect((await setup().post({ ...valid, key: 'b', proposed: '香蕉' })).status).toBe(201);
  });

  it.each([
    [403, 'bad_origin', valid, { Origin: 'https://evil.test' }],
    [400, 'invalid_body', 'not json', {}],
    [400, 'invalid_body', { ...valid, modId: 'Bad Id' }, {}],
    [400, 'invalid_body', { ...valid, turnstileToken: '' }, {}],
    [404, 'mod_not_found', { ...valid, modId: 'nope' }, {}],
    [404, 'key_not_found', { ...valid, key: 'constructor' }, {}],
    [400, 'unchanged', { ...valid, proposed: '蘋果 %s' }, {}],
    [400, 'empty', { ...valid, proposed: ' ' }, {}],
  ] as const)('returns %i %s', async (status, code, body, headers) => {
    const res = await setup().post(body, headers);
    expect(res.status).toBe(status);
    expect((await readJson(res)).error.code).toBe(code);
  });

  it('rejects an oversized body with 413 before touching the database', async () => {
    const res = await setup().post({ ...valid, note: 'x'.repeat(20 * 1024) });
    expect(res.status).toBe(413);
    expect((await readJson(res)).error.code).toBe('too_large');
    expect(await countRows('suggestions')).toBe(0);
    expect(await countRows('rate_events')).toBe(0);
  });

  it('rejects when Turnstile fails', async () => {
    const res = await setup({ verifyTurnstile: vi.fn(async () => false) }).post(valid);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('turnstile_failed');
  });

  it('rejects blocked subjects', async () => {
    await createD1Repos(db).blocks.add(`ip:${await hashIp('test-salt', '1.2.3.4')}`, null, '2026-10-15T00:00:00.000Z');
    const res = await setup().post(valid);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('blocked');
  });

  it('rate limits after 30 per hour per subject', async () => {
    const { post } = setup();
    for (let i = 0; i < 30; i += 1) expect((await post({ ...valid, proposed: `蘋果${i} %s` })).status).toBe(201);
    const res = await post({ ...valid, proposed: '最後 %s' });
    expect(res.status).toBe(429);
    expect((await readJson(res)).error.code).toBe('rate_limited');
  });

  it('counts failed attempts toward the rate limit', async () => {
    const { post } = setup();
    for (let i = 0; i < 30; i += 1) expect((await post({ ...valid, proposed: '蘋果 %s' })).status).toBe(400);
    expect((await post(valid)).status).toBe(429);
  });

  it('does not call Turnstile once rate limited', async () => {
    const verify = vi.fn(async () => true);
    const { post } = setup({ verifyTurnstile: verify });
    for (let i = 0; i < 30; i += 1) await post({ ...valid, proposed: `蘋果${i} %s` });
    verify.mockClear();
    await post(valid);
    expect(verify).not.toHaveBeenCalled();
  });

  it('works without CF-Connecting-IP', async () => {
    expect((await setup().post(valid, { 'CF-Connecting-IP': '' })).status).toBe(201);
  });

  it('overwrites the same author pending suggestion', async () => {
    const { post } = setup();
    const first = await readJson(await post(valid));
    const second = await readJson(await post({ ...valid, proposed: '青蘋果 %s' }));
    expect(second.data.id).toBe(first.data.id);
  });

  it('returns a generic 500 when a dependency throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup({ loadMod: async () => { throw new Error('secret detail'); } }).post(valid);
    spy.mockRestore();
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('secret detail');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/app.test.ts src/routes`
Expected: FAIL（405、no-store、`SESSION_SECRET`、`testDb` 相關斷言失敗）。

- [ ] **Step 3: 實作 appEnv、env、http**

```ts
// apps/worker/src/appEnv.ts
import type { Context } from 'hono';
import type { Role } from '@mlf/core/review';
import type { Env } from './env';
import type { Repos } from './repo/types';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SessionUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: Role;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { repos: Repos; user: SessionUser | null };
}

export type Ctx = Context<AppEnv>;
```

```ts
// apps/worker/src/env.ts
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './appEnv';
import { fail } from './http';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly SITE_URL: string;
  readonly TURNSTILE_SECRET: string;
  readonly IP_HASH_SALT: string;
  readonly SESSION_SECRET: string;
  readonly DISCORD_CLIENT_ID: string;
  readonly DISCORD_CLIENT_SECRET: string;
  readonly GITHUB_APP_CLIENT_ID: string;
  readonly GITHUB_APP_CLIENT_SECRET: string;
  readonly GITHUB_API_BASE: string;
  readonly ADMIN_BOOTSTRAP?: string;
  readonly TEST_LOGIN_ENABLED?: string;
}

/** 依功能分組的必要設定；缺少時只有該功能回 500，名稱只寫入 log */
export const ENV_GROUPS = {
  core: ['DB', 'ASSETS', 'SITE_URL', 'TURNSTILE_SECRET', 'IP_HASH_SALT', 'SESSION_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  github: ['GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_API_BASE'],
} as const satisfies Readonly<Record<string, readonly (keyof Env)[]>>;

export type EnvGroup = keyof typeof ENV_GROUPS;

const MIN_SESSION_SECRET = 32;

export function missingEnv(env: Partial<Env>, group: EnvGroup = 'core'): string[] {
  const missing: string[] = ENV_GROUPS[group].filter((name) => !env[name]);
  const weak = group === 'core' && env.SESSION_SECRET && env.SESSION_SECRET.length < MIN_SESSION_SECRET ? ['SESSION_SECRET(too short)'] : [];
  return [...missing, ...weak];
}

export function envGuard(group: EnvGroup): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const missing = missingEnv(c.env, group);
    if (missing.length > 0) {
      console.error('missing env', group, missing);
      return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
    }
    await next();
  };
}
```

```ts
// apps/worker/src/http.ts
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json({ ok: true, data }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ ok: false, error: { code, message } }, status);
}

/** 註冊在正確方法之後，攔下其他方法 */
export function methodNotAllowed(allow: readonly string[]) {
  return (c: Context): Response => {
    c.header('Allow', allow.join(', '));
    return fail(c, 405, 'method_not_allowed', '不支援這個請求方式。');
  };
}

/** 解析並驗證 JSON 本文；失敗回 400 Response */
export async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
}
```

- [ ] **Step 4: 實作 app、index、suggestions 路由**

```ts
// apps/worker/src/app.ts
import { Hono } from 'hono';
import type { AppEnv, FetchLike } from './appEnv';
import { envGuard, type Env } from './env';
import { fail } from './http';
import type { ModStrings } from './modSource';
import type { Repos } from './repo/types';
import { registerSuggestionRoutes } from './routes/suggestions';

export interface AppDeps {
  readonly repos: (db: D1Database) => Repos;
  readonly verifyTurnstile: (secret: string, token: string, ip: string) => Promise<boolean>;
  readonly loadMod: (env: Env, modId: string) => Promise<ModStrings | null>;
  readonly now: () => Date;
  /** 對外 HTTP（OAuth、GitHub）；測試注入假實作 */
  readonly fetch: FetchLike;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('/api/*', envGuard('core'));
  app.use('/api/*', async (c, next) => {
    c.set('repos', deps.repos(c.env.DB));
    c.set('user', null);
    await next();
    c.header('Cache-Control', 'no-store');
  });

  registerSuggestionRoutes(app, deps);

  app.all('/api/*', (c) => fail(c, 404, 'not_found', '找不到這個 API。'));
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
  app.onError((err, c) => {
    console.error('unhandled', err);
    return fail(c, 500, 'internal', '伺服器發生錯誤，請稍後再試。');
  });
  return app;
}
```

```ts
// apps/worker/src/index.ts
import { createApp } from './app';
import { loadModFromAssets } from './modSource';
import { createD1Repos } from './repo';
import { verifyTurnstile } from './turnstile';

export default createApp({
  repos: createD1Repos,
  verifyTurnstile: (secret, token, ip) => verifyTurnstile(secret, token, ip),
  loadMod: loadModFromAssets,
  now: () => new Date(),
  fetch: (input, init) => fetch(input, init),
});
```

```ts
// apps/worker/src/routes/suggestions.ts
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { ipSubject, lookupEntry, SUGGESTION_LIMITS, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { fail, methodNotAllowed, ok } from '../http';
import { clientIp, hashIp } from '../ipHash';

const bodySchema = z.object({
  modId: z.string().regex(MOD_ID_PATTERN).max(64),
  key: z.string().min(1).max(256),
  proposed: z.string().max(SUGGESTION_LIMITS.maxChars * 2),
  note: z.string().max(SUGGESTION_LIMITS.maxNote * 2).optional(),
  turnstileToken: z.string().min(1).max(4096),
});

type Body = z.infer<typeof bodySchema>;

const REJECTION_MESSAGES = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

const HOUR_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

const limitBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => fail(c, 413, 'too_large', '送出的資料太大。'),
});

/** 來源、本文、封鎖、頻率（任何通過格式檢查的嘗試都計數）、人機驗證 */
async function precheck(c: Ctx, deps: AppDeps): Promise<Response | { body: Body; ipHash: string }> {
  if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出建議。');
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
  const ip = clientIp(c.req.raw);
  const ipHash = await hashIp(c.env.IP_HASH_SALT, ip);
  const subject = ipSubject(ipHash);
  const repos = c.get('repos');
  if (await repos.blocks.isBlocked([subject])) return fail(c, 403, 'blocked', '此來源已被停止投稿。');
  if (!(await repos.suggestions.tryConsumeRate(subject, deps.now(), SUGGESTION_LIMITS.perHour, HOUR_MS))) {
    return fail(c, 429, 'rate_limited', '送出太頻繁了，請稍後再試。');
  }
  if (!(await deps.verifyTurnstile(c.env.TURNSTILE_SECRET, parsed.data.turnstileToken, ip))) {
    return fail(c, 403, 'turnstile_failed', '人機驗證未通過，請重新整理後再試。');
  }
  return { body: parsed.data, ipHash };
}

async function handleSubmit(c: Ctx, deps: AppDeps): Promise<Response> {
  const pre = await precheck(c, deps);
  if (pre instanceof Response) return pre;
  const { body, ipHash } = pre;

  const mod = await deps.loadMod(c.env, body.modId);
  if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const entry = lookupEntry(mod.en, mod.zh, body.key);
  if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
  const verdict = validateSuggestion({ ...entry, proposed: body.proposed, note: body.note });
  if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);

  const stored = await c.get('repos').suggestions.upsertPending({
    modId: body.modId, key: body.key, baseTarget: entry.current, proposed: body.proposed,
    note: body.note?.trim() || null, formatWarning: verdict.formatWarning,
    authorUserId: null, authorHash: ipHash, createdAt: deps.now().toISOString(),
  });
  return ok(c, { id: stored.id, formatWarning: verdict.formatWarning }, 201);
}

export function registerSuggestionRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post('/api/v1/suggestions', limitBody, (c) => handleSubmit(c, deps));
  app.all('/api/v1/suggestions', methodNotAllowed(['POST']));
}
```

- [ ] **Step 5: 更新測試輔助、刪除舊 repo**

```ts
// apps/worker/src/testEnv.ts
import type { Env } from './env';

export const TEST_SESSION_SECRET = 'test-session-secret-0123456789abcdef';

/** 測試用 Env；ASSETS 回傳 `asset:<path>`，可用 overrides 覆寫 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  const assets = { fetch: async (input: RequestInfo | URL) => new Response(`asset:${new URL(String(input instanceof Request ? input.url : input)).pathname}`) };
  return {
    DB: undefined as unknown as D1Database,
    ASSETS: assets as unknown as Fetcher,
    SITE_URL: 'https://mlf.test',
    TURNSTILE_SECRET: 'test-secret',
    IP_HASH_SALT: 'test-salt',
    SESSION_SECRET: TEST_SESSION_SECRET,
    DISCORD_CLIENT_ID: 'discord-id',
    DISCORD_CLIENT_SECRET: 'discord-secret',
    GITHUB_APP_CLIENT_ID: 'github-id',
    GITHUB_APP_CLIENT_SECRET: 'github-secret',
    GITHUB_API_BASE: 'https://api.github.test',
    ...overrides,
  };
}
```

```ts
// apps/worker/src/testDeps.ts
import type { AppDeps } from './app';
import { createD1Repos } from './repo';

export const TEST_MOD = { en: { a: 'Apple %s', b: 'Banana' }, zh: { a: '蘋果 %s' } } as const;
export const TEST_NOW = new Date('2026-10-15T12:00:00.000Z');

/** 測試用依賴：D1 repos（搭配 testDb）、Turnstile 通過、固定時間、禁止對外連線 */
export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    repos: createD1Repos,
    verifyTurnstile: async () => true,
    loadMod: async (_env, id) => (id === 'create' ? TEST_MOD : null),
    now: () => TEST_NOW,
    fetch: async (input) => { throw new Error(`unexpected outbound fetch: ${String(input)}`); },
    ...over,
  };
}

export interface TestEnvelope<T = Record<string, unknown>> {
  readonly ok: boolean;
  readonly data: T;
  readonly error: { readonly code: string; readonly message: string };
}

export const readJson = async <T = Record<string, unknown>>(res: Response): Promise<TestEnvelope<T>> => (await res.json()) as TestEnvelope<T>;
```

刪除 `repo/memoryRepo.ts`、`repo/memoryRepo.test.ts`、`repo/d1Repo.ts`、`repo/d1Repo.test.ts`、`repo/repo.contract.ts`；從 `repo/types.ts` 刪除 `LegacySuggestionRepo` 與 `sameAuthor`。

`.dev.vars.example` 追加（本機用、非機密的假值）：

```
SESSION_SECRET=local-dev-session-secret-0123456789abcdef
DISCORD_CLIENT_ID=local-dev
DISCORD_CLIENT_SECRET=local-dev
GITHUB_APP_CLIENT_ID=local-dev
GITHUB_APP_CLIENT_SECRET=local-dev
```

本機已有 `.dev.vars` 的開發者需手動補上這幾行（README 於 Task 11 說明）。

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: 全部 PASS；typecheck 0 errors；coverage ≥ 80%。

- [ ] **Step 7: Commit**

```bash
git add -A apps/worker .dev.vars.example
git commit -m "refactor(worker): build repos once per request, group env checks and answer 405"
```

---

### Task 4: UserRepo（D1）

**Files:**
- Create: `apps/worker/src/repo/d1Users.ts`
- Modify: `apps/worker/src/repo/types.ts`、`apps/worker/src/repo/index.ts`
- Test: `apps/worker/src/repo/users.test.ts`

**Interfaces:**
- Consumes: `Role`、`LoginProvider`（Task 1）。
- Produces（追加到 `repo/types.ts`；`Repos` 加 `readonly users: UserRepo`）：

```ts
export interface UserRecord { id: number; displayName: string; role: Role; isPublic: boolean; banned: boolean; sessionVersion: number; createdAt: string }
export interface NewIdentity { provider: LoginProvider; providerUserId: string; username: string | null }
export interface IdentityRecord extends NewIdentity { linkedAt: string }
export interface AdminUserView { id: number; displayName: string; role: Role; banned: boolean; isPublic: boolean; createdAt: string; identities: readonly { provider: string; username: string | null }[] }
export type LinkOutcome = 'linked' | 'already' | 'taken' | 'provider_linked';
export interface UserRepo {
  findById(id: number): Promise<UserRecord | null>;
  findByIdentity(provider: LoginProvider, providerUserId: string): Promise<UserRecord | null>;
  create(input: { displayName: string; role: Role; identity: NewIdentity; now: string }): Promise<UserRecord>;
  linkIdentity(userId: number, identity: NewIdentity, now: string): Promise<LinkOutcome>;
  listIdentities(userId: number): Promise<IdentityRecord[]>;
  search(query: string, limit: number): Promise<AdminUserView[]>;
  setRole(id: number, role: Role): Promise<UserRecord | null>;   // 同時遞增 session_version
  setBanned(id: number, banned: boolean): Promise<UserRecord | null>; // 同時遞增 session_version
}
```

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/repo/users.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewIdentity, Repos } from './types';

const NOW = '2026-10-15T00:00:00.000Z';
const gh = (id: string, username: string | null = `gh${id}`): NewIdentity => ({ provider: 'github', providerUserId: id, username });
const dc = (id: string): NewIdentity => ({ provider: 'discord', providerUserId: id, username: `dc${id}` });

let repos: Repos;
beforeEach(async () => {
  const db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

describe('UserRepo', () => {
  it('creates a user with its first identity', async () => {
    const user = await repos.users.create({ displayName: '史蒂夫', role: 'contributor', identity: gh('1'), now: NOW });
    expect(user).toMatchObject({ displayName: '史蒂夫', role: 'contributor', isPublic: true, banned: false, sessionVersion: 0 });
    expect(await repos.users.findById(user.id)).toEqual(user);
    expect(await repos.users.findByIdentity('github', '1')).toEqual(user);
    expect(await repos.users.findByIdentity('discord', '1')).toBeNull();
    expect(await repos.users.listIdentities(user.id)).toEqual([{ ...gh('1'), linkedAt: NOW }]);
  });

  it('returns the same user when two first logins race', async () => {
    const [a, b] = await Promise.all([
      repos.users.create({ displayName: 'A', role: 'contributor', identity: gh('9'), now: NOW }),
      repos.users.create({ displayName: 'A', role: 'contributor', identity: gh('9'), now: NOW }),
    ]);
    expect(a.id).toBe(b.id);
  });

  it('links a second provider and reports conflicts', async () => {
    const alice = await repos.users.create({ displayName: 'Alice', role: 'contributor', identity: gh('1'), now: NOW });
    const bob = await repos.users.create({ displayName: 'Bob', role: 'contributor', identity: gh('2'), now: NOW });
    expect(await repos.users.linkIdentity(alice.id, dc('10'), NOW)).toBe('linked');
    expect(await repos.users.linkIdentity(alice.id, dc('10'), NOW)).toBe('already');
    expect(await repos.users.linkIdentity(bob.id, dc('10'), NOW)).toBe('taken');
    expect(await repos.users.linkIdentity(alice.id, dc('11'), NOW)).toBe('provider_linked');
    expect((await repos.users.findByIdentity('discord', '10'))?.id).toBe(alice.id);
  });

  it('bumps session_version when changing role or ban state', async () => {
    const user = await repos.users.create({ displayName: 'C', role: 'contributor', identity: gh('3'), now: NOW });
    const promoted = await repos.users.setRole(user.id, 'reviewer');
    expect(promoted).toMatchObject({ role: 'reviewer', sessionVersion: 1 });
    const banned = await repos.users.setBanned(user.id, true);
    expect(banned).toMatchObject({ banned: true, sessionVersion: 2 });
    expect(await repos.users.setRole(9999, 'admin')).toBeNull();
    expect(await repos.users.setBanned(9999, true)).toBeNull();
  });

  it('searches by display name or identity username, with identities attached', async () => {
    await repos.users.create({ displayName: '史蒂夫', role: 'contributor', identity: gh('1', 'steve'), now: NOW });
    await repos.users.create({ displayName: 'Alex', role: 'admin', identity: dc('2'), now: NOW });
    expect((await repos.users.search('', 10)).map((u) => u.displayName)).toEqual(['史蒂夫', 'Alex']);
    expect((await repos.users.search('STEVE', 10))[0]).toMatchObject({ displayName: '史蒂夫', identities: [{ provider: 'github', username: 'steve' }] });
    expect((await repos.users.search('ale', 10)).map((u) => u.displayName)).toEqual(['Alex']);
    expect(await repos.users.search('%', 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo/users.test.ts`
Expected: FAIL（`repos.users` undefined）。

- [ ] **Step 3: 實作**

在 `repo/types.ts` 追加上方 Interfaces 區的型別（import `LoginProvider`、`Role` from `@mlf/core/review`），並把 `Repos` 改為：

```ts
export interface Repos {
  readonly suggestions: SuggestionRepo;
  readonly blocks: BlockRepo;
  readonly users: UserRepo;
}
```

```ts
// apps/worker/src/repo/d1Users.ts
import type { LoginProvider, Role } from '@mlf/core/review';
import type { AdminUserView, IdentityRecord, LinkOutcome, NewIdentity, UserRecord, UserRepo } from './types';

const FIELDS = ['id', 'display_name', 'role', 'public', 'banned', 'session_version', 'created_at'] as const;
const COLUMNS = FIELDS.join(', ');
const U_COLUMNS = FIELDS.map((f) => `u.${f}`).join(', ');

interface UserRow {
  readonly id: number;
  readonly display_name: string;
  readonly role: Role;
  readonly public: number;
  readonly banned: number;
  readonly session_version: number;
  readonly created_at: string;
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id, displayName: r.display_name, role: r.role, isPublic: r.public === 1,
  banned: r.banned === 1, sessionVersion: r.session_version, createdAt: r.created_at,
});

/** LIKE 以 ! 跳脫 % 與 _ */
const likePattern = (q: string): string => `%${q.replace(/[!%_]/g, (m) => `!${m}`)}%`;

function finders(db: D1Database) {
  return {
    async findById(id: number): Promise<UserRecord | null> {
      const row = await db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
      return row ? toUser(row) : null;
    },
    async findByIdentity(provider: LoginProvider, providerUserId: string): Promise<UserRecord | null> {
      const row = await db
        .prepare(`SELECT ${U_COLUMNS} FROM users u JOIN identities i ON i.user_id = u.id WHERE i.provider = ? AND i.provider_user_id = ?`)
        .bind(provider, providerUserId)
        .first<UserRow>();
      return row ? toUser(row) : null;
    },
  };
}

async function linkIdentity(db: D1Database, userId: number, identity: NewIdentity, now: string): Promise<LinkOutcome> {
  const owner = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND provider_user_id = ?')
    .bind(identity.provider, identity.providerUserId)
    .first<{ user_id: number }>();
  if (owner) return owner.user_id === userId ? 'already' : 'taken';
  const sameProvider = await db.prepare('SELECT 1 AS hit FROM identities WHERE user_id = ? AND provider = ?').bind(userId, identity.provider).first();
  if (sameProvider) return 'provider_linked';
  const result = await db
    .prepare('INSERT INTO identities (provider, provider_user_id, user_id, username, linked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
    .bind(identity.provider, identity.providerUserId, userId, identity.username, now)
    .run();
  return result.meta.changes === 1 ? 'linked' : 'taken';
}

async function search(db: D1Database, query: string, limit: number): Promise<AdminUserView[]> {
  const { results } = await db
    .prepare(`SELECT ${U_COLUMNS},
                (SELECT json_group_array(json_object('provider', i.provider, 'username', i.username)) FROM identities i WHERE i.user_id = u.id) AS identities
              FROM users u
              WHERE ?1 = '' OR u.display_name LIKE ?2 ESCAPE '!'
                 OR EXISTS (SELECT 1 FROM identities i2 WHERE i2.user_id = u.id AND i2.username LIKE ?2 ESCAPE '!')
              ORDER BY u.id LIMIT ?3`)
    .bind(query, likePattern(query), limit)
    .all<UserRow & { identities: string }>();
  return results.map((r) => {
    const { sessionVersion: _sv, ...user } = toUser(r);
    return { ...user, identities: JSON.parse(r.identities) as AdminUserView['identities'] };
  });
}

export function createD1Users(db: D1Database): UserRepo {
  const { findById, findByIdentity } = finders(db);
  const update = async (sql: string, ...args: unknown[]): Promise<UserRecord | null> => {
    const row = await db.prepare(`${sql} RETURNING ${COLUMNS}`).bind(...args).first<UserRow>();
    return row ? toUser(row) : null;
  };
  return {
    findById,
    findByIdentity,
    async create({ displayName, role, identity, now }) {
      try {
        await db.batch([
          db.prepare('INSERT INTO users (display_name, role, created_at) VALUES (?, ?, ?)').bind(displayName, role, now),
          db.prepare('INSERT INTO identities (provider, provider_user_id, user_id, username, linked_at) VALUES (?, ?, last_insert_rowid(), ?, ?)')
            .bind(identity.provider, identity.providerUserId, identity.username, now),
        ]);
      } catch (err) {
        // 同一身分同時首次登入：交易整批回滾，改取已建立者
        const existing = await findByIdentity(identity.provider, identity.providerUserId);
        if (existing) return existing;
        throw err;
      }
      const created = await findByIdentity(identity.provider, identity.providerUserId);
      if (!created) throw new Error('created user not found');
      return created;
    },
    linkIdentity: (userId, identity, now) => linkIdentity(db, userId, identity, now),
    async listIdentities(userId): Promise<IdentityRecord[]> {
      const { results } = await db
        .prepare('SELECT provider, provider_user_id, username, linked_at FROM identities WHERE user_id = ? ORDER BY linked_at, provider')
        .bind(userId)
        .all<{ provider: LoginProvider; provider_user_id: string; username: string | null; linked_at: string }>();
      return results.map((r) => ({ provider: r.provider, providerUserId: r.provider_user_id, username: r.username, linkedAt: r.linked_at }));
    },
    search: (query, limit) => search(db, query, limit),
    setRole: (id, role) => update('UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?', role, id),
    setBanned: (id, banned) => update('UPDATE users SET banned = ?, session_version = session_version + 1 WHERE id = ?', banned ? 1 : 0, id),
  };
}
```

`repo/index.ts`：

```ts
import { createD1Blocks } from './d1Blocks';
import { createD1Suggestions } from './d1Suggestions';
import { createD1Users } from './d1Users';
import type { Repos } from './types';

export function createD1Repos(db: D1Database): Repos {
  return { suggestions: createD1Suggestions(db), blocks: createD1Blocks(db), users: createD1Users(db) };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/repo && npx tsc --noEmit`
Expected: PASS（users 5 個）；typecheck 0 errors。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/repo
git commit -m "feat(worker): add D1 user repository with identity linking"
```

---

### Task 5: 簽章 token、session、CSRF 與 `GET /api/v1/me`

**Files:**
- Create: `apps/worker/src/auth/crypto.ts`、`auth/signedToken.ts`、`auth/session.ts`、`auth/csrf.ts`、`routes/me.ts`、`testAuth.ts`
- Modify: `apps/worker/src/app.ts`
- Test: `apps/worker/src/auth/tokens.test.ts`、`apps/worker/src/routes/me.test.ts`

**Interfaces:**
- Consumes: `Repos.users`（Task 4）、`AppEnv`／`Ctx`（Task 3）、`TEST_SESSION_SECRET`、`TEST_NOW`。
- Produces:
  - `toBase64Url(bytes)`、`fromBase64Url(text): Uint8Array | null`、`hmacSign(secret, data)`、`hmacVerify(secret, data, sig)`、`randomToken(bytes = 32): string`（43 字元）、`safeEqual(a, b)`
  - `signToken(payload: { exp: number; [k: string]: unknown }, secret): Promise<string>`；`verifyToken(token, secret, nowSec): Promise<Record<string, unknown> | null>`
  - `SESSION_COOKIE = 'mlf_session'`、`SESSION_TTL_SEC`、`COOKIE_DEFAULTS`、`epochSeconds(d)`、`sessionToken(user, secret, now)`、`issueSession(c, user, now)`、`clearSession(c)`、`loadSessionUser(c, now): Promise<SessionUser | null>`
  - `CSRF_COOKIE = 'mlf_csrf'`、`CSRF_HEADER = 'X-CSRF-Token'`、`ensureCsrf(c): string`、`requireWrite: MiddlewareHandler<AppEnv>`
  - `registerMeRoutes(app)`：`GET /api/v1/me` → `{ user: null | { id, displayName, role, identities: [{ provider, username }] }, csrfToken }`
  - testAuth：`TEST_ORIGIN`、`TEST_CSRF`、`createUser(db, role?, name?): Promise<UserRecord>`、`sessionCookie(user): Promise<string>`、`writeHeaders(user?): Promise<Record<string, string>>`、`setCookieValue(res, name): string | null`

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/auth/tokens.test.ts
import { describe, expect, it } from 'vitest';
import { fromBase64Url, randomToken, safeEqual, toBase64Url } from './crypto';
import { signToken, verifyToken } from './signedToken';

const SECRET = 'x'.repeat(32);

describe('crypto helpers', () => {
  it('round-trips base64url and rejects invalid input', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(fromBase64Url('a+b/')).toBeNull();
  });

  it('creates 43-char url-safe random tokens', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(randomToken());
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('signed tokens', () => {
  it('verifies a fresh token and returns its payload', async () => {
    const token = await signToken({ typ: 't', n: 1, exp: 200 }, SECRET);
    expect(await verifyToken(token, SECRET, 100)).toEqual({ typ: 't', n: 1, exp: 200 });
  });

  it.each([
    ['expired', async () => [await signToken({ exp: 100 }, SECRET), 100] as const],
    ['wrong secret', async () => [await signToken({ exp: 200 }, 'y'.repeat(32)), 100] as const],
    ['tampered body', async () => {
      const [, sig] = (await signToken({ exp: 200, uid: 1 }, SECRET)).split('.');
      return [`${toBase64Url(new TextEncoder().encode('{"exp":200,"uid":2}'))}.${sig}`, 100] as const;
    }],
    ['extra segment', async () => [`${await signToken({ exp: 200 }, SECRET)}.x`, 100] as const],
    ['garbage', async () => ['not-a-token', 100] as const],
  ])('rejects %s', async (_name, make) => {
    const [token, now] = await make();
    expect(await verifyToken(token, SECRET, now)).toBeNull();
  });

  it('rejects a missing token', async () => {
    expect(await verifyToken(undefined, SECRET, 0)).toBeNull();
  });
});
```

```ts
// apps/worker/src/routes/me.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { sessionToken, SESSION_COOKIE } from '../auth/session';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, setCookieValue, TEST_CSRF } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv, TEST_SESSION_SECRET } from '../testEnv';

interface MeData {
  readonly user: { id: number; displayName: string; role: string; identities: { provider: string; username: string | null }[] } | null;
  readonly csrfToken: string;
}

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const getMe = (cookie = '') => createApp(testDeps()).request('/api/v1/me', { headers: cookie ? { Cookie: cookie } : {} }, testEnv({ DB: db }));

describe('GET /api/v1/me', () => {
  it('returns no user and issues an HttpOnly CSRF cookie for anonymous visitors', async () => {
    const res = await getMe();
    const body = await readJson<MeData>(res);
    expect(body.data.user).toBeNull();
    expect(body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookieValue(res, 'mlf_csrf')).toBe(body.data.csrfToken);
    const header = res.headers.getSetCookie().find((h) => h.startsWith('mlf_csrf='));
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps an existing CSRF cookie', async () => {
    const res = await getMe(`mlf_csrf=${TEST_CSRF}`);
    expect((await readJson<MeData>(res)).data.csrfToken).toBe(TEST_CSRF);
    expect(setCookieValue(res, 'mlf_csrf')).toBeNull();
  });

  it('returns the logged-in user with identities', async () => {
    const user = await createUser(db, 'reviewer', '審核者');
    const body = await readJson<MeData>(await getMe(await sessionCookie(user)));
    expect(body.data.user).toMatchObject({ id: user.id, displayName: '審核者', role: 'reviewer', identities: [{ provider: 'github' }] });
  });

  it('treats a stale session version as logged out', async () => {
    const user = await createUser(db);
    const cookie = await sessionCookie(user);
    await createD1Repos(db).users.setRole(user.id, 'reviewer');
    expect((await readJson<MeData>(await getMe(cookie))).data.user).toBeNull();
  });

  it('treats a banned user as logged out', async () => {
    const user = await createUser(db);
    const banned = await createD1Repos(db).users.setBanned(user.id, true);
    if (!banned) throw new Error('setup');
    expect((await readJson<MeData>(await getMe(await sessionCookie(banned)))).data.user).toBeNull();
  });

  it('treats an expired or forged session as logged out', async () => {
    const user = await createUser(db);
    const old = await sessionToken(user, TEST_SESSION_SECRET, new Date(TEST_NOW.getTime() - 31 * 24 * 3600 * 1000));
    expect((await readJson<MeData>(await getMe(`${SESSION_COOKIE}=${old}`))).data.user).toBeNull();
    const forged = await sessionToken(user, 'z'.repeat(40), TEST_NOW);
    expect((await readJson<MeData>(await getMe(`${SESSION_COOKIE}=${forged}`))).data.user).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/auth src/routes/me.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 crypto 與 signedToken**

```ts
// apps/worker/src/auth/crypto.ts
const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

/** crypto.subtle.verify 為常數時間比較 */
export async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  const bytes = fromBase64Url(signature);
  if (!bytes) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, encoder.encode(data));
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

```ts
// apps/worker/src/auth/signedToken.ts
import { fromBase64Url, hmacSign, hmacVerify, toBase64Url } from './crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `<base64url(JSON)>.<base64url(HMAC)>`；payload.exp 為 epoch 秒 */
export async function signToken(payload: { readonly exp: number; readonly [k: string]: unknown }, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

export async function verifyToken(token: string | undefined, secret: string, nowSec: number): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const parts = token.split('.');
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) return null;
  if (!(await hmacVerify(secret, body, signature))) return null;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  try {
    const payload: unknown = JSON.parse(decoder.decode(bytes));
    if (typeof payload !== 'object' || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' && exp > nowSec ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 實作 session、CSRF、me 路由**

```ts
// apps/worker/src/auth/session.ts
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Ctx, SessionUser } from '../appEnv';
import { signToken, verifyToken } from './signedToken';

export const SESSION_COOKIE = 'mlf_session';
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
export const COOKIE_DEFAULTS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

const payloadSchema = z.object({
  typ: z.literal('session'),
  uid: z.number().int().positive(),
  sv: z.number().int().min(0),
  exp: z.number(),
});

export const epochSeconds = (d: Date): number => Math.floor(d.getTime() / 1000);

export async function sessionToken(user: { readonly id: number; readonly sessionVersion: number }, secret: string, now: Date): Promise<string> {
  return signToken({ typ: 'session', uid: user.id, sv: user.sessionVersion, exp: epochSeconds(now) + SESSION_TTL_SEC }, secret);
}

export async function issueSession(c: Ctx, user: { readonly id: number; readonly sessionVersion: number }, now: Date): Promise<void> {
  setCookie(c, SESSION_COOKIE, await sessionToken(user, c.env.SESSION_SECRET, now), { ...COOKIE_DEFAULTS, maxAge: SESSION_TTL_SEC });
}

export function clearSession(c: Ctx): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}

/** 簽章、到期、session_version、停權任一不符都視為未登入 */
export async function loadSessionUser(c: Ctx, now: Date): Promise<SessionUser | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const parsed = payloadSchema.safeParse(await verifyToken(raw, c.env.SESSION_SECRET, epochSeconds(now)));
  if (!parsed.success) return null;
  const user = await c.get('repos').users.findById(parsed.data.uid);
  if (!user || user.banned || user.sessionVersion !== parsed.data.sv) return null;
  return { id: user.id, displayName: user.displayName, role: user.role };
}
```

```ts
// apps/worker/src/auth/csrf.ts
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Ctx } from '../appEnv';
import { fail } from '../http';
import { randomToken, safeEqual } from './crypto';
import { COOKIE_DEFAULTS, SESSION_TTL_SEC } from './session';

export const CSRF_COOKIE = 'mlf_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 取得或建立 CSRF token（HttpOnly cookie；前端由 GET /api/v1/me 取得值） */
export function ensureCsrf(c: Ctx): string {
  const existing = getCookie(c, CSRF_COOKIE);
  if (existing && TOKEN_PATTERN.test(existing)) return existing;
  const token = randomToken();
  setCookie(c, CSRF_COOKIE, token, { ...COOKIE_DEFAULTS, maxAge: SESSION_TTL_SEC });
  return token;
}

/** 所有寫入 API：Origin 必須等於 SITE_URL，header 與 cookie 的 CSRF token 必須一致 */
export const requireWrite: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出請求。');
  const cookie = getCookie(c, CSRF_COOKIE) ?? '';
  const header = c.req.header(CSRF_HEADER) ?? '';
  if (cookie === '' || !safeEqual(cookie, header)) return fail(c, 403, 'bad_csrf', '頁面已過期，請重新整理後再試。');
  await next();
};
```

```ts
// apps/worker/src/routes/me.ts
import type { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ensureCsrf } from '../auth/csrf';
import { ok } from '../http';

export function registerMeRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/me', async (c) => {
    const csrfToken = ensureCsrf(c);
    const user = c.get('user');
    if (!user) return ok(c, { user: null, csrfToken });
    const identities = await c.get('repos').users.listIdentities(user.id);
    return ok(c, { user: { ...user, identities: identities.map((i) => ({ provider: i.provider, username: i.username })) }, csrfToken });
  });
}
```

`app.ts`：在 imports 加 `import { loadSessionUser } from './auth/session';` 與 `import { registerMeRoutes } from './routes/me';`；把 `c.set('user', null);` 換成：

```ts
    c.set('user', await loadSessionUser(c, deps.now()));
```

並在 `registerSuggestionRoutes(app, deps);` 前加 `registerMeRoutes(app);`。

- [ ] **Step 5: 建立測試輔助 testAuth**

```ts
// apps/worker/src/testAuth.ts
import type { Role } from '@mlf/core/review';
import { CSRF_COOKIE, CSRF_HEADER } from './auth/csrf';
import { SESSION_COOKIE, sessionToken } from './auth/session';
import { createD1Repos } from './repo';
import type { UserRecord } from './repo/types';
import { TEST_NOW } from './testDeps';
import { TEST_SESSION_SECRET } from './testEnv';

export const TEST_ORIGIN = 'https://mlf.test';
export const TEST_CSRF = 'c'.repeat(43);

export async function createUser(db: D1Database, role: Role = 'contributor', displayName = '測試者'): Promise<UserRecord> {
  const id = crypto.randomUUID();
  return createD1Repos(db).users.create({
    displayName, role, identity: { provider: 'github', providerUserId: id, username: `u-${id.slice(0, 8)}` }, now: TEST_NOW.toISOString(),
  });
}

export async function sessionCookie(user: { readonly id: number; readonly sessionVersion: number }): Promise<string> {
  return `${SESSION_COOKIE}=${await sessionToken(user, TEST_SESSION_SECRET, TEST_NOW)}`;
}

/** 寫入請求需要的 header：Origin、CSRF cookie 與 header，及可選的 session */
export async function writeHeaders(user?: { readonly id: number; readonly sessionVersion: number }): Promise<Record<string, string>> {
  const cookies = [`${CSRF_COOKIE}=${TEST_CSRF}`, ...(user ? [await sessionCookie(user)] : [])];
  return { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: cookies.join('; '), [CSRF_HEADER]: TEST_CSRF };
}

export function setCookieValue(res: Response, name: string): string | null {
  const header = res.headers.getSetCookie().find((h) => h.startsWith(`${name}=`));
  return header === undefined ? null : (header.slice(name.length + 1).split(';')[0] ?? '');
}
```

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit`
Expected: PASS（tokens 9、me 6，其餘不變）；typecheck 0 errors。

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add signed session cookie, CSRF token and /api/v1/me"
```

---

### Task 6: OAuth 轉接（Discord、GitHub）、state cookie 與 returnTo

**Files:**
- Create: `apps/worker/src/auth/providers.ts`、`apps/worker/src/auth/oauthState.ts`、`apps/worker/src/siteUrl.ts`
- Test: `apps/worker/src/auth/providers.test.ts`

**Interfaces:**
- Consumes: `signToken`／`verifyToken`／`epochSeconds`／`COOKIE_DEFAULTS`／`randomToken`（Task 5）、`LOGIN_PROVIDERS`（Task 1）、`FetchLike`、`Env`。
- Produces:
  - `interface ProviderIdentity { providerUserId: string; username: string; displayName: string }`
  - `interface OAuthProvider { name: LoginProvider; authorizeUrl(env, state, redirectUri): string; fetchIdentity(env, code, redirectUri, fetchImpl: FetchLike): Promise<ProviderIdentity | null> }`
  - `findProvider(name: string): OAuthProvider | null`
  - `OAUTH_COOKIE = 'mlf_oauth'`、`type AuthMode = 'login' | 'link'`、`interface OAuthState { typ: 'oauth'; state; provider; mode; returnTo; exp }`
  - `safeReturnTo(value: string | undefined): string`、`callbackUrl(siteUrl, provider): string`
  - `issueOAuthState(c, { provider, mode, returnTo }, now): Promise<string>`（回傳 state）、`consumeOAuthState(c, now): Promise<OAuthState | null>`（讀取後刪除 cookie）
  - `isLocalSite(siteUrl: string): boolean`、`turnstileHostname(siteUrl: string): string | null`

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/auth/providers.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../appEnv';
import { isLocalSite, turnstileHostname } from '../siteUrl';
import { testEnv } from '../testEnv';
import { callbackUrl, safeReturnTo } from './oauthState';
import { findProvider } from './providers';

const env = testEnv();
const REDIRECT = 'https://mlf.test/api/v1/auth/discord/callback';

function routes(table: Record<string, () => Response>): FetchLike {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = Object.keys(table).find((suffix) => url.endsWith(suffix));
    return hit ? table[hit]!() : new Response('nope', { status: 404 });
  });
}

describe('findProvider', () => {
  it('knows discord and github only', () => {
    expect(findProvider('discord')?.name).toBe('discord');
    expect(findProvider('github')?.name).toBe('github');
    expect(findProvider('minecraft')).toBeNull();
    expect(findProvider('constructor')).toBeNull();
  });
});

describe('discord provider', () => {
  const discord = findProvider('discord')!;

  it('builds the authorize URL with identify scope and state', () => {
    const url = new URL(discord.authorizeUrl(env, 'st', REDIRECT));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'discord-id', response_type: 'code', scope: 'identify', state: 'st', redirect_uri: REDIRECT });
  });

  it('exchanges the code and reads the user', async () => {
    const fetchImpl = routes({
      '/oauth2/token': () => Response.json({ access_token: 'at' }),
      '/users/@me': () => Response.json({ id: '42', username: 'steve', global_name: '史蒂夫' }),
    });
    expect(await discord.fetchIdentity(env, 'code', REDIRECT, fetchImpl)).toEqual({ providerUserId: '42', username: 'steve', displayName: '史蒂夫' });
    const [, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(init?.body)).toContain('client_secret=discord-secret');
  });

  it('falls back to username when global_name is missing', async () => {
    const fetchImpl = routes({
      '/oauth2/token': () => Response.json({ access_token: 'at' }),
      '/users/@me': () => Response.json({ id: '42', username: 'steve', global_name: null }),
    });
    expect((await discord.fetchIdentity(env, 'code', REDIRECT, fetchImpl))?.displayName).toBe('steve');
  });

  it.each([
    ['token error', { '/oauth2/token': () => Response.json({ error: 'invalid_grant' }, { status: 400 }) }],
    ['non-JSON user', { '/oauth2/token': () => Response.json({ access_token: 'at' }), '/users/@me': () => new Response('<html>') }],
    ['invalid user shape', { '/oauth2/token': () => Response.json({ access_token: 'at' }), '/users/@me': () => Response.json({ id: 42 }) }],
  ])('returns null on %s', async (_name, table) => {
    expect(await discord.fetchIdentity(env, 'code', REDIRECT, routes(table))).toBeNull();
  });
});

describe('github provider', () => {
  const github = findProvider('github')!;

  it('builds the authorize URL', () => {
    const url = new URL(github.authorizeUrl(env, 'st', 'https://mlf.test/cb'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'github-id', state: 'st', redirect_uri: 'https://mlf.test/cb' });
  });

  it('exchanges the code and reads the user from GITHUB_API_BASE', async () => {
    const fetchImpl = routes({
      '/login/oauth/access_token': () => Response.json({ access_token: 'ghu' }),
      'api.github.test/user': () => Response.json({ id: 7, login: 'MrPippi', name: null }),
    });
    expect(await github.fetchIdentity(env, 'code', 'https://mlf.test/cb', fetchImpl)).toEqual({ providerUserId: '7', username: 'MrPippi', displayName: 'MrPippi' });
  });

  it('returns null when GitHub answers 200 with an error body', async () => {
    const fetchImpl = routes({ '/login/oauth/access_token': () => Response.json({ error: 'bad_verification_code' }) });
    expect(await github.fetchIdentity(env, 'code', 'https://mlf.test/cb', fetchImpl)).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it.each([
    [undefined, '/'],
    ['/mods/create/', '/mods/create/'],
    ['/mods/?q=a#x', '/mods/?q=a#x'],
    ['//evil.test', '/'],
    ['https://evil.test', '/'],
    ['/\\evil.test', '/'],
    ['/a\nb', '/'],
    ['mods', '/'],
    [`/${'a'.repeat(600)}`, '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('site URL helpers', () => {
  it('builds callback URLs', () => {
    expect(callbackUrl('https://mlf.test', 'github')).toBe('https://mlf.test/api/v1/auth/github/callback');
  });

  it('detects local sites and the Turnstile hostname', () => {
    expect(isLocalSite('http://localhost:8787')).toBe(true);
    expect(isLocalSite('http://127.0.0.1:8787')).toBe(true);
    expect(isLocalSite('https://modlangforge.com')).toBe(false);
    expect(isLocalSite('not a url')).toBe(false);
    expect(turnstileHostname('http://localhost:8787')).toBeNull();
    expect(turnstileHostname('https://modlangforge.jack3555tw.workers.dev')).toBe('modlangforge.jack3555tw.workers.dev');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/auth/providers.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/siteUrl.ts
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalSite(siteUrl: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

/** Turnstile siteverify 回傳的 hostname 應等於本站；本機開發（測試金鑰回 example.com）不比對 */
export function turnstileHostname(siteUrl: string): string | null {
  return isLocalSite(siteUrl) ? null : new URL(siteUrl).hostname;
}
```

```ts
// apps/worker/src/auth/providers.ts
import { z } from 'zod';
import type { LoginProvider } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';
import type { Env } from '../env';

export interface ProviderIdentity {
  readonly providerUserId: string;
  readonly username: string;
  readonly displayName: string;
}

export interface OAuthProvider {
  readonly name: LoginProvider;
  authorizeUrl(env: Env, state: string, redirectUri: string): string;
  fetchIdentity(env: Env, code: string, redirectUri: string, fetchImpl: FetchLike): Promise<ProviderIdentity | null>;
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
const discordUser = z.object({ id: z.string().regex(/^\d+$/), username: z.string().min(1), global_name: z.string().nullish() });
const githubUser = z.object({ id: z.number().int().positive(), login: z.string().min(1), name: z.string().nullish() });

const USER_AGENT = 'modlangforge';

async function readJson(res: Response): Promise<unknown> {
  return res.ok ? res.json().catch(() => null) : null;
}

const discord: OAuthProvider = {
  name: 'discord',
  authorizeUrl(env, state, redirectUri) {
    const params = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify', state, redirect_uri: redirectUri, prompt: 'none' });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  },
  async fetchIdentity(env, code, redirectUri, fetchImpl) {
    const body = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const token = tokenSchema.safeParse(await readJson(await fetchImpl('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body,
    })));
    if (!token.success) return null;
    const me = discordUser.safeParse(await readJson(await fetchImpl('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.data.access_token}`, 'User-Agent': USER_AGENT },
    })));
    if (!me.success) return null;
    return { providerUserId: me.data.id, username: me.data.username, displayName: me.data.global_name || me.data.username };
  },
};

/** GitHub App 的使用者授權（只讀身分，不要求任何 scope） */
const github: OAuthProvider = {
  name: 'github',
  authorizeUrl(env, state, redirectUri) {
    const params = new URLSearchParams({ client_id: env.GITHUB_APP_CLIENT_ID, state, redirect_uri: redirectUri });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },
  async fetchIdentity(env, code, redirectUri, fetchImpl) {
    const token = tokenSchema.safeParse(await readJson(await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code, redirect_uri: redirectUri }),
    })));
    if (!token.success) return null;
    const me = githubUser.safeParse(await readJson(await fetchImpl(`${env.GITHUB_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${token.data.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28' },
    })));
    if (!me.success) return null;
    return { providerUserId: String(me.data.id), username: me.data.login, displayName: me.data.name || me.data.login };
  },
};

const PROVIDERS: Readonly<Record<LoginProvider, OAuthProvider>> = { discord, github };

export function findProvider(name: string): OAuthProvider | null {
  return Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name as LoginProvider] : null;
}
```

```ts
// apps/worker/src/auth/oauthState.ts
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { LOGIN_PROVIDERS, type LoginProvider } from '@mlf/core/review';
import type { Ctx } from '../appEnv';
import { randomToken } from './crypto';
import { COOKIE_DEFAULTS, epochSeconds } from './session';
import { signToken, verifyToken } from './signedToken';

export const OAUTH_COOKIE = 'mlf_oauth';
const OAUTH_PATH = '/api/v1/auth';
const OAUTH_TTL_SEC = 10 * 60;
const MAX_RETURN_TO = 512;

export type AuthMode = 'login' | 'link';

const stateSchema = z.object({
  typ: z.literal('oauth'),
  state: z.string().min(16),
  provider: z.enum(LOGIN_PROVIDERS),
  mode: z.enum(['login', 'link']),
  returnTo: z.string(),
  exp: z.number(),
});

export type OAuthState = z.infer<typeof stateSchema>;

/** 只接受站內相對路徑，防止開放轉址 */
export function safeReturnTo(value: string | undefined): string {
  if (!value || value.length > MAX_RETURN_TO) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if ([...value].some((ch) => ch === '\\' || ch.charCodeAt(0) < 0x20)) return '/';
  return value;
}

export function callbackUrl(siteUrl: string, provider: LoginProvider): string {
  return new URL(`/api/v1/auth/${provider}/callback`, siteUrl).href;
}

export async function issueOAuthState(c: Ctx, input: { provider: LoginProvider; mode: AuthMode; returnTo: string }, now: Date): Promise<string> {
  const state = randomToken();
  const token = await signToken({ typ: 'oauth', state, ...input, exp: epochSeconds(now) + OAUTH_TTL_SEC }, c.env.SESSION_SECRET);
  setCookie(c, OAUTH_COOKIE, token, { ...COOKIE_DEFAULTS, path: OAUTH_PATH, maxAge: OAUTH_TTL_SEC });
  return state;
}

/** 讀取並立即刪除 state cookie（一次性） */
export async function consumeOAuthState(c: Ctx, now: Date): Promise<OAuthState | null> {
  const raw = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_PATH, secure: true });
  const parsed = stateSchema.safeParse(await verifyToken(raw, c.env.SESSION_SECRET, epochSeconds(now)));
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/auth && npx tsc --noEmit`
Expected: PASS；typecheck 0 errors。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add Discord and GitHub OAuth adapters with signed state"
```

---

### Task 7: 認證路由（開始、回呼、綁定、登出、測試用登入）

**Files:**
- Create: `apps/worker/src/auth/resolveUser.ts`、`apps/worker/src/routes/auth.ts`、`apps/worker/src/routes/testLogin.ts`
- Modify: `apps/worker/src/app.ts`
- Test: `apps/worker/src/routes/auth.test.ts`

**Interfaces:**
- Consumes: Task 4–6 全部；`missingEnv`、`methodNotAllowed`、`parseJson`（Task 3）。
- Produces:
  - `type AuthErrorCode = 'login_required' | 'identity_taken' | 'provider_linked' | 'banned'`
  - `resolveUser(c, provider, ident: ProviderIdentity, mode, now): Promise<{ user: UserRecord } | { error: AuthErrorCode }>`
  - 路由：`GET /api/v1/auth/:provider/start?returnTo=&link=1`、`GET /api/v1/auth/:provider/callback`、`POST /api/v1/auth/logout`、`POST /api/v1/auth/test-login`
  - 轉址錯誤碼（`?auth_error=`）：`bad_state`、`cancelled`、`provider_failed`、`login_required`、`identity_taken`、`provider_linked`、`banned`
  - `testLoginAllowed(env: Env): boolean`

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/routes/auth.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { FetchLike } from '../appEnv';
import { OAUTH_COOKIE } from '../auth/oauthState';
import { SESSION_COOKIE } from '../auth/session';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, setCookieValue, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';
import type { Env } from '../env';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

function fakeOAuth(discordUser = { id: '42', username: 'steve', global_name: '史蒂夫' }, githubUser = { id: 7, login: 'MrPippi', name: null as string | null }): FetchLike {
  return async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/oauth2/token') || url.endsWith('/login/oauth/access_token')) return Response.json({ access_token: 'at' });
    if (url.endsWith('/users/@me')) return Response.json(discordUser);
    if (url.endsWith('/user')) return Response.json(githubUser);
    return new Response('nope', { status: 404 });
  };
}

function setup(fetchImpl: FetchLike = fakeOAuth(), envOver: Partial<Env> = {}) {
  const app = createApp(testDeps({ fetch: fetchImpl }));
  const env = testEnv({ DB: db, ADMIN_BOOTSTRAP: 'github:mrpippi', ...envOver });
  const request = (path: string, init: RequestInit = {}) => app.request(path, init, env);
  /** 走完 start → callback，回傳 callback 回應 */
  const login = async (provider: 'discord' | 'github', opts: { link?: boolean; cookie?: string; returnTo?: string } = {}) => {
    const query = new URLSearchParams({ returnTo: opts.returnTo ?? '/mods/', ...(opts.link ? { link: '1' } : {}) });
    const start = await request(`/api/v1/auth/${provider}/start?${query.toString()}`, { headers: opts.cookie ? { Cookie: opts.cookie } : {} });
    const state = new URL(start.headers.get('Location') ?? '').searchParams.get('state') ?? '';
    const cookies = [`${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}`, ...(opts.cookie ? [opts.cookie] : [])];
    return request(`/api/v1/auth/${provider}/callback?code=abc&state=${state}`, { headers: { Cookie: cookies.join('; ') } });
  };
  return { request, login };
}

const location = (res: Response) => res.headers.get('Location');

describe('GET /api/v1/auth/:provider/start', () => {
  it('redirects to the provider with a state stored in a short-lived cookie', async () => {
    const res = await setup().request('/api/v1/auth/discord/start?returnTo=/mods/');
    expect(res.status).toBe(302);
    expect(location(res)).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
    const header = res.headers.getSetCookie().find((h) => h.startsWith(`${OAUTH_COOKIE}=`));
    expect(header).toMatch(/Path=\/api\/v1\/auth/);
    expect(header).toMatch(/Max-Age=600/);
  });

  it('returns 404 for unknown providers and 500 when the provider is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await setup().request('/api/v1/auth/minecraft/start')).status).toBe(404);
    const res = await setup(fakeOAuth(), { DISCORD_CLIENT_SECRET: '' }).request('/api/v1/auth/discord/start');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('DISCORD');
    vi.restoreAllMocks();
  });

  it('requires a session to link', async () => {
    const res = await setup().request('/api/v1/auth/discord/start?link=1&returnTo=/mods/');
    expect(location(res)).toBe('/mods/?auth_error=login_required');
  });
});

describe('GET /api/v1/auth/:provider/callback', () => {
  it('creates a contributor, sets a session cookie and returns to the page', async () => {
    const res = await setup().login('discord');
    expect(res.status).toBe(302);
    expect(location(res)).toBe('/mods/');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeTruthy();
    expect(await createD1Repos(db).users.findByIdentity('discord', '42')).toMatchObject({ displayName: '史蒂夫', role: 'contributor' });
  });

  it('makes the ADMIN_BOOTSTRAP identity an admin on first login', async () => {
    await setup().login('github');
    expect((await createD1Repos(db).users.findByIdentity('github', '7'))?.role).toBe('admin');
  });

  it('logs an existing identity into the same user', async () => {
    await setup().login('discord');
    await setup().login('discord');
    expect((await createD1Repos(db).users.search('', 10)).length).toBe(1);
  });

  it('refuses banned users without a session', async () => {
    await setup().login('discord');
    const user = await createD1Repos(db).users.findByIdentity('discord', '42');
    await createD1Repos(db).users.setBanned(user!.id, true);
    const res = await setup().login('discord');
    expect(location(res)).toBe('/mods/?auth_error=banned');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeNull();
  });

  it('rejects a mismatched or missing state', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start');
    const cookie = `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}`;
    const wrong = await request('/api/v1/auth/discord/callback?code=abc&state=wrong', { headers: { Cookie: cookie } });
    expect(location(wrong)).toBe('/?auth_error=bad_state');
    const missing = await request('/api/v1/auth/discord/callback?code=abc&state=x');
    expect(location(missing)).toBe('/?auth_error=bad_state');
    expect(await createD1Repos(db).users.search('', 10)).toEqual([]);
  });

  it('rejects a state issued for another provider', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start');
    const state = new URL(location(start) ?? '').searchParams.get('state');
    const res = await request(`/api/v1/auth/github/callback?code=abc&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}` } });
    expect(location(res)).toBe('/?auth_error=bad_state');
  });

  it('handles a cancelled authorization (no code)', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start?returnTo=/pack/');
    const state = new URL(location(start) ?? '').searchParams.get('state');
    const res = await request(`/api/v1/auth/discord/callback?error=access_denied&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}` } });
    expect(location(res)).toBe('/pack/?auth_error=cancelled');
  });

  it('reports provider failures without creating users', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup(async () => { throw new Error('network down'); }).login('discord');
    expect(location(res)).toBe('/mods/?auth_error=provider_failed');
    vi.restoreAllMocks();
  });

  it('sanitizes returnTo', async () => {
    const res = await setup().login('discord', { returnTo: '//evil.test' });
    expect(location(res)).toBe('/');
  });

  it('links a second provider to the logged-in user', async () => {
    const user = await createUser(db);
    const res = await setup().login('discord', { link: true, cookie: await sessionCookie(user) });
    expect(location(res)).toBe('/mods/');
    expect((await createD1Repos(db).users.findByIdentity('discord', '42'))?.id).toBe(user.id);
  });

  it('refuses to link an identity owned by someone else', async () => {
    await setup().login('discord');
    const other = await createUser(db);
    const res = await setup().login('discord', { link: true, cookie: await sessionCookie(other) });
    expect(location(res)).toBe('/mods/?auth_error=identity_taken');
    expect((await createD1Repos(db).users.findByIdentity('discord', '42'))?.id).not.toBe(other.id);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie and requires CSRF', async () => {
    const user = await createUser(db);
    const { request } = setup();
    const headers = await writeHeaders(user);
    expect((await request('/api/v1/auth/logout', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'nope' } })).status).toBe(403);
    const res = await request('/api/v1/auth/logout', { method: 'POST', headers });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().find((h) => h.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Max-Age=0/);
    expect((await request('/api/v1/auth/logout')).status).toBe(405);
  });
});

describe('POST /api/v1/auth/test-login', () => {
  const body = JSON.stringify({ provider: 'github', providerUserId: '9001', username: 'MrPippi' });
  const post = (envOver: Partial<Env>) =>
    setup(fakeOAuth(), envOver).request('/api/v1/auth/test-login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: envOver.SITE_URL ?? 'https://mlf.test' }, body });

  it('is hidden unless enabled on a local SITE_URL', async () => {
    expect((await post({})).status).toBe(404);
    expect((await post({ TEST_LOGIN_ENABLED: 'true' })).status).toBe(404);
    expect((await post({ TEST_LOGIN_ENABLED: 'false', SITE_URL: 'http://localhost:8787' })).status).toBe(404);
  });

  it('logs in locally and applies ADMIN_BOOTSTRAP', async () => {
    const res = await post({ TEST_LOGIN_ENABLED: 'true', SITE_URL: 'http://localhost:8787' });
    expect(res.status).toBe(200);
    expect((await readJson<{ role: string }>(res)).data.role).toBe('admin');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/auth.test.ts`
Expected: FAIL（路由不存在，404）。

- [ ] **Step 3: 實作 resolveUser**

```ts
// apps/worker/src/auth/resolveUser.ts
import { isBootstrapAdmin, parseAdminBootstrap, type LoginProvider, type Role } from '@mlf/core/review';
import type { Ctx } from '../appEnv';
import type { UserRecord } from '../repo/types';
import type { AuthMode } from './oauthState';
import type { ProviderIdentity } from './providers';

export type AuthErrorCode = 'login_required' | 'identity_taken' | 'provider_linked' | 'banned';
export type ResolveResult = { readonly user: UserRecord } | { readonly error: AuthErrorCode };

const MAX_DISPLAY_NAME = 64;

async function linkToCurrent(c: Ctx, provider: LoginProvider, ident: ProviderIdentity, nowIso: string): Promise<ResolveResult> {
  const current = c.get('user');
  if (!current) return { error: 'login_required' };
  const users = c.get('repos').users;
  const outcome = await users.linkIdentity(current.id, { provider, providerUserId: ident.providerUserId, username: ident.username }, nowIso);
  if (outcome === 'taken') return { error: 'identity_taken' };
  if (outcome === 'provider_linked') return { error: 'provider_linked' };
  const user = await users.findById(current.id);
  return user ? { user } : { error: 'login_required' };
}

/** 登入：既有身分 → 該使用者（停權則拒絕）；新身分 → 建立使用者（ADMIN_BOOTSTRAP 者為 admin）。綁定：加到目前使用者。 */
export async function resolveUser(c: Ctx, provider: LoginProvider, ident: ProviderIdentity, mode: AuthMode, now: Date): Promise<ResolveResult> {
  const nowIso = now.toISOString();
  if (mode === 'link') return linkToCurrent(c, provider, ident, nowIso);
  const users = c.get('repos').users;
  const existing = await users.findByIdentity(provider, ident.providerUserId);
  if (existing) return existing.banned ? { error: 'banned' } : { user: existing };
  const role: Role = isBootstrapAdmin(parseAdminBootstrap(c.env.ADMIN_BOOTSTRAP), provider, ident.username) ? 'admin' : 'contributor';
  const displayName = ident.displayName.trim().slice(0, MAX_DISPLAY_NAME) || ident.username;
  const user = await users.create({ displayName, role, identity: { provider, providerUserId: ident.providerUserId, username: ident.username }, now: nowIso });
  return { user };
}
```

- [ ] **Step 4: 實作路由**

```ts
// apps/worker/src/routes/auth.ts
import type { Hono } from 'hono';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { safeEqual } from '../auth/crypto';
import { requireWrite } from '../auth/csrf';
import { callbackUrl, consumeOAuthState, issueOAuthState, safeReturnTo, type AuthMode } from '../auth/oauthState';
import { findProvider, type OAuthProvider } from '../auth/providers';
import { resolveUser } from '../auth/resolveUser';
import { clearSession, issueSession } from '../auth/session';
import { missingEnv } from '../env';
import { fail, methodNotAllowed, ok } from '../http';
import { registerTestLogin } from './testLogin';

function redirectWithError(c: Ctx, returnTo: string, code: string): Response {
  const url = new URL(returnTo, c.env.SITE_URL);
  url.searchParams.set('auth_error', code);
  return c.redirect(`${url.pathname}${url.search}`, 302);
}

function providerOrFail(c: Ctx): OAuthProvider | Response {
  const provider = findProvider(c.req.param('provider') ?? '');
  if (!provider) return fail(c, 404, 'not_found', '找不到這個 API。');
  const missing = missingEnv(c.env, provider.name);
  if (missing.length > 0) {
    console.error('missing env', provider.name, missing);
    return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
  }
  return provider;
}

async function handleStart(c: Ctx, deps: AppDeps): Promise<Response> {
  const provider = providerOrFail(c);
  if (provider instanceof Response) return provider;
  const mode: AuthMode = c.req.query('link') === '1' ? 'link' : 'login';
  const returnTo = safeReturnTo(c.req.query('returnTo'));
  if (mode === 'link' && !c.get('user')) return redirectWithError(c, returnTo, 'login_required');
  const state = await issueOAuthState(c, { provider: provider.name, mode, returnTo }, deps.now());
  return c.redirect(provider.authorizeUrl(c.env, state, callbackUrl(c.env.SITE_URL, provider.name)), 302);
}

async function handleCallback(c: Ctx, deps: AppDeps): Promise<Response> {
  const provider = providerOrFail(c);
  if (provider instanceof Response) return provider;
  const now = deps.now();
  const saved = await consumeOAuthState(c, now);
  if (!saved || saved.provider !== provider.name || !safeEqual(saved.state, c.req.query('state') ?? '')) {
    return redirectWithError(c, '/', 'bad_state');
  }
  const code = c.req.query('code');
  if (!code) return redirectWithError(c, saved.returnTo, 'cancelled');
  const ident = await provider
    .fetchIdentity(c.env, code, callbackUrl(c.env.SITE_URL, provider.name), deps.fetch)
    .catch((err: unknown) => {
      console.error('oauth identity failed', provider.name, err);
      return null;
    });
  if (!ident) return redirectWithError(c, saved.returnTo, 'provider_failed');
  const result = await resolveUser(c, provider.name, ident, saved.mode, now);
  if ('error' in result) return redirectWithError(c, saved.returnTo, result.error);
  await issueSession(c, result.user, now);
  return c.redirect(saved.returnTo, 302);
}

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/auth/:provider/start', (c) => handleStart(c, deps));
  app.get('/api/v1/auth/:provider/callback', (c) => handleCallback(c, deps));
  app.post('/api/v1/auth/logout', requireWrite, (c) => {
    clearSession(c);
    return ok(c, { loggedOut: true });
  });
  app.all('/api/v1/auth/logout', methodNotAllowed(['POST']));
  registerTestLogin(app, deps);
}
```

```ts
// apps/worker/src/routes/testLogin.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { LOGIN_PROVIDERS } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { resolveUser } from '../auth/resolveUser';
import { issueSession } from '../auth/session';
import type { Env } from '../env';
import { fail, ok, parseJson } from '../http';
import { isLocalSite } from '../siteUrl';

const bodySchema = z.object({
  provider: z.enum(LOGIN_PROVIDERS),
  providerUserId: z.string().min(1).max(64),
  username: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64).optional(),
});

/** 只在本機且明確開啟時存在；E2E 用來代替真實 OAuth */
export function testLoginAllowed(env: Env): boolean {
  return env.TEST_LOGIN_ENABLED === 'true' && isLocalSite(env.SITE_URL);
}

export function registerTestLogin(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post('/api/v1/auth/test-login', async (c) => {
    if (!testLoginAllowed(c.env)) return fail(c, 404, 'not_found', '找不到這個 API。');
    if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出請求。');
    const body = await parseJson(c, bodySchema);
    if (body instanceof Response) return body;
    const now = deps.now();
    const ident = { providerUserId: body.providerUserId, username: body.username, displayName: body.displayName ?? body.username };
    const result = await resolveUser(c, body.provider, ident, 'login', now);
    if ('error' in result) return fail(c, 403, result.error, '無法登入。');
    await issueSession(c, result.user, now);
    return ok(c, { id: result.user.id, role: result.user.role });
  });
}
```

`app.ts`：import `registerAuthRoutes` from `./routes/auth`，並在 `registerMeRoutes(app);` 前加 `registerAuthRoutes(app, deps);`。

- [ ] **Step 5: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: PASS；coverage ≥ 80%。

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add OAuth login, account linking, logout and local test login"
```

---

### Task 8: 建議 API — CSRF、登入署名、Turnstile hostname、我的建議

**Files:**
- Modify: `apps/worker/src/routes/suggestions.ts`、`apps/worker/src/routes/me.ts`、`apps/worker/src/turnstile.ts`、`apps/worker/src/app.ts`、`apps/worker/src/index.ts`
- Test: `apps/worker/src/routes/suggestions.test.ts`、`apps/worker/src/routes/me.test.ts`、`apps/worker/src/security.test.ts`（追加）

**Interfaces:**
- Consumes: `requireWrite`、`writeHeaders`、`createUser`（Task 5）、`turnstileHostname`（Task 6）、`userSubject`／`ipSubject`（Task 1）、`listByAuthor`（Task 2）。
- Produces:
  - `AppDeps.verifyTurnstile: (secret: string, token: string, ip: string, expectedHostname: string | null) => Promise<boolean>`
  - `verifyTurnstile(secret, token, ip, fetchImpl = fetch, expectedHostname: string | null = null)`
  - `GET /api/v1/me/suggestions` → `{ suggestions: MySuggestion[] }`（最多 50；登入者依 user id，未登入依目前 IP 雜湊的匿名建議）

- [ ] **Step 1: 更新與追加失敗測試**

`suggestions.test.ts`：把 `setup` 換成帶 CSRF 的版本，並在檔尾追加新測試：

```ts
import { createUser, sessionCookie, writeHeaders } from '../testAuth';

function setup(over: Partial<AppDeps> = {}) {
  const deps = testDeps({ verifyTurnstile: vi.fn(async () => true), ...over });
  const app = createApp(deps);
  const post = async (body: unknown, headers: Record<string, string> = {}, user?: { id: number; sessionVersion: number }) =>
    app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { ...(await writeHeaders(user)), 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, testEnv({ DB: db }));
  return { post, deps };
}

describe('POST /api/v1/suggestions with sessions and CSRF', () => {
  it('rejects a missing or wrong CSRF token', async () => {
    const res = await setup().post(valid, { 'X-CSRF-Token': 'wrong' });
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('bad_csrf');
  });

  it('records the logged-in author and rate limits by user', async () => {
    const user = await createUser(db);
    const { post } = setup();
    expect((await post(valid, {}, user)).status).toBe(201);
    const row = await db.prepare('SELECT author_user_id FROM suggestions').first<{ author_user_id: number }>();
    expect(row?.author_user_id).toBe(user.id);
    expect(await db.prepare('SELECT subject FROM rate_events').first<{ subject: string }>()).toEqual({ subject: `user:${user.id}` });
  });

  it('rejects a logged-in user whose user subject is blocked', async () => {
    const user = await createUser(db);
    await createD1Repos(db).blocks.add(`user:${user.id}`, null, '2026-10-15T00:00:00.000Z');
    const res = await setup().post(valid, {}, user);
    expect((await readJson(res)).error.code).toBe('blocked');
  });

  it('passes the expected Turnstile hostname for non-local sites', async () => {
    const verify = vi.fn(async () => true);
    await setup({ verifyTurnstile: verify }).post(valid);
    expect(verify).toHaveBeenCalledWith('test-secret', 'tok', '1.2.3.4', 'mlf.test');
  });
});
```

（`describe('POST /api/v1/suggestions')` 中原本的 bad_origin 案例仍有效：`{ Origin: 'https://evil.test' }` 會覆寫 `writeHeaders` 的 Origin。）

`me.test.ts` 追加：

```ts
describe('GET /api/v1/me/suggestions', () => {
  it('lists the logged-in user suggestions', async () => {
    const user = await createUser(db);
    const repos = createD1Repos(db);
    await repos.suggestions.upsertPending({ modId: 'create', key: 'a', baseTarget: null, proposed: 'x', note: null, formatWarning: false, authorUserId: user.id, authorHash: 'h', createdAt: TEST_NOW.toISOString() });
    const res = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { Cookie: await sessionCookie(user) } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: { key: string }[] }>(res)).data.suggestions.map((s) => s.key)).toEqual(['a']);
  });

  it('lists anonymous suggestions from the current IP', async () => {
    const { hashIp } = await import('../ipHash');
    const repos = createD1Repos(db);
    await repos.suggestions.upsertPending({ modId: 'create', key: 'b', baseTarget: null, proposed: 'x', note: null, formatWarning: false, authorUserId: null, authorHash: await hashIp('test-salt', '5.6.7.8'), createdAt: TEST_NOW.toISOString() });
    const res = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { 'CF-Connecting-IP': '5.6.7.8' } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: { key: string }[] }>(res)).data.suggestions.map((s) => s.key)).toEqual(['b']);
    const other = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { 'CF-Connecting-IP': '9.9.9.9' } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: unknown[] }>(other)).data.suggestions).toEqual([]);
  });
});
```

`security.test.ts` 的 `describe('verifyTurnstile')` 追加：

```ts
  it('checks the hostname when one is expected', async () => {
    const fetchImpl = reply({ success: true, hostname: 'mlf.test' });
    expect(await verifyTurnstile('sec', 'tok', 'ip', fetchImpl, 'mlf.test')).toBe(true);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true, hostname: 'evil.test' }), 'mlf.test')).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true }), 'mlf.test')).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true, hostname: 'example.com' }), null)).toBe(true);
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes src/security.test.ts`
Expected: FAIL（bad_csrf、author、hostname、me/suggestions 相關）。

- [ ] **Step 3: 實作 Turnstile hostname**

```ts
// apps/worker/src/turnstile.ts
import type { FetchLike } from './appEnv';

const VERIFY_TIMEOUT_MS = 5000;

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 伺服器端驗證 Turnstile token；expectedHostname 非 null 時回應的 hostname 必須相符；任何錯誤都視為未通過 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string,
  fetchImpl: FetchLike = fetch,
  expectedHostname: string | null = null,
): Promise<boolean> {
  if (token === '') return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  body.set('remoteip', ip);
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown; hostname?: unknown };
    if (data.success !== true) return false;
    return expectedHostname === null || data.hostname === expectedHostname;
  } catch (err) {
    console.error('turnstile verify failed', err);
    return false;
  }
}
```

`app.ts` 的 `AppDeps.verifyTurnstile` 改為 `(secret: string, token: string, ip: string, expectedHostname: string | null) => Promise<boolean>`；`index.ts` 改為：

```ts
  verifyTurnstile: (secret, token, ip, expectedHostname) => verifyTurnstile(secret, token, ip, fetch, expectedHostname),
```

- [ ] **Step 4: 更新建議路由**

在 `routes/suggestions.ts`：

1. imports 加：`import { userSubject } from '@mlf/core/review';`（併入既有 review import）、`import type { SessionUser } from '../appEnv';`、`import { requireWrite } from '../auth/csrf';`、`import { turnstileHostname } from '../siteUrl';`。
2. 以下列內容取代 `precheck`：

```ts
function subjectsFor(user: SessionUser | null, ipHash: string): { rate: string; check: string[] } {
  const ip = ipSubject(ipHash);
  return user ? { rate: userSubject(user.id), check: [ip, userSubject(user.id)] } : { rate: ip, check: [ip] };
}

/** 本文、封鎖、頻率（任何通過格式檢查的嘗試都計數）、人機驗證；Origin 與 CSRF 由 requireWrite 處理 */
async function precheck(c: Ctx, deps: AppDeps): Promise<Response | { body: Body; ipHash: string }> {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
  const ip = clientIp(c.req.raw);
  const ipHash = await hashIp(c.env.IP_HASH_SALT, ip);
  const subjects = subjectsFor(c.get('user'), ipHash);
  const repos = c.get('repos');
  if (await repos.blocks.isBlocked(subjects.check)) return fail(c, 403, 'blocked', '此來源已被停止投稿。');
  if (!(await repos.suggestions.tryConsumeRate(subjects.rate, deps.now(), SUGGESTION_LIMITS.perHour, HOUR_MS))) {
    return fail(c, 429, 'rate_limited', '送出太頻繁了，請稍後再試。');
  }
  const human = await deps.verifyTurnstile(c.env.TURNSTILE_SECRET, parsed.data.turnstileToken, ip, turnstileHostname(c.env.SITE_URL));
  if (!human) return fail(c, 403, 'turnstile_failed', '人機驗證未通過，請重新整理後再試。');
  return { body: parsed.data, ipHash };
}
```

3. `handleSubmit` 中 `authorUserId: null` 改為 `authorUserId: c.get('user')?.id ?? null`。
4. 路由改為：

```ts
  app.post('/api/v1/suggestions', requireWrite, limitBody, (c) => handleSubmit(c, deps));
```

- [ ] **Step 5: 我的建議**

`routes/me.ts` 在 `GET /api/v1/me` 之後加入（imports 加 `import { clientIp, hashIp } from '../ipHash';`）：

```ts
const MY_SUGGESTIONS_LIMIT = 50;

  app.get('/api/v1/me/suggestions', async (c) => {
    const user = c.get('user');
    const author = user ? { userId: user.id } : { hash: await hashIp(c.env.IP_HASH_SALT, clientIp(c.req.raw)) };
    return ok(c, { suggestions: await c.get('repos').suggestions.listByAuthor(author, MY_SUGGESTIONS_LIMIT) });
  });
```

（`MY_SUGGESTIONS_LIMIT` 放在模組頂層。）

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: PASS；coverage ≥ 80%。

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): require CSRF for suggestions, credit logged-in authors and list my suggestions"
```

---

### Task 9: 權限 middleware、角色／停權與封鎖管理 API

**Files:**
- Create: `apps/worker/src/auth/guard.ts`、`apps/worker/src/routes/adminUsers.ts`、`apps/worker/src/routes/adminBlocks.ts`
- Modify: `apps/worker/src/app.ts`
- Test: `apps/worker/src/routes/adminAccess.test.ts`、`apps/worker/src/routes/adminUsers.test.ts`

**Interfaces:**
- Consumes: `can`、`ROLES`、`isSubject`（Task 1）、`requireWrite`、`parseJson`、`UserRepo`、`BlockRepo`。
- Produces:
  - `requirePermission(action: Action): MiddlewareHandler<AppEnv>` — 未登入 401 `login_required`；權限不足 403 `forbidden`
  - `GET /api/v1/admin/users?q=` → `{ users: AdminUserView[] }`（最多 50）
  - `POST /api/v1/admin/users/:id/role` `{ role }` → `{ id, role }`；`POST /api/v1/admin/users/:id/ban` `{ banned }` → `{ id, banned }`；對自己 → 400 `self_change`；不存在 → 404 `user_not_found`
  - `GET /api/v1/admin/blocks` → `{ blocks: BlockRecord[] }`；`POST /api/v1/admin/blocks` `{ subject, reason? }` → 201；`DELETE /api/v1/admin/blocks/:subject` → 200 或 404 `block_not_found`
  - 拒絕測試表格 `ADMIN_ENDPOINTS`（3B2 會追加列）

- [ ] **Step 1: 寫失敗測試（拒絕表格）**

```ts
// apps/worker/src/routes/adminAccess.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@mlf/core/review';
import { createApp } from '../app';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

interface Endpoint {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly route: string;
  readonly path: string;
  readonly body?: unknown;
  readonly minRole: 'reviewer' | 'admin';
}

/** 每支 admin API 都必須列在這裡；第一個測試會比對 app.routes，漏列即失敗 */
const ADMIN_ENDPOINTS: readonly Endpoint[] = [
  { method: 'GET', route: '/api/v1/admin/users', path: '/api/v1/admin/users', minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/users/:id/role', path: '/api/v1/admin/users/999/role', body: { role: 'reviewer' }, minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/users/:id/ban', path: '/api/v1/admin/users/999/ban', body: { banned: true }, minRole: 'admin' },
  { method: 'GET', route: '/api/v1/admin/blocks', path: '/api/v1/admin/blocks', minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/blocks', path: '/api/v1/admin/blocks', body: { subject: 'user:999' }, minRole: 'admin' },
  { method: 'DELETE', route: '/api/v1/admin/blocks/:subject', path: '/api/v1/admin/blocks/user%3A999', minRole: 'admin' },
];

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());

async function call(e: Endpoint, role: Role | null, headerOver: Record<string, string> = {}): Promise<Response> {
  const user = role ? await createUser(db, role) : undefined;
  const headers = { ...(await writeHeaders(user)), ...headerOver };
  return app.request(e.path, { method: e.method, headers, body: e.body === undefined ? undefined : JSON.stringify(e.body) }, testEnv({ DB: db }));
}

describe('admin API access control', () => {
  it('lists every registered admin route', () => {
    const registered = new Set(app.routes.filter((r) => r.path.startsWith('/api/v1/admin/') && r.method !== 'ALL').map((r) => `${r.method} ${r.path}`));
    expect(registered).toEqual(new Set(ADMIN_ENDPOINTS.map((e) => `${e.method} ${e.route}`)));
  });

  describe.each(ADMIN_ENDPOINTS)('$method $route', (e) => {
    it('rejects anonymous visitors with 401', async () => {
      const res = await call(e, null);
      expect(res.status).toBe(401);
      expect((await readJson(res)).error.code).toBe('login_required');
    });

    it('rejects contributors with 403', async () => {
      const res = await call(e, 'contributor');
      expect(res.status).toBe(403);
      expect((await readJson(res)).error.code).toBe('forbidden');
    });

    it.runIf(e.minRole === 'admin')('rejects reviewers with 403', async () => {
      expect((await call(e, 'reviewer')).status).toBe(403);
    });

    it.runIf(e.method !== 'GET')('rejects writes with a bad CSRF token even for admins', async () => {
      const res = await call(e, 'admin', { 'X-CSRF-Token': 'x'.repeat(43) });
      expect((await readJson(res)).error.code).toBe('bad_csrf');
    });

    it.runIf(e.method !== 'GET')('rejects writes from another origin even for admins', async () => {
      const res = await call(e, 'admin', { Origin: 'https://evil.test' });
      expect((await readJson(res)).error.code).toBe('bad_origin');
    });
  });
});
```

```ts
// apps/worker/src/routes/adminUsers.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, writeHeaders } from '../testAuth';
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
const send = async (path: string, method: string, admin: { id: number; sessionVersion: number }, body?: unknown) =>
  app.request(path, { method, headers: await writeHeaders(admin), body: body === undefined ? undefined : JSON.stringify(body) }, testEnv({ DB: db }));

describe('admin user management', () => {
  it('changes a role and invalidates the target old session', async () => {
    const admin = await createUser(db, 'admin');
    const target = await createUser(db, 'contributor', '目標');
    const oldCookie = await sessionCookie(target);
    const res = await send(`/api/v1/admin/users/${target.id}/role`, 'POST', admin, { role: 'reviewer' });
    expect((await readJson(res)).data).toEqual({ id: target.id, role: 'reviewer' });
    const me = await app.request('/api/v1/me', { headers: { Cookie: oldCookie } }, testEnv({ DB: db }));
    expect((await readJson<{ user: unknown }>(me)).data.user).toBeNull();
  });

  it('bans and unbans a user', async () => {
    const admin = await createUser(db, 'admin');
    const target = await createUser(db);
    expect((await readJson(await send(`/api/v1/admin/users/${target.id}/ban`, 'POST', admin, { banned: true }))).data).toEqual({ id: target.id, banned: true });
    expect((await createD1Repos(db).users.findById(target.id))?.banned).toBe(true);
    await send(`/api/v1/admin/users/${target.id}/ban`, 'POST', admin, { banned: false });
    expect((await createD1Repos(db).users.findById(target.id))?.banned).toBe(false);
  });

  it('refuses to change the acting admin', async () => {
    const admin = await createUser(db, 'admin');
    const res = await send(`/api/v1/admin/users/${admin.id}/role`, 'POST', admin, { role: 'contributor' });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('self_change');
    expect((await send(`/api/v1/admin/users/${admin.id}/ban`, 'POST', admin, { banned: true })).status).toBe(400);
  });

  it.each([
    ['/api/v1/admin/users/abc/role', { role: 'admin' }, 400, 'invalid_body'],
    ['/api/v1/admin/users/12345/role', { role: 'owner' }, 400, 'invalid_body'],
    ['/api/v1/admin/users/12345/role', { role: 'admin' }, 404, 'user_not_found'],
  ])('POST %s %j -> %i %s', async (path, body, status, code) => {
    const admin = await createUser(db, 'admin');
    const res = await send(path, 'POST', admin, body);
    expect(res.status).toBe(status);
    expect((await readJson(res)).error.code).toBe(code);
  });

  it('searches users', async () => {
    const admin = await createUser(db, 'admin', '管理員');
    await createUser(db, 'contributor', '史蒂夫');
    const res = await app.request('/api/v1/admin/users?q=史', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson<{ users: { displayName: string }[] }>(res)).data.users.map((u) => u.displayName)).toEqual(['史蒂夫']);
  });
});

describe('admin blocks', () => {
  it('adds, lists and removes blocked subjects', async () => {
    const admin = await createUser(db, 'admin');
    const subject = `ip:${'a'.repeat(64)}`;
    expect((await send('/api/v1/admin/blocks', 'POST', admin, { subject, reason: '洗版' })).status).toBe(201);
    const list = await app.request('/api/v1/admin/blocks', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson<{ blocks: { subject: string; reason: string }[] }>(list)).data.blocks).toEqual([{ subject, reason: '洗版', createdAt: expect.any(String) }]);
    expect((await send(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', admin)).status).toBe(200);
    expect((await send(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', admin)).status).toBe(404);
  });

  it('rejects malformed subjects', async () => {
    const admin = await createUser(db, 'admin');
    const res = await send('/api/v1/admin/blocks', 'POST', admin, { subject: 'email:a@b' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/admin*`
Expected: FAIL（路由不存在）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/auth/guard.ts
import type { MiddlewareHandler } from 'hono';
import { can, type Action } from '@mlf/core/review';
import type { AppEnv } from '../appEnv';
import { fail } from '../http';

/** 集中權限檢查（規格 §6）；每支 admin 路由都必須掛上 */
export function requirePermission(action: Action): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return fail(c, 401, 'login_required', '請先登入。');
    if (!can(user.role, action)) return fail(c, 403, 'forbidden', '你沒有權限執行這個動作。');
    await next();
  };
}
```

```ts
// apps/worker/src/routes/adminUsers.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { ROLES } from '@mlf/core/review';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, ok, parseJson } from '../http';

const idParam = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const roleBody = z.object({ role: z.enum(ROLES) });
const banBody = z.object({ banned: z.boolean() });
const MAX_USERS = 50;
const MAX_QUERY = 64;

function targetId(c: Ctx): number | Response {
  const parsed = idParam.safeParse(c.req.param('id'));
  if (!parsed.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
  if (parsed.data === c.get('user')?.id) return fail(c, 400, 'self_change', '不能變更自己的角色或停權狀態。');
  return parsed.data;
}

const notFound = (c: Ctx) => fail(c, 404, 'user_not_found', '找不到這位使用者。');

export function registerAdminUserRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/admin/users', requirePermission('manage'), async (c) => {
    const query = (c.req.query('q') ?? '').trim().slice(0, MAX_QUERY);
    return ok(c, { users: await c.get('repos').users.search(query, MAX_USERS) });
  });

  app.post('/api/v1/admin/users/:id/role', requireWrite, requirePermission('manage'), async (c) => {
    const id = targetId(c);
    if (id instanceof Response) return id;
    const body = await parseJson(c, roleBody);
    if (body instanceof Response) return body;
    const user = await c.get('repos').users.setRole(id, body.role);
    return user ? ok(c, { id: user.id, role: user.role }) : notFound(c);
  });

  app.post('/api/v1/admin/users/:id/ban', requireWrite, requirePermission('manage'), async (c) => {
    const id = targetId(c);
    if (id instanceof Response) return id;
    const body = await parseJson(c, banBody);
    if (body instanceof Response) return body;
    const user = await c.get('repos').users.setBanned(id, body.banned);
    return user ? ok(c, { id: user.id, banned: user.banned }) : notFound(c);
  });
}
```

```ts
// apps/worker/src/routes/adminBlocks.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { isSubject } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, ok, parseJson } from '../http';

const blockBody = z.object({
  subject: z.string().refine(isSubject),
  reason: z.string().trim().max(200).optional(),
});
const MAX_BLOCKS = 200;

export function registerAdminBlockRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/blocks', requirePermission('manage'), async (c) => ok(c, { blocks: await c.get('repos').blocks.list(MAX_BLOCKS) }));

  app.post('/api/v1/admin/blocks', requireWrite, requirePermission('manage'), async (c) => {
    const body = await parseJson(c, blockBody);
    if (body instanceof Response) return body;
    await c.get('repos').blocks.add(body.subject, body.reason || null, deps.now().toISOString());
    return ok(c, { subject: body.subject }, 201);
  });

  app.delete('/api/v1/admin/blocks/:subject', requireWrite, requirePermission('manage'), async (c) => {
    const removed = await c.get('repos').blocks.remove(c.req.param('subject'));
    return removed ? ok(c, { removed: true }) : fail(c, 404, 'block_not_found', '找不到這筆封鎖。');
  });
}
```

`app.ts`：import 兩個註冊函式，於 `registerSuggestionRoutes(app, deps);` 後加：

```ts
  registerAdminUserRoutes(app);
  registerAdminBlockRoutes(app, deps);
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: PASS；coverage ≥ 80%。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add permission middleware with role, ban and block management APIs"
```

---

### Task 10: 前端 — API client、帳號選單、我的建議、Turnstile 競態、按鈕名稱

**Files:**
- Create: `apps/site/src/islands/api.ts`、`apps/site/src/islands/AccountMenu.tsx`、`apps/site/src/islands/MySuggestions.tsx`
- Modify: `apps/site/src/islands/suggestApi.ts`、`apps/site/src/islands/TurnstileWidget.tsx`、`apps/site/src/components/Header.astro`、`apps/site/src/pages/mods/[modId].astro`、`apps/site/src/i18n/zh-TW.ts`
- Test: `apps/site/src/islands/api.test.ts`、`apps/site/src/islands/account.test.tsx`、`apps/site/src/islands/turnstile.test.tsx`、`apps/site/src/islands/suggest.test.tsx`（修改）

**Interfaces:**
- Consumes: `GET /api/v1/me`、`GET /api/v1/me/suggestions`、`POST /api/v1/auth/logout`、`GET /api/v1/auth/:provider/start`（Task 5–8）。
- Produces（`api.ts`，3B2 的管理頁會使用）：
  - `type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`
  - `type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `interface MeUser { id: number; displayName: string; role: 'admin' | 'reviewer' | 'contributor'; identities: readonly { provider: string; username: string | null }[] }`；`interface Me { user: MeUser | null; csrfToken: string }`
  - `apiGet<T>(path, fetchImpl?)`、`apiSend<T>(path, method: 'POST' | 'DELETE', body?, fetchImpl?)`、`loadMe(fetchImpl?)`（快取）、`resetMe()`

- [ ] **Step 1: 文案**

`i18n/zh-TW.ts` 的 `suggest` 區塊加 `openFor: (key: string) => \`建議修改 ${key}\`,`，並新增區塊：

```ts
  account: {
    login: '登入',
    menu: '帳號選單',
    loginWith: (provider: string) => `以 ${provider} 登入`,
    linkWith: (provider: string) => `綁定 ${provider}`,
    mySuggestions: '我的建議',
    admin: '管理後台',
    logout: '登出',
    close: '關閉',
    empty: '還沒有送出過建議。',
    anonymousNote: '未登入時，依你目前的網路位置顯示匿名送出的建議。',
    loadFailed: '載入失敗，請稍後再試。',
    status: {
      pending: '待審核',
      approved: '已核准，等待發佈',
      rejected: '已退回',
      superseded: '已由其他建議取代',
      conflict: '與最新譯文衝突',
      published: '已發佈',
    },
    errors: {
      bad_state: '登入逾時或來源不符，請再試一次。',
      cancelled: '已取消登入。',
      provider_failed: '無法取得登入資訊，請稍後再試。',
      banned: '此帳號已被停權。',
      identity_taken: '這個帳號已綁定到其他使用者。',
      provider_linked: '你已綁定過這個登入方式。',
      login_required: '請先登入。',
      default: '登入失敗，請稍後再試。',
    },
  },
```

- [ ] **Step 2: 寫失敗測試**

```ts
// apps/site/src/islands/api.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend, loadMe, resetMe } from './api';

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const me = { ok: true, data: { user: null, csrfToken: 'tok' } };

beforeEach(() => resetMe());

describe('api client', () => {
  it('maps envelopes and network errors', async () => {
    expect(await apiGet('/x', vi.fn(async () => res({ ok: true, data: 1 })))).toEqual({ ok: true, data: 1 });
    expect(await apiGet('/x', vi.fn(async () => res({ ok: false, error: { code: 'forbidden', message: '不行' } }, 403)))).toEqual({ ok: false, code: 'forbidden', message: '不行' });
    expect(await apiGet('/x', vi.fn(async () => { throw new Error('offline'); }))).toMatchObject({ ok: false, code: 'network' });
    expect(await apiGet('/x', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })))).toMatchObject({ ok: false, code: 'network' });
  });

  it('sends the CSRF token from /api/v1/me and caches it', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === '/api/v1/me' ? res(me) : res({ ok: true, data: { done: true } })));
    await apiSend('/api/v1/a', 'POST', { x: 1 }, fetchImpl);
    await apiSend('/api/v1/b', 'DELETE', undefined, fetchImpl);
    expect(fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/me')).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/a')!;
    expect(init).toMatchObject({ method: 'POST', body: '{"x":1}', headers: { 'X-CSRF-Token': 'tok' } });
  });

  it('does not cache a failed /api/v1/me', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    expect((await loadMe(fetchImpl)).ok).toBe(false);
    await loadMe(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
```

```tsx
// apps/site/src/islands/account.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountMenu from './AccountMenu';
import { resetMe } from './api';

const res = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
const anon = { user: null, csrfToken: 'csrf' };
const admin = { user: { id: 1, displayName: '管理員', role: 'admin', identities: [{ provider: 'github', username: 'MrPippi' }] }, csrfToken: 'csrf' };

beforeEach(() => resetMe());
afterEach(() => window.history.pushState({}, '', '/'));

describe('AccountMenu', () => {
  it('offers both providers to anonymous visitors with the current page as returnTo', async () => {
    window.history.pushState({}, '', '/mods/create/?auth_error=cancelled');
    render(<AccountMenu fetchImpl={vi.fn(async () => res(anon)) as never} />);
    await userEvent.click(await screen.findByText('登入'));
    expect(screen.getByRole('link', { name: '以 Discord 登入' })).toHaveAttribute('href', '/api/v1/auth/discord/start?returnTo=%2Fmods%2Fcreate%2F');
    expect(screen.getByRole('link', { name: '以 GitHub 登入' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('已取消登入。');
  });

  it('shows admin link and unlinked providers, then logs out with the CSRF token', async () => {
    let meCalls = 0;
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/v1/me') return res(meCalls++ === 0 ? admin : anon);
      return res({ loggedOut: true });
    });
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    expect(screen.getByRole('link', { name: '管理後台' })).toHaveAttribute('href', '/admin/');
    expect(screen.getByRole('link', { name: '綁定 Discord' })).toHaveAttribute('href', expect.stringContaining('link=1'));
    expect(screen.queryByRole('link', { name: '綁定 GitHub' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByText('登入')).toBeInTheDocument();
    const logout = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/auth/logout');
    expect(logout?.[1]).toMatchObject({ method: 'POST', headers: { 'X-CSRF-Token': 'csrf' } });
  });

  it('lists my suggestions with readable statuses', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/v1/me/suggestions'
        ? res({ suggestions: [{ id: 3, modId: 'create', key: 'a', proposed: '齒輪', status: 'rejected', reviewNote: '用詞不一致', createdAt: '', reviewedAt: '' }] })
        : res(anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('登入'));
    await userEvent.click(screen.getByRole('button', { name: '我的建議' }));
    const dialog = await screen.findByRole('dialog', { name: '我的建議' });
    expect(dialog).toHaveTextContent('齒輪');
    expect(dialog).toHaveTextContent('已退回：用詞不一致');
  });
});
```

```tsx
// apps/site/src/islands/turnstile.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
  delete window.turnstile;
});

async function loadWidget() {
  return (await import('./TurnstileWidget')).default;
}

describe('TurnstileWidget', () => {
  it('injects the script once and renders every widget after it loads', async () => {
    const TurnstileWidget = await loadWidget();
    render(<><TurnstileWidget onToken={() => undefined} /><TurnstileWidget onToken={() => undefined} /></>);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    const renderSpy = vi.fn(() => 'w');
    window.turnstile = { render: renderSpy, remove: vi.fn() } as never;
    await act(async () => { scripts[0]?.dispatchEvent(new Event('load')); });
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('renders a widget mounted after the script already loaded', async () => {
    const TurnstileWidget = await loadWidget();
    render(<TurnstileWidget onToken={() => undefined} />);
    const renderSpy = vi.fn(() => 'w');
    window.turnstile = { render: renderSpy, remove: vi.fn() } as never;
    await act(async () => { document.head.querySelector('script')?.dispatchEvent(new Event('load')); });
    await act(async () => { render(<TurnstileWidget onToken={() => undefined} />); });
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });
});
```

`suggest.test.tsx` 修改：

1. 加 `import { beforeEach } from 'vitest';`（併入既有 import）與 `import { resetMe } from './api';`，檔案頂層加 `beforeEach(() => resetMe());`。
2. `describe('submitSuggestion')` 的三個 fetch mock 改為依 URL 回應：

```ts
  it('maps success and error envelopes', async () => {
    const meRes = jsonRes({ ok: true, data: { user: null, csrfToken: 'csrf' } });
    const okFetch = vi.fn(async (url: string) => (url === '/api/v1/me' ? meRes : jsonRes({ ok: true, data: { id: 3, formatWarning: true } }, 201)));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, okFetch as never)).toEqual({ ok: true, id: 3, formatWarning: true });
    resetMe();
    const errFetch = vi.fn(async (url: string) => (url === '/api/v1/me' ? meRes : jsonRes({ ok: false, error: { code: 'rate_limited', message: '太頻繁' } }, 429)));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, errFetch as never)).toEqual({ ok: false, code: 'rate_limited', message: '太頻繁' });
    resetMe();
    const netFetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, netFetch as never)).toMatchObject({ ok: false, code: 'network' });
  });
```

3. `SuggestDialog` 的 `mount` 預設 fetch 改為：

```ts
  function mount(fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/v1/me') return jsonRes({ ok: true, data: { user: null, csrfToken: 'csrf' } });
    return url.endsWith('.json') ? jsonRes(modJson) : jsonRes({ ok: true, data: { id: 1, formatWarning: false } }, 201);
  })) {
```

並在第一個 SuggestDialog 測試最後追加：`expect((post?.[1] as RequestInit).headers).toMatchObject({ 'X-CSRF-Token': 'csrf' });`

- [ ] **Step 3: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/islands`
Expected: FAIL（`./api`、`./AccountMenu` 不存在；Turnstile 第二個測試逾時或 render 次數不符）。

- [ ] **Step 4: 實作 api.ts 與 suggestApi.ts**

```ts
// apps/site/src/islands/api.ts
export type ApiResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly code: string; readonly message: string };
export type FetchLike = (input: string, init?: RequestInit) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface MeUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: 'admin' | 'reviewer' | 'contributor';
  readonly identities: readonly { readonly provider: string; readonly username: string | null }[];
}

export interface Me {
  readonly user: MeUser | null;
  readonly csrfToken: string;
}

const NETWORK_ERROR: ApiResult<never> = { ok: false, code: 'network', message: '連線失敗，請檢查網路後再試。' };
const UNKNOWN_MESSAGE = '操作失敗，請稍後再試。';

interface Envelope<T> {
  readonly ok?: boolean;
  readonly data?: T;
  readonly error?: { readonly code?: string; readonly message?: string };
}

async function request<T>(fetchImpl: FetchLike, path: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const body = (await (await fetchImpl(path, { credentials: 'same-origin', ...init })).json()) as Envelope<T>;
    if (body.ok === true && body.data !== undefined) return { ok: true, data: body.data };
    return { ok: false, code: body.error?.code ?? 'unknown', message: body.error?.message ?? UNKNOWN_MESSAGE };
  } catch {
    return NETWORK_ERROR;
  }
}

export function apiGet<T>(path: string, fetchImpl: FetchLike = fetch): Promise<ApiResult<T>> {
  return request<T>(fetchImpl, path, {});
}

let meCache: Promise<ApiResult<Me>> | null = null;

/** 目前使用者與 CSRF token；成功結果在頁面生命週期內快取 */
export function loadMe(fetchImpl: FetchLike = fetch): Promise<ApiResult<Me>> {
  const pending = meCache ?? apiGet<Me>('/api/v1/me', fetchImpl);
  meCache = pending;
  return pending.then((result) => {
    if (!result.ok && meCache === pending) meCache = null;
    return result;
  });
}

export function resetMe(): void {
  meCache = null;
}

export async function apiSend<T>(path: string, method: 'POST' | 'DELETE', body?: unknown, fetchImpl: FetchLike = fetch): Promise<ApiResult<T>> {
  const me = await loadMe(fetchImpl);
  if (!me.ok) return me;
  return request<T>(fetchImpl, path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.data.csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
```

```ts
// apps/site/src/islands/suggestApi.ts
import { apiSend, type FetchLike } from './api';

export interface SuggestionInput {
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly note?: string;
  readonly turnstileToken: string;
}

export type SubmitResult = { ok: true; id: number; formatWarning: boolean } | { ok: false; code: string; message: string };

export async function submitSuggestion(input: SuggestionInput, fetchImpl: FetchLike = fetch): Promise<SubmitResult> {
  const result = await apiSend<{ id: number; formatWarning: boolean }>('/api/v1/suggestions', 'POST', input, fetchImpl);
  return result.ok ? { ok: true, id: result.data.id, formatWarning: result.data.formatWarning } : { ok: false, code: result.code, message: result.message };
}
```

（`SuggestForm`／`SuggestDialog` 的 `fetchImpl` prop 型別若為 `typeof fetch` 仍相容，不需修改。）

- [ ] **Step 5: 實作 Turnstile 修正**

`TurnstileWidget.tsx` 的 `loadScript` 換成模組層級共用的 Promise：

```ts
let scriptPromise: Promise<void> | null = null;

/** 全頁只注入一次 script；所有 widget 共用同一個 Promise，避免 script 已載入後才掛載者永遠等不到 load */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = Object.assign(document.createElement('script'), { src: SCRIPT_URL, async: true });
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => {
      scriptPromise = null;
      el.remove();
      reject(new Error('turnstile load failed'));
    }, { once: true });
    document.head.append(el);
  });
  return scriptPromise;
}
```

- [ ] **Step 6: 實作 AccountMenu 與 MySuggestions**

```tsx
// apps/site/src/islands/MySuggestions.tsx
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

export default function MySuggestions({ fetchImpl = fetch, loggedIn, onClose }: { readonly fetchImpl?: FetchLike; readonly loggedIn: boolean; readonly onClose: () => void }) {
  const [state, setState] = useState<readonly MySuggestion[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void apiGet<{ suggestions: MySuggestion[] }>('/api/v1/me/suggestions', fetchImpl).then((r) => {
      if (alive) setState(r.ok ? r.data.suggestions : 'error');
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t.account.mySuggestions} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">{t.account.mySuggestions}</h3>
          <button type="button" className="link text-sm" onClick={onClose}>{t.account.close}</button>
        </div>
        {!loggedIn && <p className="mb-2 text-xs text-muted">{t.account.anonymousNote}</p>}
        {state === 'loading' && <p className="text-muted">{t.suggest.loading}</p>}
        {state === 'error' && <p role="alert" className="text-danger">{t.account.loadFailed}</p>}
        {typeof state !== 'string' && state.length === 0 && <p className="text-muted">{t.account.empty}</p>}
        {typeof state !== 'string' && state.length > 0 && (
          <ul className="divide-y divide-line">
            {state.map((s) => (
              <li key={s.id} className="py-2">
                <div className="text-xs text-muted"><code>{s.modId}</code> · <code>{s.key}</code></div>
                <div>{s.proposed}</div>
                <div className="text-xs">{statusText(s)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

```tsx
// apps/site/src/islands/AccountMenu.tsx
import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { apiSend, loadMe, resetMe, type FetchLike, type Me } from './api';
import MySuggestions from './MySuggestions';

const PROVIDERS = [
  { id: 'discord', label: 'Discord' },
  { id: 'github', label: 'GitHub' },
] as const;

const ERRORS: Readonly<Record<string, string>> = t.account.errors;

function startUrl(provider: string, link: boolean): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  const params = new URLSearchParams({ returnTo: `${url.pathname}${url.search}` });
  if (link) params.set('link', '1');
  return `/api/v1/auth/${provider}/start?${params.toString()}`;
}

function AuthError() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));
  if (!code) return null;
  return <p role="alert" className="absolute right-0 mt-1 w-56 text-xs text-danger">{Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.default}</p>;
}

export default function AccountMenu({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [me, setMe] = useState<Me | null>(null);
  const [showMine, setShowMine] = useState(false);
  const refresh = useCallback(async () => {
    const result = await loadMe(fetchImpl);
    if (result.ok) setMe(result.data);
  }, [fetchImpl]);
  useEffect(() => { void refresh(); }, [refresh]);

  const logout = async () => {
    const result = await apiSend('/api/v1/auth/logout', 'POST', {}, fetchImpl);
    if (!result.ok) return;
    resetMe();
    await refresh();
  };

  if (!me) return null;
  const user = me.user;
  const linked = new Set(user?.identities.map((i) => i.provider) ?? []);
  return (
    <div className="relative text-sm">
      <details>
        <summary aria-label={t.account.menu} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-muted hover:bg-surface-2 hover:text-fg">
          {user ? user.displayName : t.account.login}
        </summary>
        <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-2 rounded-sm border-2 border-line-strong bg-surface p-3">
          {!user && PROVIDERS.map((p) => <a key={p.id} className="link" href={startUrl(p.id, false)}>{t.account.loginWith(p.label)}</a>)}
          <button type="button" className="link text-left" onClick={() => setShowMine(true)}>{t.account.mySuggestions}</button>
          {user && PROVIDERS.filter((p) => !linked.has(p.id)).map((p) => <a key={p.id} className="link" href={startUrl(p.id, true)}>{t.account.linkWith(p.label)}</a>)}
          {user && user.role !== 'contributor' && <a className="link" href="/admin/">{t.account.admin}</a>}
          {user && <button type="button" className="link text-left" onClick={() => void logout()}>{t.account.logout}</button>}
        </div>
      </details>
      <AuthError />
      {showMine && <MySuggestions fetchImpl={fetchImpl} loggedIn={user !== null} onClose={() => setShowMine(false)} />}
    </div>
  );
}
```

> `summary` 的 `aria-label` 會蓋掉可見文字；測試用 `findByText('登入')`／`findByText('管理員')` 找可見文字，不受影響。

- [ ] **Step 7: 掛載與按鈕名稱**

`Header.astro`：frontmatter 加 `import AccountMenu from '../islands/AccountMenu';` 與 `SUGGEST_ENABLED`（併入 `../lib/config` 既有 import），在主題切換 `<button id="theme-toggle" …>…</button>` 之後加：

```astro
    {SUGGEST_ENABLED && <AccountMenu client:idle />}
```

`[modId].astro` 每列建議按鈕改為：

```astro
{SUGGEST_ENABLED && <button type="button" class="ml-2 text-xs link" data-suggest-key={key} aria-label={t.suggest.openFor(key)}>{t.suggest.open}</button>}
```

（若 redesign 版本的按鈕 class 不同，保留其 class，只加 `aria-label`。）

- [ ] **Step 8: 執行確認通過**

Run: `cd apps/site && npx vitest run && npx astro check && cd ../.. && npm run lint && PUBLIC_SUGGEST_ENABLED=true npm run build`
Expected: site 測試全過（新增 api 3、account 3、turnstile 2）；astro check 0 errors；lint 0 errors；build OK。

- [ ] **Step 9: Commit**

```bash
git add apps/site
git commit -m "feat(site): add account menu, my suggestions and CSRF-aware API client"
```

---

### Task 11: wrangler 設定、本機變數、E2E 登入流程

**Files:**
- Modify: `wrangler.jsonc`、`.dev.vars.example`、`README.md`
- Create: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: 全部前述 Task。

- [ ] **Step 1: 寫失敗的 E2E**

```ts
// e2e/auth.spec.ts
import { expect, test } from '@playwright/test';

test('local test login shows the account menu and logout returns to anonymous', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await expect(page.getByText('登入', { exact: true })).toBeVisible();

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/v1/auth/test-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'discord', providerUserId: 'e2e-auth', username: 'e2e', displayName: 'E2E 測試者' }),
    });
    return res.status;
  });
  expect(status).toBe(200);

  await page.reload();
  await page.getByText('E2E 測試者').click();
  await page.getByRole('button', { name: '登出' }).click();
  await expect(page.getByText('登入', { exact: true })).toBeVisible();
});

test('admin APIs reject anonymous visitors', async ({ request }) => {
  const res = await request.get('/api/v1/admin/users');
  expect(res.status()).toBe(401);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cp .dev.vars.example .dev.vars && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test e2e/auth.spec.ts`
Expected: FAIL（`.dev.vars.example` 尚無 `TEST_LOGIN_ENABLED` → test-login 404；`/api/v1/admin/*` 不在 `run_worker_first`，由 assets 回 404 頁）。

- [ ] **Step 3: 設定**

`wrangler.jsonc` 的 `assets.run_worker_first` 與 `vars` 改為：

```jsonc
    "run_worker_first": [
      "/api/v1/auth/*",
      "/api/v1/suggestions",
      "/api/v1/suggestions/*",
      "/api/v1/me",
      "/api/v1/me/*",
      "/api/v1/admin/*"
    ]
```

```jsonc
  // 正式網址；本機 wrangler dev 由 .dev.vars／--var 覆寫
  "vars": {
    "SITE_URL": "https://modlangforge.jack3555tw.workers.dev",
    "ADMIN_BOOTSTRAP": "github:MrPippi",
    "GITHUB_API_BASE": "https://api.github.com"
  },
```

`.dev.vars.example` 追加：

```
# 僅本機：允許 POST /api/v1/auth/test-login（SITE_URL 為 localhost 時才生效）
TEST_LOGIN_ENABLED=true
```

README「開發」段落補：

```
# 3B1 起 .dev.vars 需含 SESSION_SECRET、DISCORD_*、GITHUB_APP_CLIENT_*、TEST_LOGIN_ENABLED；
# 已有 .dev.vars 者請對照 .dev.vars.example 補齊。本機以 POST /api/v1/auth/test-login 模擬登入，
# 真實 OAuth 只在部署後的網址可用（callback 需在 Discord／GitHub 登記）。
# 本機頻率限制紀錄存在 .wrangler/state；測試被限流時可刪除該目錄。
```

- [ ] **Step 4: 執行確認通過**

Run: `cp .dev.vars.example .dev.vars && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`
Expected: 原有 E2E（含 3A 的匿名建議，現在會先取 CSRF）＋新 2 個全過。

- [ ] **Step 5: 全套驗證與 Commit**

Run: `npm run lint && npm test && npm run test:coverage -w @mlf/core && npm run test:coverage -w @mlf/worker && npm run typecheck -w @mlf/site && npm run typecheck -w @mlf/worker`
Expected: 全部通過。

```bash
git add wrangler.jsonc .dev.vars.example README.md e2e/auth.spec.ts
git commit -m "feat: route auth, me and admin paths to the Worker and add login e2e"
```

---

## 自我檢查（撰寫時已完成）

- 規格對照：§5.4 登入／綁定／bootstrap（Task 4、6、7）；§4 session／session_version（Task 5、9）；§6 權限與每支 admin API 拒絕測試（Task 9，含路由比對防漏）；§7 Origin＋CSRF＋cookie 屬性（Task 5、8、9）、zod 驗證（各路由）、錯誤訊息不洩漏（Task 3、7）；§3 `run_worker_first`、啟動驗證、`ADMIN_BOOTSTRAP`、`GITHUB_API_BASE`（Task 3、11）；§9 測試用登入路由僅測試環境（Task 7）。§5.2、§5.3、`/admin/` UI 屬 3B2；`/me/` 頁、`/contributors/` 屬 3C。
- 型別一致：`Repos`（Task 2 建、Task 4 加 `users`）、`AppDeps`（Task 3 建、Task 8 改 `verifyTurnstile`）、`SessionUser`、`FetchLike`（Worker 與 site 各自定義，site 版較寬鬆）。
