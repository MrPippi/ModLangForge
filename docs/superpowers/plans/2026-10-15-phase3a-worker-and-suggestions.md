# 第三階段 3A：Worker 平台與匿名譯文建議 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把網站搬到單一 Cloudflare Worker（靜態資產＋API＋D1），並讓任何人能在模組頁對單條譯文送出建議（Turnstile、頻率限制、格式碼檢查）。

**Architecture:** Astro 照舊產生靜態站到 `apps/site/dist`；新 workspace `apps/worker`（Hono）只接 `run_worker_first` 列出的動態路徑，其餘交給 assets。建議驗證規則是 `packages/core/src/review` 的純函式；Worker 以注入的依賴（repo、Turnstile、模組資料載入）組裝，路由測試用記憶體假物件，D1 實作用 wrangler `getPlatformProxy` 對本機 D1 測。

**Tech Stack:** Hono 4.13.12、wrangler 4.145.0、@cloudflare/workers-types 5.20260930.2、D1、Cloudflare Turnstile、zod 4、Vitest 5、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-15-phase3-community-review-design.md`

**範圍：** 規格 §3（Worker 架構）、§4（完整 schema，一次建好）、§5.1（送出建議）、§7 中與匿名送出相關的部分、§8 步驟 1–2、§9 的對應層級。**不含**：登入（3B）、審核與發佈（3B）、個人頁與貢獻者（3C）、自訂網域與 Pages 轉址（3C）。

## Global Constraints

- 依賴版本一律使用發佈滿兩週的版本：`hono@4.13.12`、`wrangler@4.145.0`、`@cloudflare/workers-types@5.20260930.2`（勿用 `@cloudflare/vitest-pool-workers`：其 peer 依賴 vitest ^4，與 repo 的 vitest 5 衝突）。
- 回應格式 `{ ok: true, data } | { ok: false, error: { code, message } }`；`message` 為中文、不含內部細節。
- 不可變資料；檔案 < 400 行；函式 < 50 行。
- 不儲存原始 IP：`author_hash = SHA-256(IP_HASH_SALT + ip)` 的 hex。
- 建議內容限制：非空白、與目前譯文不同、長度 ≤ min(1000, max(原文長度 × 4, 50))；備註 ≤ 500。
- 頻率：每主體每小時 30 條。
- 寫入 API 檢查 `Origin` 等於 `SITE_URL`（3A 無 cookie，CSRF token 留待 3B）。
- 任何對外部服務的建立／部署（建立 D1、`wrangler deploy`、設定 secret）都需使用者在對話中明確同意；push `main` 等於發佈正式站。
- Commit 訊息結尾加：`Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX`

## Review Focus

1. **key 含特殊字元或原型名稱**（`constructor`、`__proto__`）：送出建議時查詢模組譯文不可誤判存在／崩潰 → Task 2 測試。
2. **模組不存在或 assets 回 404**：API 回 404 `mod_not_found`，不是 500 → Task 6 測試。
3. **Turnstile 服務本身失敗（網路錯誤、非 JSON）**：視為驗證失敗回 403，不洩漏錯誤 → Task 5 測試。
4. **同一主體重複送同一 key**：覆蓋舊的 pending，不新增列 → Task 4 測試。
5. **沒有 `CF-Connecting-IP`（本機開發）**：以 `'unknown'` 雜湊，仍可運作與限流 → Task 6 測試。

---

## File Structure

```
wrangler.jsonc                                  Worker 設定（assets、run_worker_first、D1）
migrations/0001_initial.sql                     規格 §4 全部資料表
packages/core/src/review/
  limits.ts                                     常數
  validateSuggestion.ts                         建議驗證（純函式）
  review.test.ts
  index.ts
apps/worker/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts                                  Worker 入口
  src/app.ts                                    createApp(deps)
  src/env.ts                                    Env 型別、requireEnv
  src/http.ts                                   回應封裝
  src/ipHash.ts                                 IP 雜湊
  src/turnstile.ts                              siteverify
  src/modSource.ts                              從 ASSETS 讀模組 JSON
  src/repo/types.ts                             SuggestionRepo 介面
  src/repo/memoryRepo.ts                        測試用記憶體實作
  src/repo/d1Repo.ts                            D1 實作
  src/routes/suggestions.ts                     POST /api/v1/suggestions
  src/*.test.ts、src/repo/d1Repo.test.ts、src/routes/suggestions.test.ts
apps/site/src/islands/SuggestDialog.tsx         建議對話框＋全部條目搜尋
apps/site/src/islands/suggestApi.ts             前端呼叫 API
apps/site/src/islands/TurnstileWidget.tsx       Turnstile 元件
apps/site/src/islands/suggest.test.tsx
apps/site/src/pages/mods/[modId].astro          （修改）預覽列加按鈕、掛 island
apps/site/src/i18n/zh-TW.ts                     （修改）suggest 文案
apps/site/src/lib/config.ts                     （修改）TURNSTILE_SITE_KEY
apps/site/astro.config.mjs、apps/site/public/_headers   （修改）CSP 放行 Turnstile
playwright.config.ts、e2e/suggest.spec.ts       E2E 改跑 wrangler dev
.github/workflows/ci.yml                         （修改）worker 測試
```

---

### Task 0: 前置合併

**Files:** 無新增。

- [ ] **Step 1: 合併 CSP 修正分支**

`fix/minor-cleanup`（commit `1bf4d15`，雜湊式 CSP）尚未進 `main`，本計畫的 CSP 修改以它為基礎。

Run: `git merge --no-edit fix/minor-cleanup`
Expected: 合併成功、無衝突；`apps/site/astro.config.mjs` 含 `security: { csp: ...}`。

- [ ] **Step 2: 確認基線**

Run: `npm ci && npm test && npm run build && npx playwright test`
Expected: 全部通過（core 97、site 71、E2E 9）。

---

### Task 1: core `review` — 常數與建議驗證

**Files:**
- Create: `packages/core/src/review/limits.ts`
- Create: `packages/core/src/review/validateSuggestion.ts`
- Create: `packages/core/src/review/index.ts`
- Test: `packages/core/src/review/review.test.ts`

**Interfaces:**
- Produces:
  - `SUGGESTION_LIMITS = { maxChars: 1000, sourceMultiplier: 4, minCap: 50, maxNote: 500, perHour: 30 }`
  - `type SuggestionRejection = 'empty' | 'unchanged' | 'too_long' | 'note_too_long'`
  - `validateSuggestion(input: { source: string; current: string | null; proposed: string; note?: string }): { ok: true; formatWarning: boolean } | { ok: false; reason: SuggestionRejection }`
  - `maxProposedLength(source: string): number`

- [ ] **Step 1: 寫失敗測試**

```ts
// packages/core/src/review/review.test.ts
import { describe, expect, it } from 'vitest';
import { maxProposedLength, SUGGESTION_LIMITS, validateSuggestion } from './index';

describe('maxProposedLength', () => {
  it('is 4x source, at least 50, at most 1000', () => {
    expect(maxProposedLength('abc')).toBe(50);
    expect(maxProposedLength('a'.repeat(100))).toBe(400);
    expect(maxProposedLength('a'.repeat(400))).toBe(SUGGESTION_LIMITS.maxChars);
  });
});

describe('validateSuggestion', () => {
  const base = { source: 'Apple %s', current: '蘋果 %s' };

  it('accepts a changed translation without warning', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果（%s）' })).toEqual({ ok: true, formatWarning: false });
  });

  it('flags format code mismatch but still accepts', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果' })).toEqual({ ok: true, formatWarning: true });
  });

  it('accepts a first translation when current is null', () => {
    expect(validateSuggestion({ source: 'Apple', current: null, proposed: '蘋果' })).toEqual({ ok: true, formatWarning: false });
  });

  it.each([
    ['empty', '   '],
    ['unchanged', '蘋果 %s'],
    ['too_long', '字'.repeat(51)],
  ] as const)('rejects %s', (reason, proposed) => {
    expect(validateSuggestion({ ...base, proposed })).toEqual({ ok: false, reason });
  });

  it('rejects an overlong note', () => {
    expect(validateSuggestion({ ...base, proposed: '蘋果！%s', note: 'x'.repeat(501) })).toEqual({ ok: false, reason: 'note_too_long' });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx vitest run src/review -w` 於 `packages/core`：`cd packages/core && npx vitest run src/review`
Expected: FAIL（`Cannot find module './index'` 或等效）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/review/limits.ts
/** 社群建議的內容與頻率限制（規格 §5.1、§7） */
export const SUGGESTION_LIMITS = {
  maxChars: 1000,
  sourceMultiplier: 4,
  minCap: 50,
  maxNote: 500,
  perHour: 30,
} as const;
```

```ts
// packages/core/src/review/validateSuggestion.ts
import { checkFormat } from '../validate/formatCodes';
import { SUGGESTION_LIMITS } from './limits';

export type SuggestionRejection = 'empty' | 'unchanged' | 'too_long' | 'note_too_long';

export interface SuggestionInput {
  readonly source: string;
  readonly current: string | null;
  readonly proposed: string;
  readonly note?: string;
}

export type SuggestionVerdict = { ok: true; formatWarning: boolean } | { ok: false; reason: SuggestionRejection };

export function maxProposedLength(source: string): number {
  const scaled = Math.max(source.length * SUGGESTION_LIMITS.sourceMultiplier, SUGGESTION_LIMITS.minCap);
  return Math.min(SUGGESTION_LIMITS.maxChars, scaled);
}

/** 驗證單條建議；格式碼不一致只標警告，不拒絕 */
export function validateSuggestion({ source, current, proposed, note }: SuggestionInput): SuggestionVerdict {
  if (proposed.trim() === '') return { ok: false, reason: 'empty' };
  if (proposed === current) return { ok: false, reason: 'unchanged' };
  if (proposed.length > maxProposedLength(source)) return { ok: false, reason: 'too_long' };
  if ((note?.length ?? 0) > SUGGESTION_LIMITS.maxNote) return { ok: false, reason: 'note_too_long' };
  return { ok: true, formatWarning: checkFormat(source, proposed) !== null };
}
```

```ts
// packages/core/src/review/index.ts
export { SUGGESTION_LIMITS } from './limits';
export { maxProposedLength, validateSuggestion, type SuggestionInput, type SuggestionRejection, type SuggestionVerdict } from './validateSuggestion';
```

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review`
Expected: PASS（8 tests）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): add suggestion validation rules"
```

---

### Task 2: core `review` — 從模組資料取原文與目前譯文

**Files:**
- Create: `packages/core/src/review/lookupEntry.ts`
- Modify: `packages/core/src/review/index.ts`
- Test: `packages/core/src/review/review.test.ts`（追加）

**Interfaces:**
- Produces: `lookupEntry(en: Readonly<Record<string, unknown>>, zh: Readonly<Record<string, unknown>>, key: string): { source: string; current: string | null } | null` — 只認自有且為字串的屬性。

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 review.test.ts
import { lookupEntry } from './index';

describe('lookupEntry', () => {
  const en = { a: 'Apple', b: 'Banana' };
  const zh = { a: '蘋果' };

  it('returns source and current translation', () => {
    expect(lookupEntry(en, zh, 'a')).toEqual({ source: 'Apple', current: '蘋果' });
    expect(lookupEntry(en, zh, 'b')).toEqual({ source: 'Banana', current: null });
  });

  it('ignores missing and prototype-named keys', () => {
    expect(lookupEntry(en, zh, 'zzz')).toBeNull();
    expect(lookupEntry(en, zh, 'constructor')).toBeNull();
    expect(lookupEntry(en, zh, '__proto__')).toBeNull();
  });

  it('ignores non-string values', () => {
    expect(lookupEntry({ a: 1 }, {}, 'a')).toBeNull();
    expect(lookupEntry(en, { a: 2 }, 'a')).toEqual({ source: 'Apple', current: null });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/review`
Expected: FAIL（`lookupEntry` 未匯出）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/review/lookupEntry.ts
function ownString(record: Readonly<Record<string, unknown>>, key: string): string | null {
  if (!Object.hasOwn(record, key)) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

/** 取得某 key 的原文與目前譯文；原文不存在時回傳 null */
export function lookupEntry(
  en: Readonly<Record<string, unknown>>,
  zh: Readonly<Record<string, unknown>>,
  key: string,
): { source: string; current: string | null } | null {
  const source = ownString(en, key);
  return source === null ? null : { source, current: ownString(zh, key) };
}
```

在 `index.ts` 加：`export { lookupEntry } from './lookupEntry';`

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review && npm run test:coverage`
Expected: PASS；coverage 門檻通過。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): add safe entry lookup for suggestions"
```

---

### Task 3: Worker workspace 骨架、wrangler 設定與 D1 schema

**Files:**
- Create: `apps/worker/package.json`、`apps/worker/tsconfig.json`、`apps/worker/vitest.config.ts`
- Create: `apps/worker/src/env.ts`、`apps/worker/src/http.ts`、`apps/worker/src/app.ts`、`apps/worker/src/index.ts`
- Create: `wrangler.jsonc`、`migrations/0001_initial.sql`
- Test: `apps/worker/src/app.test.ts`
- Modify: `.gitignore`（加 `.wrangler`、`.dev.vars`）

**Interfaces:**
- Produces:
  - `interface Env { DB: D1Database; ASSETS: Fetcher; SITE_URL: string; TURNSTILE_SECRET: string; IP_HASH_SALT: string }`
  - `ok<T>(c, data: T, status = 200)`、`fail(c, status, code: string, message: string)`
  - `interface AppDeps { repo(env: Env): SuggestionRepo; verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean>; loadMod(env: Env, modId: string): Promise<ModStrings | null>; now(): Date }`（`SuggestionRepo`、`ModStrings` 於 Task 4、6 定義；本 Task 先以 `createApp(deps: Partial<AppDeps>)` 建立空殼）
  - `createApp(deps): Hono<{ Bindings: Env }>`

- [ ] **Step 1: 建立 package 與設定**

```json
// apps/worker/package.json
{
  "name": "@mlf/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mlf/core": "*",
    "hono": "4.13.12",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "5.20260930.2",
    "wrangler": "4.145.0"
  }
}
```

```json
// apps/worker/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023"], "types": ["@cloudflare/workers-types", "node"] },
  "include": ["src"]
}
```

```ts
// apps/worker/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "modlangforge",
  "main": "apps/worker/src/index.ts",
  "compatibility_date": "2026-09-30",
  "assets": {
    "directory": "apps/site/dist",
    "binding": "ASSETS",
    "not_found_handling": "404-page",
    "run_worker_first": ["/api/v1/suggestions", "/api/v1/suggestions/*"]
  },
  "d1_databases": [
    // database_id 於 Task 9（部署）建立 D1 後填入；本機開發不需真實 id
    { "binding": "DB", "database_name": "modlangforge", "database_id": "local-dev-placeholder", "migrations_dir": "migrations" }
  ],
  "vars": { "SITE_URL": "http://localhost:8787" },
  "observability": { "enabled": true }
}
```

`.gitignore` 追加兩行：`.wrangler`、`.dev.vars`。

- [ ] **Step 2: 建立 migration（規格 §4 全表）**

```sql
-- migrations/0001_initial.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  minecraft_name TEXT,
  minecraft_uuid TEXT,
  minecraft_verified INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('admin', 'reviewer', 'contributor')),
  public INTEGER NOT NULL DEFAULT 1,
  banned INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE identities (
  provider TEXT NOT NULL CHECK (provider IN ('github', 'discord', 'minecraft')),
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  username TEXT,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE TABLE publish_batches (
  id INTEGER PRIMARY KEY,
  commit_sha TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  suggestion_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY,
  mod_id TEXT NOT NULL,
  key TEXT NOT NULL,
  base_target TEXT,
  proposed TEXT NOT NULL,
  note TEXT,
  format_warning INTEGER NOT NULL DEFAULT 0,
  author_user_id INTEGER REFERENCES users(id),
  author_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'superseded', 'conflict', 'published')),
  reviewer_id INTEGER REFERENCES users(id),
  review_note TEXT,
  batch_id INTEGER REFERENCES publish_batches(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_suggestions_status_mod ON suggestions (status, mod_id);
CREATE INDEX idx_suggestions_mod_key ON suggestions (mod_id, key);
CREATE INDEX idx_suggestions_author ON suggestions (author_user_id);

CREATE TABLE mod_status_changes (
  id INTEGER PRIMARY KEY,
  mod_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('partial', 'reviewed')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  batch_id INTEGER REFERENCES publish_batches(id),
  created_at TEXT NOT NULL
);

CREATE TABLE rate_events (
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rate_events_subject ON rate_events (subject, created_at);

CREATE TABLE blocked_subjects (
  subject TEXT PRIMARY KEY,
  reason TEXT,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 3: 寫失敗測試（envelope 與未知 API 路徑）**

```ts
// apps/worker/src/app.test.ts
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { testEnv } from './testEnv';

describe('app', () => {
  it('returns a JSON 404 envelope for unknown API paths', async () => {
    const res = await createApp({}).request('/api/v1/suggestions/nope', {}, testEnv({ DB: {} as D1Database }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found', message: '找不到這個 API。' } });
  });

  it('falls through to static assets for non-API paths', async () => {
    const res = await createApp({}).request('/mods/create/', {}, testEnv({ DB: {} as D1Database }));
    expect(await res.text()).toBe('asset:/mods/create/');
  });
});
```

```ts
// apps/worker/src/testEnv.ts（測試輔助，納入 coverage 排除：檔名不含 .test 但僅測試使用 → 加入 vitest exclude）
import type { Env } from './env';

/** 測試用 Env；ASSETS 回傳 `asset:<path>`，可用 overrides 覆寫 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  const assets = { fetch: async (input: RequestInfo | URL) => new Response(`asset:${new URL(String(input instanceof Request ? input.url : input)).pathname}`) };
  return {
    DB: undefined as unknown as D1Database,
    ASSETS: assets as unknown as Fetcher,
    SITE_URL: 'https://mlf.test',
    TURNSTILE_SECRET: 'test-secret',
    IP_HASH_SALT: 'test-salt',
    ...overrides,
  };
}
```

把 `vitest.config.ts` 的 coverage `exclude` 加上 `'src/testEnv.ts'`。

- [ ] **Step 4: 執行確認失敗**

Run: `npm install && cd apps/worker && npx vitest run`
Expected: FAIL（`./app` 不存在）。

- [ ] **Step 5: 實作 env、http、app、index**

```ts
// apps/worker/src/env.ts
export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly SITE_URL: string;
  readonly TURNSTILE_SECRET: string;
  readonly IP_HASH_SALT: string;
}

const REQUIRED: readonly (keyof Env)[] = ['DB', 'ASSETS', 'SITE_URL', 'TURNSTILE_SECRET', 'IP_HASH_SALT'];

/** 回傳缺少的設定名稱（只供伺服器端記錄，不回傳給前端） */
export function missingEnv(env: Partial<Env>): string[] {
  return REQUIRED.filter((name) => !env[name]);
}
```

```ts
// apps/worker/src/http.ts
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json({ ok: true, data }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ ok: false, error: { code, message } }, status);
}
```

```ts
// apps/worker/src/app.ts
import { Hono } from 'hono';
import type { Env } from './env';
import { missingEnv } from './env';
import { fail } from './http';

export interface AppDeps {
  readonly [name: string]: unknown;
}

export function createApp(_deps: AppDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/api/*', async (c, next) => {
    const missing = missingEnv(c.env);
    if (missing.length > 0) {
      console.error('missing env', missing);
      return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
    }
    await next();
  });

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

export default createApp({});
```

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit`
Expected: PASS（2 tests）；typecheck 0 errors。

- [ ] **Step 7: 本機啟動冒煙**

Run: `npm run build && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port 8787`（背景執行），再 `curl http://localhost:8787/mods/create/`（Windows 用 `node -e "fetch(...)"`）。
Expected: 首頁與模組頁 200；`/api/v1/index.json` 200（靜態）；`/api/v1/suggestions/x` 回 JSON 404。

- [ ] **Step 8: Commit**

```bash
git add apps/worker wrangler.jsonc migrations .gitignore package.json package-lock.json
git commit -m "feat(worker): add Worker skeleton, wrangler config and D1 schema"
```

---

### Task 4: SuggestionRepo 介面、記憶體實作與 D1 實作

**Files:**
- Create: `apps/worker/src/repo/types.ts`、`apps/worker/src/repo/memoryRepo.ts`、`apps/worker/src/repo/d1Repo.ts`
- Test: `apps/worker/src/repo/repo.contract.ts`（共用契約測試）、`apps/worker/src/repo/memoryRepo.test.ts`、`apps/worker/src/repo/d1Repo.test.ts`

**Interfaces:**
- Produces:

```ts
export interface NewSuggestion {
  readonly modId: string; readonly key: string; readonly baseTarget: string | null;
  readonly proposed: string; readonly note: string | null; readonly formatWarning: boolean;
  readonly authorUserId: number | null; readonly authorHash: string; readonly createdAt: string;
}
export interface StoredSuggestion extends NewSuggestion { readonly id: number; readonly status: 'pending' }
export interface SuggestionRepo {
  /** 同主體（authorUserId ?? authorHash）對同 mod/key 已有 pending 時覆蓋該列，否則新增 */
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  countRateEvents(subject: string, sinceIso: string): Promise<number>;
  recordRateEvent(subject: string, atIso: string): Promise<void>;
  isBlocked(subjects: readonly string[]): Promise<boolean>;
}
```

- [ ] **Step 1: 寫契約測試（兩種實作共用）**

```ts
// apps/worker/src/repo/repo.contract.ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewSuggestion, SuggestionRepo } from './types';

export const sample = (over: Partial<NewSuggestion> = {}): NewSuggestion => ({
  modId: 'create', key: 'block.create.cogwheel', baseTarget: '齒輪', proposed: '小齒輪', note: null,
  formatWarning: false, authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});

export function repoContract(name: string, makeRepo: () => Promise<SuggestionRepo>): void {
  describe(`${name} SuggestionRepo contract`, () => {
    let repo: SuggestionRepo;
    beforeEach(async () => { repo = await makeRepo(); });

    it('inserts a pending suggestion', async () => {
      const s = await repo.upsertPending(sample());
      expect(s).toMatchObject({ id: expect.any(Number), status: 'pending', proposed: '小齒輪' });
    });

    it('overwrites the same author pending suggestion for the same key', async () => {
      const first = await repo.upsertPending(sample());
      const second = await repo.upsertPending(sample({ proposed: '大齒輪' }));
      expect(second.id).toBe(first.id);
      expect(second.proposed).toBe('大齒輪');
    });

    it('keeps separate rows for different authors or keys', async () => {
      const a = await repo.upsertPending(sample());
      const b = await repo.upsertPending(sample({ authorHash: 'h2' }));
      const c = await repo.upsertPending(sample({ key: 'other' }));
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });

    it('counts rate events since a time', async () => {
      await repo.recordRateEvent('ip:h1', '2026-10-15T00:00:00.000Z');
      await repo.recordRateEvent('ip:h1', '2026-10-15T01:30:00.000Z');
      await repo.recordRateEvent('ip:h2', '2026-10-15T01:30:00.000Z');
      expect(await repo.countRateEvents('ip:h1', '2026-10-15T01:00:00.000Z')).toBe(1);
    });

    it('reports blocked subjects', async () => {
      expect(await repo.isBlocked(['ip:h1'])).toBe(false);
    });
  });
}
```

```ts
// apps/worker/src/repo/memoryRepo.test.ts
import { describe, expect, it } from 'vitest';
import { createMemoryRepo } from './memoryRepo';
import { repoContract } from './repo.contract';

repoContract('memory', async () => createMemoryRepo());

describe('memory repo blocking', () => {
  it('blocks listed subjects', async () => {
    expect(await createMemoryRepo({ blocked: ['ip:bad'] }).isBlocked(['user:1', 'ip:bad'])).toBe(true);
  });
});
```

```ts
// apps/worker/src/repo/d1Repo.test.ts
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { createD1Repo } from './d1Repo';
import { repoContract } from './repo.contract';

const root = resolve(__dirname, '../../../..');
const disposers: (() => Promise<void>)[] = [];
afterAll(async () => { await Promise.all(disposers.map((d) => d())); });

async function freshDb(): Promise<D1Database> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(root, 'wrangler.jsonc'),
    persist: { path: mkdtempSync(join(tmpdir(), 'mlf-d1-')) },
  });
  disposers.push(proxy.dispose);
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
    await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  }
  return proxy.env.DB;
}

repoContract('d1', async () => createD1Repo(await freshDb()));

describe('d1 repo blocking', () => {
  it('reads blocked_subjects', async () => {
    const db = await freshDb();
    await db.prepare('INSERT INTO blocked_subjects (subject, created_at) VALUES (?, ?)').bind('ip:bad', '2026-10-15').run();
    expect(await createD1Repo(db).isBlocked(['user:1', 'ip:bad'])).toBe(true);
  });
});
```

把 `vitest.config.ts` coverage `exclude` 加上 `'src/**/*.contract.ts'`。

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo`
Expected: FAIL（`./memoryRepo`、`./d1Repo` 不存在）。

- [ ] **Step 3: 實作 types 與記憶體 repo**

```ts
// apps/worker/src/repo/types.ts
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

export interface SuggestionRepo {
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  countRateEvents(subject: string, sinceIso: string): Promise<number>;
  recordRateEvent(subject: string, atIso: string): Promise<void>;
  isBlocked(subjects: readonly string[]): Promise<boolean>;
}

/** 同一作者的判定：已登入看 user id，否則看 IP 雜湊 */
export function sameAuthor(a: NewSuggestion, b: NewSuggestion): boolean {
  return a.authorUserId !== null || b.authorUserId !== null
    ? a.authorUserId === b.authorUserId
    : a.authorHash === b.authorHash;
}
```

```ts
// apps/worker/src/repo/memoryRepo.ts
import { sameAuthor, type NewSuggestion, type StoredSuggestion, type SuggestionRepo } from './types';

/** 測試與本機用的記憶體實作；內部陣列以替換方式更新 */
export function createMemoryRepo(opts: { blocked?: readonly string[] } = {}): SuggestionRepo {
  let rows: readonly StoredSuggestion[] = [];
  let events: readonly { subject: string; at: string }[] = [];
  const blocked = new Set(opts.blocked ?? []);

  return {
    async upsertPending(s: NewSuggestion) {
      const existing = rows.find((r) => r.modId === s.modId && r.key === s.key && sameAuthor(r, s));
      const row: StoredSuggestion = { ...s, id: existing?.id ?? rows.length + 1, status: 'pending' };
      rows = existing ? rows.map((r) => (r.id === existing.id ? row : r)) : [...rows, row];
      return row;
    },
    async countRateEvents(subject, sinceIso) {
      return events.filter((e) => e.subject === subject && e.at >= sinceIso).length;
    },
    async recordRateEvent(subject, atIso) {
      events = [...events, { subject, at: atIso }];
    },
    async isBlocked(subjects) {
      return subjects.some((s) => blocked.has(s));
    },
  };
}
```

- [ ] **Step 4: 實作 D1 repo**

```ts
// apps/worker/src/repo/d1Repo.ts
import type { NewSuggestion, StoredSuggestion, SuggestionRepo } from './types';

const AUTHOR_MATCH = `((?1 IS NOT NULL AND author_user_id = ?1) OR (?1 IS NULL AND author_user_id IS NULL AND author_hash = ?2))`;

export function createD1Repo(db: D1Database): SuggestionRepo {
  return {
    async upsertPending(s: NewSuggestion): Promise<StoredSuggestion> {
      const existing = await db
        .prepare(`SELECT id FROM suggestions WHERE status = 'pending' AND mod_id = ?3 AND key = ?4 AND ${AUTHOR_MATCH}`)
        .bind(s.authorUserId, s.authorHash, s.modId, s.key)
        .first<{ id: number }>();
      if (existing) {
        await db
          .prepare('UPDATE suggestions SET base_target = ?, proposed = ?, note = ?, format_warning = ?, created_at = ? WHERE id = ?')
          .bind(s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.createdAt, existing.id)
          .run();
        return { ...s, id: existing.id, status: 'pending' };
      }
      const inserted = await db
        .prepare(`INSERT INTO suggestions (mod_id, key, base_target, proposed, note, format_warning, author_user_id, author_hash, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?) RETURNING id`)
        .bind(s.modId, s.key, s.baseTarget, s.proposed, s.note, s.formatWarning ? 1 : 0, s.authorUserId, s.authorHash, s.createdAt)
        .first<{ id: number }>();
      if (!inserted) throw new Error('insert suggestion returned no id');
      return { ...s, id: inserted.id, status: 'pending' };
    },
    async countRateEvents(subject, sinceIso) {
      const row = await db
        .prepare('SELECT COUNT(*) AS n FROM rate_events WHERE subject = ? AND created_at >= ?')
        .bind(subject, sinceIso)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },
    async recordRateEvent(subject, atIso) {
      await db.prepare('INSERT INTO rate_events (subject, created_at) VALUES (?, ?)').bind(subject, atIso).run();
    },
    async isBlocked(subjects) {
      if (subjects.length === 0) return false;
      const placeholders = subjects.map(() => '?').join(', ');
      const row = await db
        .prepare(`SELECT 1 AS hit FROM blocked_subjects WHERE subject IN (${placeholders}) LIMIT 1`)
        .bind(...subjects)
        .first<{ hit: number }>();
      return row !== null;
    },
  };
}
```

- [ ] **Step 5: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/repo`
Expected: PASS（兩種實作各 5 個契約測試＋各 1 個封鎖測試）。若 `getPlatformProxy` 在 Windows 需較久啟動，`testTimeout` 已設 30 秒。

- [ ] **Step 6: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): add suggestion repository with memory and D1 implementations"
```

---

### Task 5: IP 雜湊與 Turnstile 驗證

**Files:**
- Create: `apps/worker/src/ipHash.ts`、`apps/worker/src/turnstile.ts`
- Test: `apps/worker/src/security.test.ts`

**Interfaces:**
- Produces:
  - `hashIp(salt: string, ip: string): Promise<string>` — 64 字元小寫 hex
  - `clientIp(req: Request): string` — `CF-Connecting-IP` 或 `'unknown'`
  - `TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'`
  - `verifyTurnstile(secret: string, token: string, ip: string, fetchImpl?: typeof fetch): Promise<boolean>` — 任何錯誤回 `false`

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/security.test.ts
import { describe, expect, it, vi } from 'vitest';
import { clientIp, hashIp } from './ipHash';
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from './turnstile';

describe('hashIp', () => {
  it('is deterministic, salted and hex', async () => {
    const a = await hashIp('s1', '1.2.3.4');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('s1', '1.2.3.4')).toBe(a);
    expect(await hashIp('s2', '1.2.3.4')).not.toBe(a);
  });

  it('reads CF-Connecting-IP or falls back to unknown', () => {
    expect(clientIp(new Request('https://x', { headers: { 'CF-Connecting-IP': '9.9.9.9' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('https://x'))).toBe('unknown');
  });
});

describe('verifyTurnstile', () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('posts secret, token and ip and returns success', async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile('sec', 'tok', '1.1.1.1', fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const form = init.body as FormData;
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['sec', 'tok', '1.1.1.1']);
  });

  it('returns false on failure, HTTP error, bad JSON, network error or empty token', async () => {
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', reply({ success: true }, 500))).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', vi.fn(async () => new Response('not json')))).toBe(false);
    expect(await verifyTurnstile('sec', 'tok', 'ip', vi.fn(async () => { throw new Error('down'); }))).toBe(false);
    expect(await verifyTurnstile('sec', '', 'ip', reply({ success: true }))).toBe(false);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/security.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/ipHash.ts
export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** SHA-256(salt + ip) 的 hex；不保存原始 IP */
export async function hashIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

```ts
// apps/worker/src/turnstile.ts
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 伺服器端驗證 Turnstile token；任何錯誤都視為未通過 */
export async function verifyTurnstile(secret: string, token: string, ip: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (token === '') return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  body.set('remoteip', ip);
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch (err) {
    console.error('turnstile verify failed', err);
    return false;
  }
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/security.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add IP hashing and Turnstile verification"
```

---

### Task 6: 模組資料載入與 `POST /api/v1/suggestions`

**Files:**
- Create: `apps/worker/src/modSource.ts`、`apps/worker/src/routes/suggestions.ts`
- Modify: `apps/worker/src/app.ts`、`apps/worker/src/index.ts`
- Test: `apps/worker/src/routes/suggestions.test.ts`

**Interfaces:**
- Consumes: `validateSuggestion`、`lookupEntry`、`SUGGESTION_LIMITS`（Task 1–2）；`SuggestionRepo`（Task 4）；`hashIp`、`clientIp`、`verifyTurnstile`（Task 5）。
- Produces:
  - `interface ModStrings { readonly en: Readonly<Record<string, unknown>>; readonly zh: Readonly<Record<string, unknown>> }`
  - `loadModFromAssets(env: Env, modId: string): Promise<ModStrings | null>`
  - `AppDeps`（取代 Task 3 的空殼）：`{ repo(env): SuggestionRepo; verifyTurnstile(secret, token, ip): Promise<boolean>; loadMod(env, modId): Promise<ModStrings | null>; now(): Date }`
  - API：`POST /api/v1/suggestions`，body `{ modId: string; key: string; proposed: string; note?: string; turnstileToken: string }`
    - 201 `{ ok: true, data: { id: number; formatWarning: boolean } }`
    - 400 `invalid_body` | `empty` | `unchanged` | `too_long` | `note_too_long`；403 `bad_origin` | `turnstile_failed` | `blocked`；404 `mod_not_found` | `key_not_found`；429 `rate_limited`

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/routes/suggestions.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../app';
import { createMemoryRepo } from '../repo/memoryRepo';
import type { SuggestionRepo } from '../repo/types';
import { testEnv } from '../testEnv';

const MOD = { en: { a: 'Apple %s', b: 'Banana' }, zh: { a: '蘋果 %s' } };

function setup(over: Partial<AppDeps> & { repo?: SuggestionRepo } = {}) {
  const repo = over.repo ?? createMemoryRepo();
  const deps: AppDeps = {
    repo: () => repo,
    verifyTurnstile: vi.fn(async () => true),
    loadMod: vi.fn(async (_env, id: string) => (id === 'create' ? MOD : null)),
    now: () => new Date('2026-10-15T12:00:00.000Z'),
    ...over,
  };
  const app = createApp(deps);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://mlf.test', 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, testEnv({ DB: {} as D1Database }));
  return { post, deps, repo };
}

const valid = { modId: 'create', key: 'a', proposed: '蘋果（%s）', turnstileToken: 'tok' };

describe('POST /api/v1/suggestions', () => {
  it('stores a valid suggestion', async () => {
    const { post } = setup();
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { id: 1, formatWarning: false } });
  });

  it('flags format warnings', async () => {
    const res = await setup().post({ ...valid, proposed: '蘋果' });
    expect((await res.json()).data.formatWarning).toBe(true);
  });

  it('accepts suggestions for untranslated keys', async () => {
    expect((await setup().post({ ...valid, key: 'b', proposed: '香蕉' })).status).toBe(201);
  });

  it.each([
    [403, 'bad_origin', valid, { Origin: 'https://evil.test' }],
    [400, 'invalid_body', 'not json', {}],
    [400, 'invalid_body', { ...valid, modId: 'Bad Id' }, {}],
    [404, 'mod_not_found', { ...valid, modId: 'nope' }, {}],
    [404, 'key_not_found', { ...valid, key: 'constructor' }, {}],
    [400, 'unchanged', { ...valid, proposed: '蘋果 %s' }, {}],
    [400, 'empty', { ...valid, proposed: ' ' }, {}],
  ] as const)('returns %i %s', async (status, code, body, headers) => {
    const res = await setup().post(body, headers);
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it('rejects when Turnstile fails', async () => {
    const res = await setup({ verifyTurnstile: vi.fn(async () => false) }).post(valid);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('turnstile_failed');
  });

  it('rejects blocked subjects', async () => {
    const { hashIp } = await import('../ipHash');
    const blocked = `ip:${await hashIp('test-salt', '1.2.3.4')}`;
    const res = await setup({ repo: createMemoryRepo({ blocked: [blocked] }) }).post(valid);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('blocked');
  });

  it('rate limits after 30 per hour per subject', async () => {
    const { post } = setup();
    for (let i = 0; i < 30; i += 1) expect((await post({ ...valid, proposed: `蘋果${i} %s` })).status).toBe(201);
    const res = await post({ ...valid, proposed: '最後 %s' });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
  });

  it('works without CF-Connecting-IP', async () => {
    const res = await setup().post(valid, { 'CF-Connecting-IP': '' });
    expect(res.status).toBe(201);
  });

  it('overwrites the same author pending suggestion', async () => {
    const { post } = setup();
    const first = await (await post(valid)).json();
    const second = await (await post({ ...valid, proposed: '青蘋果 %s' })).json();
    expect(second.data.id).toBe(first.data.id);
  });
});
```

> `'CF-Connecting-IP': ''`：`Headers.get` 回傳 `''`，`clientIp` 應視空字串為缺少。Step 3 的 `clientIp` 調整為 `|| 'unknown'`，並在 Task 5 測試追加一行：`expect(clientIp(new Request('https://x', { headers: { 'CF-Connecting-IP': '' } }))).toBe('unknown')`。

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes`
Expected: FAIL（`AppDeps` 欄位不符／路由不存在）。

- [ ] **Step 3: 實作 modSource、路由、更新 app 與 index**

```ts
// apps/worker/src/modSource.ts
import type { Env } from './env';

export interface ModStrings {
  readonly en: Readonly<Record<string, unknown>>;
  readonly zh: Readonly<Record<string, unknown>>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 從靜態資產讀取 /api/v1/mods/<id>.json（單一真實來源：建置產物） */
export async function loadModFromAssets(env: Env, modId: string): Promise<ModStrings | null> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/api/v1/mods/${encodeURIComponent(modId)}.json`));
  if (!res.ok) return null;
  const body: unknown = await res.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.en_us) || !isRecord(body.zh_tw)) return null;
  return { en: body.en_us, zh: body.zh_tw };
}
```

```ts
// apps/worker/src/routes/suggestions.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { lookupEntry, SUGGESTION_LIMITS, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { Env } from '../env';
import { fail, ok } from '../http';
import { clientIp, hashIp } from '../ipHash';

const bodySchema = z.object({
  modId: z.string().regex(MOD_ID_PATTERN).max(64),
  key: z.string().min(1).max(256),
  proposed: z.string().max(SUGGESTION_LIMITS.maxChars * 2),
  note: z.string().max(SUGGESTION_LIMITS.maxNote * 2).optional(),
  turnstileToken: z.string().max(4096),
});

const REJECTION_MESSAGES = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

const HOUR_MS = 60 * 60 * 1000;

export function registerSuggestionRoutes(app: Hono<{ Bindings: Env }>, deps: AppDeps): void {
  app.post('/api/v1/suggestions', async (c) => {
    if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出建議。');
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
    const body = parsed.data;

    const ip = clientIp(c.req.raw);
    const subject = `ip:${await hashIp(c.env.IP_HASH_SALT, ip)}`;
    const repo = deps.repo(c.env);
    if (await repo.isBlocked([subject])) return fail(c, 403, 'blocked', '此來源已被停止投稿。');
    if (!(await deps.verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, ip))) {
      return fail(c, 403, 'turnstile_failed', '人機驗證未通過，請重新整理後再試。');
    }

    const mod = await deps.loadMod(c.env, body.modId);
    if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
    const entry = lookupEntry(mod.en, mod.zh, body.key);
    if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
    const verdict = validateSuggestion({ ...entry, proposed: body.proposed, note: body.note });
    if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);

    const now = deps.now();
    const since = new Date(now.getTime() - HOUR_MS).toISOString();
    if ((await repo.countRateEvents(subject, since)) >= SUGGESTION_LIMITS.perHour) {
      return fail(c, 429, 'rate_limited', '送出太頻繁了，請稍後再試。');
    }
    const stored = await repo.upsertPending({
      modId: body.modId, key: body.key, baseTarget: entry.current, proposed: body.proposed,
      note: body.note?.trim() || null, formatWarning: verdict.formatWarning,
      authorUserId: null, authorHash: subject.slice(3), createdAt: now.toISOString(),
    });
    await repo.recordRateEvent(subject, now.toISOString());
    return ok(c, { id: stored.id, formatWarning: verdict.formatWarning }, 201);
  });
}
```

> 確認 `@mlf/core/catalog` 已匯出 `MOD_ID_PATTERN`（`packages/core/src/catalog/index.ts`）；若未匯出則在該 index 加上 `export { MOD_ID_PATTERN } from './schema';`。注意 `MOD_ID_PATTERN` 允許 `.`／`..`，但 `loadMod` 會以 `encodeURIComponent` 組 URL 並回 404，不會路徑穿越。

`app.ts` 改為：

```ts
// apps/worker/src/app.ts
import { Hono } from 'hono';
import type { Env } from './env';
import { missingEnv } from './env';
import { fail } from './http';
import type { ModStrings } from './modSource';
import type { SuggestionRepo } from './repo/types';
import { registerSuggestionRoutes } from './routes/suggestions';

export interface AppDeps {
  readonly repo: (env: Env) => SuggestionRepo;
  readonly verifyTurnstile: (secret: string, token: string, ip: string) => Promise<boolean>;
  readonly loadMod: (env: Env, modId: string) => Promise<ModStrings | null>;
  readonly now: () => Date;
}

export function createApp(deps: AppDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/api/*', async (c, next) => {
    const missing = missingEnv(c.env);
    if (missing.length > 0) {
      console.error('missing env', missing);
      return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
    }
    await next();
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
import { createD1Repo } from './repo/d1Repo';
import { verifyTurnstile } from './turnstile';

export default createApp({
  repo: (env) => createD1Repo(env.DB),
  verifyTurnstile: (secret, token, ip) => verifyTurnstile(secret, token, ip),
  loadMod: loadModFromAssets,
  now: () => new Date(),
});
```

`app.test.ts` 的 `createApp({})` 改用與 `suggestions.test.ts` 相同的 `setup()` 依賴（抽成 `src/testDeps.ts` 匯出 `testDeps(over)`，並加入 coverage exclude）。另為 `loadModFromAssets` 加測試（同檔或 `modSource.test.ts`）：ASSETS 回 404 → `null`；回非物件 JSON → `null`；正常 → `{ en, zh }`。

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx vitest run --coverage && npx tsc --noEmit`
Expected: 全部 PASS；coverage ≥ 80%；typecheck 0 errors。

- [ ] **Step 5: Commit**

```bash
git add apps/worker packages/core/src/catalog/index.ts
git commit -m "feat(worker): add POST /api/v1/suggestions with validation, Turnstile and rate limit"
```

---

### Task 7: 網站 — 建議對話框、條目搜尋、Turnstile 與 CSP

**Files:**
- Create: `apps/site/src/islands/suggestApi.ts`、`apps/site/src/islands/TurnstileWidget.tsx`、`apps/site/src/islands/SuggestForm.tsx`、`apps/site/src/islands/SuggestDialog.tsx`
- Modify: `apps/site/src/pages/mods/[modId].astro`、`apps/site/src/i18n/zh-TW.ts`、`apps/site/src/lib/config.ts`、`apps/site/src/env.d.ts`、`apps/site/astro.config.mjs`、`apps/site/public/_headers`
- Test: `apps/site/src/islands/suggest.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/suggestions`（Task 6 契約）、`/api/v1/mods/<id>.json`（既有）、`validateSuggestion`（Task 1，前端預檢）。
- Produces:
  - `submitSuggestion(input: { modId; key; proposed; note?; turnstileToken }, fetchImpl?): Promise<{ ok: true; id: number; formatWarning: boolean } | { ok: false; code: string; message: string }>`
  - `TURNSTILE_SITE_KEY`：`import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'`（Cloudflare 官方「永遠通過」測試金鑰；正式部署必設）
  - 預覽表每列 `<button data-suggest-key={key}>`；`SuggestDialog` 以事件委派開啟。

- [ ] **Step 1: 寫失敗測試**

```tsx
// apps/site/src/islands/suggest.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuggestDialog from './SuggestDialog';
import { submitSuggestion } from './suggestApi';

vi.mock('./TurnstileWidget', () => ({
  default: ({ onToken }: { onToken: (t: string) => void }) => <button type="button" onClick={() => onToken('tok')}>通過驗證</button>,
}));

const modJson = { version: 1, meta: {}, en_us: { a: 'Apple %s', b: 'Banana' }, zh_tw: { a: '蘋果 %s' } };
const jsonRes = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('submitSuggestion', () => {
  it('maps success and error envelopes', async () => {
    const okFetch = vi.fn(async () => jsonRes({ ok: true, data: { id: 3, formatWarning: true } }, 201));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, okFetch as never))
      .toEqual({ ok: true, id: 3, formatWarning: true });
    const errFetch = vi.fn(async () => jsonRes({ ok: false, error: { code: 'rate_limited', message: '太頻繁' } }, 429));
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, errFetch as never))
      .toEqual({ ok: false, code: 'rate_limited', message: '太頻繁' });
    const netFetch = vi.fn(async () => { throw new Error('offline'); });
    expect(await submitSuggestion({ modId: 'm', key: 'a', proposed: 'x', turnstileToken: 't' }, netFetch as never))
      .toMatchObject({ ok: false, code: 'network' });
  });
});

describe('SuggestDialog', () => {
  function mount(fetchImpl = vi.fn(async (url: string) => (url.endsWith('.json') ? jsonRes(modJson) : jsonRes({ ok: true, data: { id: 1, formatWarning: false } }, 201)))) {
    document.body.innerHTML = '<button data-suggest-key="a">建議修改</button>';
    render(<SuggestDialog modId="m" fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  it('opens from a row button, submits after Turnstile, and confirms', async () => {
    const fetchImpl = mount();
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    expect(await screen.findByText('Apple %s')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果 %s');
    await userEvent.click(screen.getByText('通過驗證'));
    await userEvent.click(screen.getByRole('button', { name: '送出建議' }));
    expect(await screen.findByText(/感謝/)).toBeInTheDocument();
    const post = fetchImpl.mock.calls.find(([u]) => String(u).endsWith('/api/v1/suggestions'));
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toMatchObject({ modId: 'm', key: 'a', proposed: '紅蘋果 %s', turnstileToken: 'tok' });
  });

  it('warns about format codes before submitting', async () => {
    mount();
    await userEvent.click(screen.getByText('建議修改', { selector: 'button[data-suggest-key]' }));
    await userEvent.clear(await screen.findByLabelText('建議譯文'));
    await userEvent.type(screen.getByLabelText('建議譯文'), '紅蘋果');
    expect(screen.getByText(/格式碼/)).toBeInTheDocument();
  });

  it('searches all entries of the mod', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: '搜尋本模組所有條目' }));
    await userEvent.type(await screen.findByLabelText('搜尋條目'), 'banana');
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument());
    expect(screen.queryByText('Apple %s')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/islands/suggest.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作文案與設定**

`zh-TW.ts` 新增（與 `modPage` 同層）：

```ts
  suggest: {
    open: '建議修改',
    searchAll: '搜尋本模組所有條目',
    searchLabel: '搜尋條目',
    searchPlaceholder: '輸入原文、譯文或 key',
    title: '建議修改譯文',
    original: '原文',
    current: '目前譯文',
    proposed: '建議譯文',
    note: '備註（選填）',
    submit: '送出建議',
    submitting: '送出中…',
    needTurnstile: '請先完成人機驗證。',
    formatWarning: (parts: string) => `格式碼與原文不一致：${parts}。仍可送出，審核者會再確認。`,
    thanks: '感謝你的建議！審核通過後會出現在網站上。',
    close: '關閉',
    loadFailed: '載入譯文失敗，請稍後再試。',
    noMatch: '沒有符合的條目。',
  },
```

`config.ts` 加：

```ts
/** Cloudflare Turnstile site key；預設為官方測試金鑰（永遠通過），正式部署需以 PUBLIC_TURNSTILE_SITE_KEY 覆寫 */
export const TURNSTILE_SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';
```

`env.d.ts` 的 `ImportMetaEnv` 加 `readonly PUBLIC_TURNSTILE_SITE_KEY?: string;`。

- [ ] **Step 4: 實作 suggestApi 與 TurnstileWidget**

```ts
// apps/site/src/islands/suggestApi.ts
export interface SuggestionInput {
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly note?: string;
  readonly turnstileToken: string;
}

export type SubmitResult = { ok: true; id: number; formatWarning: boolean } | { ok: false; code: string; message: string };

const NETWORK_ERROR: SubmitResult = { ok: false, code: 'network', message: '連線失敗，請檢查網路後再試。' };

export async function submitSuggestion(input: SuggestionInput, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  try {
    const res = await fetchImpl('/api/v1/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { ok: boolean; data?: { id: number; formatWarning: boolean }; error?: { code: string; message: string } };
    if (body.ok && body.data) return { ok: true, id: body.data.id, formatWarning: body.data.formatWarning };
    return { ok: false, code: body.error?.code ?? 'unknown', message: body.error?.message ?? '送出失敗，請稍後再試。' };
  } catch {
    return NETWORK_ERROR;
  }
}
```

```tsx
// apps/site/src/islands/TurnstileWidget.tsx
import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../lib/config';

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: { sitekey: string; callback(token: string): void; 'expired-callback'(): void; language: string }): string; remove(id: string): void };
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
  return new Promise((resolve, reject) => {
    const el = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT_URL, async: true });
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error('turnstile load failed')), { once: true });
    if (!existing) document.head.append(el);
  });
}

export default function TurnstileWidget({ onToken }: { readonly onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: TURNSTILE_SITE_KEY, callback: onToken, 'expired-callback': () => onToken(''), language: 'zh-tw' });
    }, () => onToken(''));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken]);
  return <div ref={box} />;
}
```

- [ ] **Step 5: 實作 SuggestDialog（拆兩檔，各 < 200 行）**

```tsx
// apps/site/src/islands/SuggestForm.tsx
import { useCallback, useState } from 'react';
import { checkFormat } from '@mlf/core/validate';
import { validateSuggestion } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';
import { submitSuggestion } from './suggestApi';
import TurnstileWidget from './TurnstileWidget';

const REJECTION_TEXT = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

interface FormProps {
  readonly modId: string;
  readonly entryKey: string;
  readonly source: string;
  readonly current: string | null;
  readonly fetchImpl: typeof fetch;
}

function formatWarningText(source: string, proposed: string): string | null {
  const issue = checkFormat(source, proposed);
  if (!issue) return null;
  return [...issue.missing.map((x) => `缺少 ${x}`), ...issue.extra.map((x) => `多出 ${x}`)].join('、');
}

export default function SuggestForm({ modId, entryKey, source, current, fetchImpl }: FormProps) {
  const [proposed, setProposed] = useState(current ?? '');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const onToken = useCallback((tok: string) => setToken(tok), []);

  const verdict = validateSuggestion({ source, current, proposed, note });
  const warning = formatWarningText(source, proposed);

  const send = async () => {
    if (!verdict.ok) return;
    if (token === '') {
      setError(t.suggest.needTurnstile);
      return;
    }
    setPhase('sending');
    setError(null);
    const result = await submitSuggestion({ modId, key: entryKey, proposed, note: note || undefined, turnstileToken: token }, fetchImpl);
    if (result.ok) {
      setPhase('done');
    } else {
      setPhase('idle');
      setError(result.message);
    }
  };

  if (phase === 'done') return <p className="text-emerald-700 dark:text-emerald-300">{t.suggest.thanks}</p>;

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="text-xs text-slate-400"><code>{entryKey}</code></p>
      <div><div className="text-xs text-slate-500">{t.suggest.original}</div><div>{source}</div></div>
      <div><div className="text-xs text-slate-500">{t.suggest.current}</div><div>{current ?? t.modPage.untranslated}</div></div>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t.suggest.proposed}</span>
        <textarea className="input min-h-20" aria-label={t.suggest.proposed} value={proposed} onChange={(e) => setProposed(e.target.value)} />
      </label>
      {warning && <p className="text-xs text-amber-600">{t.suggest.formatWarning(warning)}</p>}
      {!verdict.ok && proposed !== (current ?? '') && <p className="text-xs text-red-600">{REJECTION_TEXT[verdict.reason]}</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span>{t.suggest.note}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <TurnstileWidget onToken={onToken} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={!verdict.ok || phase === 'sending'}>
        {phase === 'sending' ? t.suggest.submitting : t.suggest.submit}
      </button>
    </form>
  );
}
```

```tsx
// apps/site/src/islands/SuggestDialog.tsx
import { useEffect, useMemo, useState } from 'react';
import { lookupEntry } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';
import SuggestForm from './SuggestForm';

type Strings = Readonly<Record<string, string>>;
type Entries = { readonly en: Strings; readonly zh: Strings } | 'error' | null;

interface Props {
  readonly modId: string;
  readonly fetchImpl?: typeof fetch;
}

const SEARCH_LIMIT = 50;

function useModEntries(modId: string, enabled: boolean, fetchImpl: typeof fetch): Entries {
  const [state, setState] = useState<Entries>(null);
  useEffect(() => {
    if (!enabled || state !== null) return;
    fetchImpl(`/api/v1/mods/${encodeURIComponent(modId)}.json`)
      .then((r) => r.json() as Promise<{ en_us: Strings; zh_tw: Strings }>)
      .then((b) => setState({ en: b.en_us, zh: b.zh_tw }), () => setState('error'));
  }, [enabled, state, modId, fetchImpl]);
  return state;
}

function useRowButtons(onPick: (key: string) => void): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-suggest-key]');
      if (btn?.dataset.suggestKey) onPick(btn.dataset.suggestKey);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [onPick]);
}

function EntrySearch({ en, zh, onPick }: { readonly en: Strings; readonly zh: Strings; readonly onPick: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return Object.keys(en)
      .filter((k) => [k, en[k] ?? '', zh[k] ?? ''].some((s) => s.toLowerCase().includes(q)))
      .slice(0, SEARCH_LIMIT);
  }, [query, en, zh]);
  return (
    <div className="flex flex-col gap-2">
      <input className="input" aria-label={t.suggest.searchLabel} placeholder={t.suggest.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim() !== '' && hits.length === 0 && <p className="text-sm text-slate-500">{t.suggest.noMatch}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {hits.map((k) => (
          <li key={k}>
            <button type="button" className="w-full p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onPick(k)}>
              <div>{en[k]}</div>
              <div className="text-xs text-slate-500">{zh[k] ?? t.modPage.untranslated}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SuggestDialog({ modId, fetchImpl = fetch }: Props) {
  const [key, setKey] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const entries = useModEntries(modId, key !== null || searching, fetchImpl);
  useRowButtons(setKey);
  const open = key !== null || searching;
  const close = () => { setKey(null); setSearching(false); };
  const entry = key !== null && entries !== null && entries !== 'error' ? lookupEntry(entries.en, entries.zh, key) : null;

  return (
    <>
      <button type="button" className="btn mb-2 text-sm" onClick={() => setSearching(true)}>{t.suggest.searchAll}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t.suggest.title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{t.suggest.title}</h3>
              <button type="button" className="link text-sm" onClick={close}>{t.suggest.close}</button>
            </div>
            {entries === 'error' && <p role="alert" className="text-red-600">{t.suggest.loadFailed}</p>}
            {entries !== null && entries !== 'error' && key === null && <EntrySearch en={entries.en} zh={entries.zh} onPick={setKey} />}
            {entry && key !== null && (
              <SuggestForm key={key} modId={modId} entryKey={key} source={entry.source} current={entry.current} fetchImpl={fetchImpl} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

> 測試中 `screen.getByText('建議修改', { selector: 'button[data-suggest-key]' })` 點的是頁面上（`document.body`）的列按鈕；`render()` 會把元件掛到另一個容器，事件委派仍在 `document` 上，所以能接到。

- [ ] **Step 6: 模組頁掛載**

`[modId].astro`：

```astro
---
import SuggestDialog from '../../islands/SuggestDialog';
---
<!-- 譯文預覽 <h2> 下方 -->
<SuggestDialog client:idle modId={meta.modId} />
<!-- 每列 <td> 譯文欄尾端 -->
<button type="button" class="ml-2 text-xs link" data-suggest-key={key}>{t.suggest.open}</button>
```

同時移除 `githubEditUrl`／`githubIssueUrl` 兩個連結（規格 §8 步驟 7）；`lib/config.ts` 對應函式若無其他使用者即刪除，並刪除對應測試。

- [ ] **Step 7: CSP 放行 Turnstile**

`astro.config.mjs` 的 `security.csp`：

```js
csp: {
  scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'", 'https://challenges.cloudflare.com'] },
  styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
  directives: ["frame-src https://challenges.cloudflare.com"],
},
```

`_headers` 的 CSP：`script-src` 加 `https://challenges.cloudflare.com`，並新增 `frame-src https://challenges.cloudflare.com`。

> 確認 Astro 7 `csp.directives` 接受的格式（字串陣列）；若不支援 `frame-src`，改只在 `_headers` 設定（meta CSP 未列 frame-src 時以 header 為準）。以建置後 HTML 實際內容為準。

- [ ] **Step 8: 執行確認通過**

Run: `cd apps/site && npx vitest run && npx astro check && cd ../.. && npm run build`
Expected: site 測試全過（含新 4 個）；astro check 0 errors；build OK。

- [ ] **Step 9: Commit**

```bash
git add apps/site
git commit -m "feat(site): add suggestion dialog, entry search and Turnstile"
```

---

### Task 8: E2E 改跑 wrangler dev、CI 更新

**Files:**
- Modify: `playwright.config.ts`、`.github/workflows/ci.yml`、`package.json`（root scripts）、`README.md`
- Create: `e2e/suggest.spec.ts`、`.dev.vars.example`

**Interfaces:**
- Consumes: Task 3 的 `wrangler.jsonc`、Task 6 API、Task 7 UI。

- [ ] **Step 1: 寫失敗的 E2E**

```ts
// e2e/suggest.spec.ts
import { expect, test } from '@playwright/test';

test('anonymous visitor suggests a translation fix', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w"},remove(){}};',
    }));
  await page.goto('/mods/create/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await page.locator('[data-suggest-key]').first().click();
  const box = page.getByLabel('建議譯文');
  await box.fill(`${await box.inputValue()}（測試）`);
  await page.getByRole('button', { name: '送出建議' }).click();
  await expect(page.getByText(/感謝你的建議/)).toBeVisible();
});
```

> 本機 `.dev.vars` 的 `TURNSTILE_SECRET` 用 Cloudflare 官方測試密鑰 `1x0000000000000000000000000000000AA`（永遠通過，接受 dummy token）。這會讓 E2E 在送出時連到 Cloudflare siteverify；CI 有網路即可。若要完全離線，可另在 Worker 加 `TURNSTILE_VERIFY_URL` 變數（本計畫不做）。

- [ ] **Step 2: 執行確認失敗**

Run: `npx playwright test e2e/suggest.spec.ts`
Expected: FAIL（webServer 仍是 astro preview，`/api/v1/suggestions` 不存在）。

- [ ] **Step 3: 切換 webServer 並補設定**

```ts
// playwright.config.ts 的變更
const PORT = 8787;
// ...
webServer: {
  command: 'npx wrangler d1 migrations apply DB --local && npx wrangler dev --port 8787 --var SITE_URL:http://localhost:8787',
  url: `http://localhost:${PORT}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
},
```

```
# .dev.vars.example（複製為 .dev.vars；勿提交 .dev.vars）
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
IP_HASH_SALT=local-dev-salt
```

root `package.json` scripts 加：`"dev:worker": "wrangler dev"`、`"test:worker": "npm test -w @mlf/worker"`。

`ci.yml`：在 E2E 前加

```yaml
      - name: Worker typecheck and coverage
        run: npm run typecheck -w @mlf/worker && npm run test:coverage -w @mlf/worker
      - name: Prepare worker dev vars
        run: cp .dev.vars.example .dev.vars
```

README「開發」段落補：`cp .dev.vars.example .dev.vars`、`npm run build && npm run dev:worker`。

- [ ] **Step 4: 執行確認通過**

Run: `cp .dev.vars.example .dev.vars && npm run build && npx playwright test`
Expected: 原有 9 個＋新 1 個 E2E 全過（原測試的 baseURL 改為 8787 後仍需通過；`/pack/` 等頁面由 assets 提供）。

- [ ] **Step 5: 全套驗證與 Commit**

Run: `npm run lint && npm test && npm run test:coverage -w @mlf/core && npm run test:coverage -w @mlf/worker && npm run typecheck -w @mlf/site && npm run typecheck -w @mlf/worker`
Expected: 全部通過。

```bash
git add playwright.config.ts e2e .github package.json .dev.vars.example README.md
git commit -m "test: run e2e against wrangler dev and add suggestion flow"
```

---

### Task 9: 部署到 workers.dev（需使用者明確同意每一步）

**Files:**
- Modify: `wrangler.jsonc`（填入 `database_id`、`vars.SITE_URL`）

> 本 Task 每個步驟都會在使用者的 Cloudflare 帳號建立資源或部署。執行者必須先在對話中說明動作並取得同意；不得把任何 secret 寫入檔案或輸出。

- [ ] **Step 1: 建立 D1**：`npx wrangler d1 create modlangforge`（或 Cloudflare MCP），把回傳的 `database_id` 填入 `wrangler.jsonc`。
- [ ] **Step 2: 套用 migration**：`npx wrangler d1 migrations apply DB --remote`。Expected：0001 已套用。
- [ ] **Step 3: 建立 Turnstile widget**（Dashboard 或 API，網域含 workers.dev 與未來自訂網域），取得 site key 與 secret。
- [ ] **Step 4: 設定 secrets**：使用者自行執行 `npx wrangler secret put TURNSTILE_SECRET`、`npx wrangler secret put IP_HASH_SALT`（值用 `openssl rand -hex 32` 或等效產生）。
- [ ] **Step 5: 設定 SITE_URL 並部署**
  - [ ] 把 `wrangler.jsonc` 的 `vars.SITE_URL` 設為 workers.dev 網址（部署前必做；Worker 以它比對 Origin）。
  - [ ] 以旗標開啟建議功能建置並部署：`PUBLIC_SUGGEST_ENABLED=true PUBLIC_TURNSTILE_SITE_KEY=<site key> SITE_URL=<workers.dev 網址> npm run build && npx wrangler deploy`（缺少 site key 時 astro.config 會讓建置失敗）。
- [ ] **Step 6: 冒煙**：對 workers.dev 網址檢查首頁、模組頁、`/api/v1/index.json`、404、`robots.txt`；在瀏覽器實際送出一條建議，再以 `npx wrangler d1 execute DB --remote --command "SELECT id, mod_id, key, status FROM suggestions"` 確認寫入。Expected：皆正常；舊 pages.dev 不受影響。
  - [ ] 冒煙清單：以真實 Origin（= `SITE_URL`）POST `/api/v1/suggestions` → 201。
  - [ ] 以外來 Origin（例如 `https://evil.test`）POST → 403 `bad_origin`。
  - [ ] 模組頁的 Turnstile widget 正常渲染，瀏覽器 console 沒有 CSP 錯誤。
- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc
git commit -m "chore: configure production D1 and site URL for Worker"
```

Workers Builds 連 GitHub、自訂網域、Pages 轉址於 3C 處理；在那之前 workers.dev 為測試站，正式站仍是 pages.dev。

---

## 後續計畫

- **3B**：Discord／GitHub 登入（GitHub App 使用者授權）、簽章 cookie 與 CSRF token、角色、`/admin/` 審核、直接編輯、模組狀態、批次發佈（GitHub App installation token、Git Data API、衝突處理）。
- **3C**：`/me/` 個人資料（自填 Minecraft 名稱）、`/contributors/` 與個人頁、署名寫入 `mod.json`、自訂網域、Workers Builds、Pages 301 轉址、15,000 檔案數 CI 警告。
