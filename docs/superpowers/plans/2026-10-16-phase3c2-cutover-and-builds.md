# 第三階段 3C2：Workers Builds、網域切換與移除建議旗標 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 https://modlangforge.com 從 Cloudflare Pages 切到 Worker `modlangforge`（靜態資產＋API＋D1），以 Workers Builds 讓每次 push `main`（含站內發佈的 commit）自動套用 D1 migrations 並部署；移除 `PUBLIC_SUGGEST_ENABLED` 旗標與 GitHub 編輯／回報連結；CI 在 `dist` 檔案數超過 15,000 時警告；保留 www 與 pages.dev 轉址，並提供可在數分鐘內回到 Pages 的回退路徑。

**Architecture:** 兩段程式變更加上一連串需使用者同意的 Cloudflare 操作。程式部分：(1) CI 檔案數檢查（`@mlf/core/node` 的純函式＋腳本），可隨時合併；(2) 「切換」分支：移除旗標、GitHub 編輯／回報連結、`wrangler.jsonc` 的 `SITE_URL` 改為正式網域並關閉 workers.dev——**這個 PR 只在 Pages 停止自動部署之後才合併**。操作順序是：接上 Workers Builds（Worker 仍在 workers.dev）→ 停用 Pages 自動部署 → 合併切換 PR（Worker 以正式設定部署，但還沒有網域）→ 把自訂網域從 Pages 移到 Worker → 冒煙測試 → 把自訂網域寫進 `wrangler.jsonc`。

**Tech Stack:** Cloudflare Workers Builds、Workers Custom Domains、D1、wrangler 4.145.0、GitHub Actions、Astro 7、Vitest 5、Playwright。**不新增任何 npm 依賴、不新增 D1 migration。**

**Spec:** `docs/superpowers/specs/2026-10-15-phase3-community-review-design.md`

**前置計畫：** `docs/superpowers/plans/2026-10-16-phase3c1-profiles-and-contributors.md`（必須已合併到 `main`）。

## 範圍

規格 §5.3 步驟 7（push 觸發 Workers Builds）、§8 步驟 3（網域綁 Worker、`SITE_URL` 改新網域）、步驟 5（Workers Builds、build 前套用 D1 migrations）、步驟 6（Pages 收尾）、步驟 7（移除 GitHub 編輯／回報連結）、§1「repo 可維持私人；網站不再依賴 GitHub 編輯／回報連結」、§11 檔案數警告。**不在本計畫：** 3.1 Minecraft 伺服器驗證（§10）。

## 目前部署狀態（撰寫時）

| 項目 | 狀態 |
|---|---|
| 正式站 | https://modlangforge.com 由 Cloudflare **Pages** 專案 `modlangforge` 提供；git 自動部署（push `main`）；環境變數 `SITE_URL=https://modlangforge.com`、`NODE_VERSION=24`；建議旗標關閉 |
| www | `www.modlangforge.com` → apex 301（zone 的 dynamic redirect rule） |
| pages.dev | `modlangforge.pages.dev` → `modlangforge.com` 301（帳號 Bulk Redirect 清單 `pages_dev_redirects`） |
| Zone | `f75c6b6df98e100c58be1deff3852dd1`（網域在 Cloudflare Registrar） |
| Worker | `modlangforge`，https://modlangforge.jack3555tw.workers.dev，手動部署（建置時 `PUBLIC_SUGGEST_ENABLED=true`、`PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFXt3PiifcT-YOeA`、`SITE_URL=` workers.dev） |
| D1 | `modlangforge`（`fad76eba-4f80-4439-bf81-9eb1d2012870`），已套用 0001；3C 無新 migration |
| Secrets | 10 個（`TURNSTILE_SECRET`、`IP_HASH_SALT`、`SESSION_SECRET`、`DISCORD_CLIENT_ID/SECRET`、`GITHUB_APP_CLIENT_ID/SECRET`、`GITHUB_APP_ID`、`GITHUB_INSTALLATION_ID`、`GITHUB_APP_PRIVATE_KEY`） |
| 外部登記 | Turnstile 小工具網域已含 `modlangforge.com`；Discord 與 GitHub Login App 的 callback 已登記 workers.dev 與 `modlangforge.com` 兩組 |
| 帳號 | 管理員 MrPippi（user id 1）；首次正式發佈已完成（commit dbd59e1） |
| 方案 | Workers **Free**（每版本靜態資產 ≤ 20,000 檔） |
| 痛點 | 每次站內發佈後要手動重新部署 Worker（README 有註記），Workers Builds 後不再需要 |

## 切換順序與理由

```
Task 1  CI 檔案數檢查 PR（開好、CI 綠，先不合併）
Task 2  切換 PR（移除旗標＋SITE_URL=正式網域＋workers_dev=false；開好、CI 綠，先不合併）
Task 3  Worker 接上 Workers Builds → 合併 Task 1 PR 觸發第一次自動建置（Worker 仍在 workers.dev、旗標由建置變數開啟）
Task 4  備份 D1 書籤、停用 Pages 自動部署（Pages 停在目前這一版＝回退目標）
Task 5  合併切換 PR → Worker 以正式設定部署（此時沒有任何公開網址；正式站仍是 Pages，不受影響）
Task 6  移除 Pages 自訂網域 → 刪除殘留 CNAME → Worker 加自訂網域 → 冒煙；失敗即回退
Task 7  把自訂網域寫進 wrangler.jsonc、移除過時的建置變數、自動部署的發佈冒煙、Pages 收尾確認
```

- **為什麼先停 Pages 自動部署再合併切換 PR：** Pages 仍從 `main` 建置；旗標移除後的版本會在 Pages 上顯示需要 Worker API 的 UI。Task 2 讓「`SITE_URL` 為正式網址卻沒有 Turnstile key」成為建置錯誤（Pages 沒有這個變數），即使忘了停用也會建置失敗而不會上線；Task 4 再明確停用，雙重保險。
- **為什麼切換 PR 在網域移動之前合併：** 若先移網域，Worker 在正式網域上會短暫以 workers.dev 的 `SITE_URL` 運作（所有寫入 `bad_origin`、登入回 workers.dev）。先合併，Worker 一拿到網域就是正確設定；代價是 Task 5–6 之間 Worker 沒有公開網址（workers.dev 已關），對使用者無影響。
- **為什麼網域用 dashboard 加、事後才寫進設定：** 若在切換 PR 就寫 `routes`（custom_domain），Task 5 的部署會因網域仍掛在 Pages 而失敗。Task 6 用 dashboard 加，Task 7 再寫進 `wrangler.jsonc` 讓設定成為唯一來源。

## Pages 的最終狀態（規格 §8 步驟 6 的裁定）

規格原寫「Pages 專案改為僅含 `_redirects`、斷開 Git 自動部署」。現況下 pages.dev → 正式網域的 301 已由帳號 **Bulk Redirect** 在邊緣處理，請求根本不會到達 Pages 部署內容，所以不需要另做 `_redirects`-only 部署。最簡單且安全的終點是：

- **保留** Pages 專案 `modlangforge`（不刪除）：刪除會釋出 `modlangforge.pages.dev` 名稱，Bulk Redirect 失去對象，名稱也可能被他人註冊。
- **停用**自動部署（production 與 preview），停在切換前最後一版：這一版就是回退目標（旗標關閉、純靜態、可獨立運作）。
- 不移除 Pages 的 Git 連線（dashboard 無法把 Git 專案改成直接上傳；停用自動部署即可達到同樣效果，並保留日後一鍵回退時重新啟用的可能）。
- 回退窗口（建議 2 週）過後若確定不再需要，可再評估是否移除 Git 連線；本計畫不做。

## 設計決定（規格未明訂處）

| 情況 | 決定 |
|---|---|
| Workers Builds 的 build／deploy 指令 | Build：`npm ci && npm run build`；Deploy：`npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`（migration 失敗則不部署） |
| 非 production 分支建置 | 關閉（避免分支觸發 D1 migration 或耗用建置分鐘數） |
| 建置變數 | `NODE_VERSION=24`、`SITE_URL=https://modlangforge.com`、`PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFXt3PiifcT-YOeA`（公開值），切換前另加 `PUBLIC_SUGGEST_ENABLED=true`；**secrets 不放建置變數**，留在 Worker secrets |
| 執行期變數 | 一律寫在 `wrangler.jsonc` 的 `vars`；`wrangler deploy` 會以它覆蓋 dashboard 上的同名變數 |
| `workers.dev` | 切換 PR 起關閉：避免重複內容與 `SITE_URL` 不符造成的登入／寫入失敗；回退時以 revert 恢復 |
| GitHub「翻譯需求」連結（`githubRequestUrl`） | 保留（規格只要求移除「編輯／回報」連結；目前沒有站內替代管道）；若 repo 轉私人需另議，見決策紀錄 |
| 頁尾與「關於」的 GitHub repo 連結 | 保留（資訊性連結，非貢獻流程） |
| 檔案數檢查 | > 15,000 輸出 GitHub Actions `::warning::`；> 20,000 輸出 `::error::` 並使 CI 失敗（部署本來就會失敗，提早告知） |
| 自訂網域 | 只綁 apex `modlangforge.com`；www 維持 zone redirect rule，不綁到 Worker |

## Global Constraints

- 任何對 Cloudflare、GitHub 的設定變更、部署、合併到 `main`，都必須在對話中**逐步**取得使用者明確同意；執行者只說明與提供指令，不得自行點擊或代為合併。
- Secrets 由使用者自行輸入；不得要求使用者把值貼進對話，不得寫入檔案、建置變數或 log。
- 使用者的終端機是 Windows PowerShell 5.1：指令不用 `&&`（改用 `;` 與 `if ($?) { … }`）、不用 `<` 重導、不用 `VAR=x cmd` 前綴；`curl` 一律寫 `curl.exe`（5.1 的 `curl` 是 `Invoke-WebRequest` 別名）。Git Bash 寫法另註明，同一步驟不要混用。
- 不得刪除 Pages 專案；不得修改 www 的 DNS 記錄、zone redirect rule 或 Bulk Redirect 清單。
- `wrangler.jsonc` 的 `vars` 不得出現 `TEST_LOGIN_ENABLED`。
- 不新增 npm 依賴；不新增 migration。
- PR 描述依使用者慣例：繁體中文，只寫摘要與變更內容，不列測試、不附 session 連結。
- Commit 訊息結尾空一行後加：`Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX`

## Review Focus

1. **Pages 在旗標移除後又建置 `main`**（忘了停用、或日後有人重新啟用）：建置必須失敗而不是上線一個 API 全壞的網站 → Task 2 的 `turnstileConfigError` 測試＋Task 4 停用自動部署＋Task 5 檢查 Pages 沒有新部署。
2. **Worker 已用正式設定部署、網域還沒接上的空窗**：正式站（Pages）完全不受影響、workers.dev 不再提供網站 → Task 5 冒煙。
3. **非 `main` 分支觸發 D1 migration 或部署**：分支建置關閉 → Task 3 設定檢查。
4. **dashboard 加的自訂網域被之後的 `wrangler deploy` 拿掉**：Task 7 寫入 `routes` 並在下一次自動部署後確認網域仍為 Active。
5. **靜態資產數逼近 Free 方案上限**：CI 在 15,000 警告、20,000 失敗 → Task 1 測試門檻邊界。

---

## File Structure

```
packages/core/src/node/
  countFiles.ts          countFiles、distFileVerdict、DIST_FILE_LIMITS
  countFiles.test.ts
  index.ts               （修改）
scripts/check-dist-files.ts
package.json、.github/workflows/ci.yml、README.md（修改）
apps/site/src/
  lib/config.ts、lib/siteMeta.ts、lib/siteMeta.test.ts、env.d.ts（修改）
  components/Header.astro、pages/about.astro、pages/admin/index.astro、pages/me.astro、
  pages/contributors/index.astro、pages/contributors/profile.astro、pages/mods/[modId].astro（修改）
  admin/strings.ts、me/strings.ts、contributors/strings.ts、i18n/zh-TW.ts（修改）
wrangler.jsonc（修改：Task 2 SITE_URL／workers_dev；Task 7 routes）
```

---

### Task 0: 前置確認

- [ ] **Step 1:** Run: `git fetch origin; git log origin/main --oneline | head -15`；Expected：3C1 的 commit（`feat(site): contributor ranking and profile pages with mod page link` 等）已在 `main`。
- [ ] **Step 2:** Run: `npx wrangler whoami`；Expected：登入的是擁有 `modlangforge` Worker 與 zone 的帳號。
- [ ] **Step 3:** Run: `npx wrangler d1 migrations list DB --remote`；Expected：無待套用 migration。
- [ ] **Step 4:** Run: `npx wrangler secret list`；Expected：列出 10 個名稱（見「目前部署狀態」）。
- [ ] **Step 5:** Run: `curl.exe -sI https://modlangforge.com/`；Expected：`200`，回應標頭有 `cf-ray`；`curl.exe -s https://modlangforge.com/api/v1/me` 回 Pages 的 404 HTML（證明目前仍由 Pages 提供）。

---

### Task 1: CI — `dist` 檔案數警告（規格 §11）

**Files:**
- Create: `packages/core/src/node/countFiles.ts`、`packages/core/src/node/countFiles.test.ts`、`scripts/check-dist-files.ts`
- Modify: `packages/core/src/node/index.ts`、`package.json`、`.github/workflows/ci.yml`

**Interfaces:**
- Produces:

```ts
export const DIST_FILE_LIMITS = { warn: 15_000, max: 20_000 } as const;
export type DistLevel = 'ok' | 'warn' | 'error';
export interface DistVerdict { readonly level: DistLevel; readonly message: string }
countFiles(dir: string): Promise<number>
distFileVerdict(count: number, limits?: { readonly warn: number; readonly max: number }): DistVerdict
```

- [ ] **Step 1: 寫失敗測試**

```ts
// packages/core/src/node/countFiles.test.ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countFiles, DIST_FILE_LIMITS, distFileVerdict } from './countFiles';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-dist-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('countFiles', () => {
  it('counts files in nested folders but not the folders themselves', async () => {
    await mkdir(join(dir, 'mods', 'create'), { recursive: true });
    await writeFile(join(dir, 'index.html'), 'x');
    await writeFile(join(dir, '_headers'), 'x');
    await writeFile(join(dir, 'mods', 'create', 'index.html'), 'x');
    expect(await countFiles(dir)).toBe(3);
  });
});

describe('distFileVerdict', () => {
  it('is ok up to the warning threshold', () => {
    expect(distFileVerdict(DIST_FILE_LIMITS.warn).level).toBe('ok');
  });

  it('warns above 15,000 and errors above 20,000', () => {
    expect(distFileVerdict(DIST_FILE_LIMITS.warn + 1)).toEqual({
      level: 'warn',
      message: 'dist 有 15001 個檔案，已超過 15000（Workers 免費方案每版本上限 20000）；請規劃升級付費方案或減少檔案。',
    });
    expect(distFileVerdict(DIST_FILE_LIMITS.max).level).toBe('warn');
    expect(distFileVerdict(DIST_FILE_LIMITS.max + 1).level).toBe('error');
  });

  it('accepts custom limits', () => {
    expect(distFileVerdict(3, { warn: 2, max: 5 }).level).toBe('warn');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/node/countFiles.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/node/countFiles.ts
import { readdir } from 'node:fs/promises';

/** Workers 靜態資產：免費方案每版本 20,000 檔；超過 15,000 先警告（規格 §11） */
export const DIST_FILE_LIMITS = { warn: 15_000, max: 20_000 } as const;

export type DistLevel = 'ok' | 'warn' | 'error';

export interface DistVerdict {
  readonly level: DistLevel;
  readonly message: string;
}

/** 遞迴計算目錄內的檔案數（不含資料夾） */
export async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).length;
}

export function distFileVerdict(count: number, limits: { readonly warn: number; readonly max: number } = DIST_FILE_LIMITS): DistVerdict {
  if (count > limits.max) {
    return { level: 'error', message: `dist 有 ${count} 個檔案，超過 Workers 免費方案每版本 ${limits.max} 檔上限，部署會失敗。` };
  }
  if (count > limits.warn) {
    return { level: 'warn', message: `dist 有 ${count} 個檔案，已超過 ${limits.warn}（Workers 免費方案每版本上限 ${limits.max}）；請規劃升級付費方案或減少檔案。` };
  }
  return { level: 'ok', message: `dist 有 ${count} 個檔案（警告門檻 ${limits.warn}）。` };
}
```

`packages/core/src/node/index.ts` 追加：

```ts
export { countFiles, DIST_FILE_LIMITS, distFileVerdict, type DistLevel, type DistVerdict } from './countFiles';
```

```ts
// scripts/check-dist-files.ts
import { resolve } from 'node:path';
import { countFiles, distFileVerdict } from '@mlf/core/node';

const DIST_DIR = resolve(import.meta.dirname, '..', 'apps', 'site', 'dist');
const ANNOTATION = { ok: '', warn: '::warning title=dist file count::', error: '::error title=dist file count::' } as const;

async function main(): Promise<void> {
  const verdict = distFileVerdict(await countFiles(DIST_DIR));
  // GitHub Actions 會把 ::warning::／::error:: 顯示為註記；本機只是一般輸出
  console.log(`${ANNOTATION[verdict.level]}${verdict.message}`);
  if (verdict.level === 'error') process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('check-dist-files 執行失敗（請先 npm run build）', err);
  process.exitCode = 1;
});
```

`package.json` 的 `scripts` 加：

```json
    "check:dist": "tsx scripts/check-dist-files.ts",
```

`.github/workflows/ci.yml`：在 `Build site` 步驟之後加：

```yaml
      - name: Dist file count (warn > 15,000, fail > 20,000)
        run: npm run check:dist
```

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/node && cd ../.. && npm run lint && PUBLIC_SUGGEST_ENABLED=true npm run build && npm run check:dist`
Expected: 測試 PASS；最後一行印出 `dist 有 N 個檔案（警告門檻 15000）。`

- [ ] **Step 5: Commit 並開 PR（先不合併）**

```bash
git switch -c ci/dist-file-count origin/main
git add packages/core/src/node scripts/check-dist-files.ts package.json .github/workflows/ci.yml
git commit -m "ci: warn when the built site approaches the Workers asset limit

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

經使用者同意後 push 並開 PR（標題 `ci: dist 檔案數檢查`）。等 CI 綠燈，**不要合併**——Task 3 用它觸發第一次 Workers Builds。

---

### Task 2: 切換分支 — 移除旗標與 GitHub 編輯／回報連結、正式 `SITE_URL`、關閉 workers.dev

**Files:**
- Modify: `apps/site/src/lib/config.ts`、`apps/site/src/lib/siteMeta.ts`、`apps/site/src/lib/siteMeta.test.ts`、`apps/site/src/env.d.ts`、`apps/site/src/components/Header.astro`、`apps/site/src/pages/about.astro`、`apps/site/src/pages/admin/index.astro`、`apps/site/src/pages/me.astro`、`apps/site/src/pages/contributors/index.astro`、`apps/site/src/pages/contributors/profile.astro`、`apps/site/src/pages/mods/[modId].astro`、`apps/site/src/admin/strings.ts`、`apps/site/src/me/strings.ts`、`apps/site/src/contributors/strings.ts`、`apps/site/src/i18n/zh-TW.ts`、`.github/workflows/ci.yml`、`wrangler.jsonc`、`README.md`

**Interfaces:**
- Produces: `turnstileConfigError(env: { SITE_URL?: string; PUBLIC_TURNSTILE_SITE_KEY?: string }): string | null`（不再看旗標）。
- 移除：`SUGGEST_ENABLED`、`githubEditUrl`、`githubIssueUrl`、`DEFAULT_BRANCH`、`parseFlag`、`PUBLIC_SUGGEST_ENABLED`、`t.modPage.edit/report/contributeTitle`、各 `strings.ts` 的 `disabled`。

- [ ] **Step 1: 建立分支並寫失敗測試**

```bash
git switch -c feat/phase3c2-cutover origin/main
```

`apps/site/src/lib/siteMeta.test.ts`：

- 匯入行改為 `import { isSitemapPage, DEFAULT_REPO, resolveRepo, robotsTxt, turnstileConfigError } from './siteMeta';`
- 刪除整個 `describe('parseFlag', …)` 區塊。
- `describe('turnstileConfigError', …)` 整段改為：

```ts
describe('turnstileConfigError', () => {
  it('errors for a real site without a Turnstile key (so a stray Pages build fails instead of shipping)', () => {
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com' })).toMatch(/PUBLIC_TURNSTILE_SITE_KEY/);
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com', PUBLIC_TURNSTILE_SITE_KEY: '' })).toMatch(/PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it('allows a configured key, no SITE_URL, or localhost', () => {
    expect(turnstileConfigError({ SITE_URL: 'https://modlangforge.com', PUBLIC_TURNSTILE_SITE_KEY: '0x4AAA' })).toBeNull();
    expect(turnstileConfigError({})).toBeNull();
    expect(turnstileConfigError({ SITE_URL: 'http://localhost:8787' })).toBeNull();
    expect(turnstileConfigError({ SITE_URL: 'http://127.0.0.1:4321' })).toBeNull();
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/lib/siteMeta.test.ts`
Expected: FAIL（未設旗標時 `turnstileConfigError` 回 null）。

- [ ] **Step 3: 實作**

`apps/site/src/lib/siteMeta.ts`：刪除 `parseFlag` 函式；`turnstileConfigError` 改為：

```ts
/** 部署到非本機網址時必須設定 Turnstile site key；否則回傳錯誤訊息（astro.config 會因此中止建置） */
export function turnstileConfigError(env: {
  readonly SITE_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}): string | null {
  if (!env.SITE_URL || isLocalSite(env.SITE_URL)) return null;
  if (env.PUBLIC_TURNSTILE_SITE_KEY) return null;
  return 'SITE_URL 為正式網址時，必須設定 PUBLIC_TURNSTILE_SITE_KEY（Turnstile site key）。 / PUBLIC_TURNSTILE_SITE_KEY is required for a non-local SITE_URL.';
}
```

`apps/site/src/lib/config.ts`：

- 第一行改為 `import { resolveRepo } from './siteMeta';`
- 刪除 `export const DEFAULT_BRANCH = 'main';`
- 刪除 `SUGGEST_ENABLED` 與其註解。
- 刪除 `githubEditUrl`、`githubIssueUrl` 兩個函式（保留 `githubRequestUrl`）。

`apps/site/src/env.d.ts`：刪除 `PUBLIC_SUGGEST_ENABLED` 與其註解；`PUBLIC_REPO` 註解改為 `/** GitHub repo（owner/name），用於頁尾與翻譯需求連結 */`。

`apps/site/src/components/Header.astro`：

- 匯入改為 `import { SITE_SHORT_NAME } from '../lib/config';`
- `nav` 中 `...(SUGGEST_ENABLED ? [{ href: '/contributors/', label: t.nav.contributors }] : []),` 與上一行註解改為 `{ href: '/contributors/', label: t.nav.contributors },`
- `{SUGGEST_ENABLED && <AccountMenu client:idle />}` 改為 `<AccountMenu client:idle />`

`apps/site/src/pages/about.astro`：

- 匯入改為 `import { REPO, SITE_NAME, SITE_SHORT_NAME } from '../lib/config';`
- `{SUGGEST_ENABLED ? <p>…建議修改…</p> : <p>…在 GitHub 修正譯文…</p>}` 整段改為只留第一個段落：

```astro
        <p>所有譯文都存放在 <a class="link" href={repoUrl} rel="noopener noreferrer" target="_blank">GitHub<span class="sr-only">{t.common.newWindow}</span></a>。想修正譯文？在模組頁按譯文旁的「建議修改」（或「搜尋這個模組的所有文字」）並送出，維護者審核後會發布，網站隨即更新。登入後送出的建議會在 <a class="link" href="/contributors/">貢獻者</a> 頁署名。</p>
```

`apps/site/src/pages/admin/index.astro`：匯入改為 `import { SITE_SHORT_NAME } from '../../lib/config';`，內容改為 `<AdminApp client:only="react" />`。`apps/site/src/admin/strings.ts` 刪除 `disabled` 一行。

`apps/site/src/pages/me.astro`：匯入改為 `import { SITE_SHORT_NAME } from '../lib/config';`，內容改為 `<MeApp client:only="react" />`。`apps/site/src/me/strings.ts` 刪除 `disabled`。

`apps/site/src/pages/contributors/index.astro` 與 `profile.astro`：匯入改為 `import { SITE_SHORT_NAME } from '../../lib/config';`，內容分別改為 `<ContributorsList client:only="react" />`、`<ContributorProfile client:only="react" />`。`apps/site/src/contributors/strings.ts` 刪除 `disabled`。

`apps/site/src/pages/mods/[modId].astro`：

- 匯入改為 `import { contributorsUrl } from '../../lib/config';`
- `{SUGGEST_ENABLED && <SuggestDialog client:idle modId={meta.modId} />}` → `<SuggestDialog client:idle modId={meta.modId} />`
- 表格譯文格中 `{SUGGEST_ENABLED && <button type="button" class="link ml-2 text-xs" data-suggest-key={key} aria-label={t.suggest.openFor(key)}>{t.suggest.open}</button>}` → 去掉 `SUGGEST_ENABLED && ` 與外層大括號，直接放 `<button …>{t.suggest.open}</button>`
- `{SUGGEST_ENABLED && (<><dt class="text-muted">{t.modPage.community}</dt>…</>)}` → 去掉條件，直接放 `<dt class="text-muted">{t.modPage.community}</dt><dd><a class="link" href={contributorsUrl(meta.modId)}>{t.modPage.communityContributors}</a></dd>`
- 刪除整個 `{!SUGGEST_ENABLED && ( <section aria-labelledby="contribute-title"> … </section> )}` 區塊。

`apps/site/src/i18n/zh-TW.ts`：`modPage` 刪除 `contributeTitle`、`edit`、`report` 三個 key。

`.github/workflows/ci.yml`：`Build site` 步驟刪除

```yaml
        env:
          PUBLIC_SUGGEST_ENABLED: 'true'
```

`wrangler.jsonc`：

```jsonc
  // 正式網址（Origin 檢查、OAuth callback、Turnstile hostname 都以此為準）；本機 wrangler dev 由 .dev.vars 覆寫為 localhost
  "vars": {
    "SITE_URL": "https://modlangforge.com",
```

並把 `"workers_dev": true,` 改為 `"workers_dev": false,`（網站只由正式網域提供；回退時 revert 本 PR 即恢復）。

`README.md`：

- 「開發」區塊刪除 `PUBLIC_SUGGEST_ENABLED=true npm run build   # 建議功能開啟的建置；本機跑 E2E 前必須先這樣 build` 一行，並把 `npm run test:e2e` 那行註解開頭改為 `# 先 npm run build；`。
- 「部署」整節改為：

```markdown
## 部署

正式站 https://modlangforge.com 由 Cloudflare Worker `modlangforge`（靜態資產＋API＋D1）提供，以 **Workers Builds** 連接本 repo：push `main`（包含 `/admin/` 站內發佈產生的 commit）會自動建置、套用 D1 migrations 並部署，約 2–3 分鐘上線。

| Workers Builds 設定 | 值 |
|---|---|
| Production branch | `main`（非 production 分支不建置） |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
| 建置變數 | `NODE_VERSION=24`、`SITE_URL=https://modlangforge.com`、`PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key>` |

- 執行期變數（`SITE_URL`、`ADMIN_BOOTSTRAP`、`GITHUB_API_BASE`、`REPO`、`MOJANG_API_BASE`）寫在 `wrangler.jsonc`；秘密只存在 Worker secrets（`npx wrangler secret list`），不放進建置變數或版控。
- `SITE_URL` 為正式網址時必須設定 `PUBLIC_TURNSTILE_SITE_KEY`，否則建置失敗。`robots.txt` 與 sitemap 依 `SITE_URL` 產生；`PUBLIC_REPO` 指定 GitHub repo（預設 `MrPippi/ModLangForge`），用於頁尾與翻譯需求連結。
- `www.modlangforge.com` 由 zone 的 Redirect Rule 301 到主網域；`modlangforge.pages.dev` 由帳號 Bulk Redirect（清單 `pages_dev_redirects`）301 到主網域。舊 Pages 專案保留但已停用自動部署（保留 pages.dev 名稱與回退用的最後一版），請勿刪除。
- CI 在建置後統計 `apps/site/dist` 檔案數：超過 15,000 警告，超過 20,000（Workers 免費方案每版本上限）失敗。
- Workers Builds 故障時可手動部署：以上表建置變數執行 `npm run build`，再 `npx wrangler deploy`。
```

- [ ] **Step 4: 執行確認通過（不設旗標的建置也必須有建議功能）**

Run（Git Bash）：

```bash
npm run lint && npm test && npm run typecheck -w @mlf/site && \
  ! grep -rn "SUGGEST_ENABLED\|githubEditUrl\|githubIssueUrl\|parseFlag" apps/site/src .github && \
  npm run build && \
  grep -q 'href="/contributors/"' apps/site/dist/index.html && \
  grep -q 'data-suggest-key' apps/site/dist/mods/create/index.html && \
  ! grep -q 'github.com/MrPippi/ModLangForge/edit' apps/site/dist/mods/create/index.html && \
  echo "no-flag build OK" && \
  cp .dev.vars.example .dev.vars && npx playwright test && \
  (SITE_URL=https://modlangforge.com npm run build; test $? -ne 0 && echo "Pages-style build fails as intended")
```

Expected: 印出 `no-flag build OK`；E2E 全部通過（CI 已不設旗標）；最後一行印出 `Pages-style build fails as intended`（模擬 Pages：有正式 `SITE_URL`、沒有 Turnstile key）。最後再跑一次 `npm run build` 讓 `dist` 回到正常狀態。

- [ ] **Step 5: Commit 並開 PR（先不合併）**

```bash
git add apps/site .github/workflows/ci.yml wrangler.jsonc README.md
git commit -m "feat: serve the community features unconditionally from modlangforge.com

Remove the PUBLIC_SUGGEST_ENABLED flag and the GitHub edit/report links,
point SITE_URL at the custom domain and disable workers.dev. Merge only
after Pages automatic deployments are turned off (phase 3C2 Task 4).

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

經使用者同意後 push 並開 PR（標題 `feat: 切換到 modlangforge.com（移除建議旗標）`，描述第一行註明「**請勿在 3C2 Task 4 完成前合併**」）。等 CI 綠燈，**不要合併**。

---

### Task 3: Worker 接上 Workers Builds（每步需使用者明確同意）

**Files:** 無程式變更。

> 本 Task 會在使用者的 Cloudflare 帳號建立 Git 連線與建置設定；Step 5 會合併 Task 1 的 PR（push `main`，同時觸發 Pages 與 Workers Builds）。執行者逐步說明並等使用者同意。介面名稱若與下列略有不同，以同義欄位為準，並回報差異。

- [ ] **Step 1: 確認名稱一致** — `wrangler.jsonc` 的 `"name": "modlangforge"` 必須等於 dashboard 上 Worker 的名稱（Workers Builds 會檢查，不符會建置失敗）。

- [ ] **Step 2: 連接 GitHub**
  1. Cloudflare Dashboard → **Workers & Pages** → 點 Worker **`modlangforge`**（類型為 Worker，不是 Pages 專案）。
  2. **Settings** → **Build** → **Git repository** → **Connect**。
  3. 選 **GitHub** → 帳號 `MrPippi` → repo `ModLangForge`。若清單沒有此 repo：依畫面連到 GitHub 的「Cloudflare Workers and Pages」App 設定，在 **Repository access** 加入 `ModLangForge`（Pages 已在用同一個 App）。

- [ ] **Step 3: 建置設定**

  | 欄位 | 值 |
  |---|---|
  | Branch（production） | `main` |
  | Build command | `npm ci && npm run build` |
  | Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
  | Root directory | 留空（repo 根目錄，`wrangler.jsonc` 在此） |
  | Builds for non-production branches | **關閉** |
  | Build watch paths | 預設（全部） |

- [ ] **Step 4: 建置變數**（Settings → Build → **Variables and secrets**；這是「建置期」變數，與 Settings → Variables and Secrets 的執行期設定不同）

  | 名稱 | 值 | 類型 |
  |---|---|---|
  | `NODE_VERSION` | `24` | Text |
  | `SITE_URL` | `https://modlangforge.com` | Text |
  | `PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAAFXt3PiifcT-YOeA` | Text（公開值） |
  | `PUBLIC_SUGGEST_ENABLED` | `true` | Text（Task 7 移除） |

  - **不要**把任何 secret 加到這裡；10 個 secret 留在 Worker secrets，`wrangler deploy` 不會動到它們。
  - 建置期 `SITE_URL` 只影響 canonical、sitemap 與 Turnstile 檢查；執行期 `SITE_URL` 由 `wrangler.jsonc` 決定（目前仍是 workers.dev，Task 5 才改）。

- [ ] **Step 5: 觸發第一次建置（需同意合併 Task 1 PR）**
  1. 在 GitHub 合併 Task 1 的 PR（CI 綠燈）。這會 push `main`：Pages 會照常重建（旗標關閉，內容不變），Workers Builds 會第一次建置。
  2. Worker → **Deployments**（或 Builds）分頁開啟這次建置的 log，確認依序出現：`npm ci`、`astro build`、`pagefind`、`wrangler d1 migrations apply`（輸出 `No migrations to apply!`）、`wrangler deploy` 成功。
  3. 若 migration 步驟出現 `Authentication error [code: 10000]` 或權限不足：Settings → Build → **API token** 改用自建 token——My Profile → **API Tokens** → Create Token → 範本 **Edit Cloudflare Workers** → 再加 **Account → D1 → Edit** → 只限本帳號 → 建立後回到 Build 設定選用它，按 **Retry build**。

- [ ] **Step 6: 驗證 Worker 已由 Workers Builds 部署（PowerShell）**

```powershell
npx wrangler deployments list
curl.exe -s https://modlangforge.jack3555tw.workers.dev/api/v1/contributors
curl.exe -s https://modlangforge.jack3555tw.workers.dev/ | Select-String -SimpleMatch 'href="/contributors/"'
```

Expected：最新一筆部署的來源為 Workers Builds（或顯示由 Build 建立）；第二行回 `{"ok":true,"data":{"contributors":[...]}}`（3C1 的 API 已上線）；第三行有輸出（旗標由建置變數開啟）。

- [ ] **Step 7: 冒煙（workers.dev，仍為測試站）**
  - [ ] 以 GitHub（MrPippi）登入 → 帳號選單有「個人資料」「管理後台」。
  - [ ] `/me/` 改顯示名稱再改回；填 Minecraft 名稱（自己的或 `Steve`）→ 顯示頭像與「未驗證」。
  - [ ] `/contributors/` 顯示 MrPippi（首次發佈的署名）；點進個人頁有模組清單。
  - [ ] Workers Logs 無未預期錯誤。

- [ ] **回退：** Settings → Build → Git repository → **Disconnect**；Worker 維持最後一次部署，回到手動部署模式。

---

### Task 4: 切換前準備：D1 書籤、停用 Pages 自動部署（每步需使用者明確同意）

**Files:** 無程式變更。

- [ ] **Step 1: 記錄 D1 Time Travel 書籤（唯讀）**

```powershell
npx wrangler d1 time-travel info DB
```

把輸出的 bookmark 與時間記在使用者自己的筆記（不需寫入 repo）。若切換後需要還原資料：`npx wrangler d1 time-travel restore DB --bookmark=<bookmark>`（會覆寫目前資料，需使用者再次同意）。

- [ ] **Step 2（選用）: 匯出 D1 備份到 repo 之外**

```powershell
npx wrangler d1 export DB --remote --output "$env:USERPROFILE\mlf-d1-pre-cutover.sql"
```

匯出期間資料庫會短暫無法寫入（資料量小，通常數秒）。

- [ ] **Step 3: 停用 Pages 自動部署**
  1. Workers & Pages → Pages 專案 **`modlangforge`** → **Settings** → **Build**（舊介面為 Builds & deployments）→ **Branch control**。
  2. 取消勾選 **Enable automatic production branch deployments**；**Preview branch** 設為 **None**；**Save**。
  3. 在 **Deployments** 分頁記下目前 Production 部署的 id 與 commit（這就是回退目標）。
  4. 確認 **Custom domains** 分頁列有 `modlangforge.com`；若也列有 `www.modlangforge.com`，記下但**不要**動它。

- [ ] **Step 4: 記錄 DNS 現況**
  - Zone `modlangforge.com` → **DNS** → **Records**：記下 apex（`modlangforge.com` 或 `@`）的記錄（預期為 CNAME → `modlangforge.pages.dev`，Proxied）與 `www` 的記錄。不要修改。
  - **Rules** → **Redirect Rules**：確認 www → apex 規則啟用。
  - 帳號層 **Bulk Redirects**：確認清單 `pages_dev_redirects` 與其規則啟用。

- [ ] **Step 5: 確認外部登記（唯讀）**
  - Turnstile → 該小工具 → **Hostname management** 含 `modlangforge.com`。
  - Discord Developer Portal → OAuth2 → Redirects 含 `https://modlangforge.com/api/v1/auth/discord/callback`。
  - GitHub → Settings → Developer settings → GitHub Apps → **ModLangForge Login** → Callback URLs 含 `https://modlangforge.com/api/v1/auth/github/callback`。

- [ ] **Step 6: 選定切換時段** — Task 6 會有約 1–5 分鐘 apex 無法連線；建議台灣時間深夜。Task 5 與 Task 6 應在同一時段內連續完成。

---

### Task 5: 合併切換 PR（需使用者明確同意）

**Files:** 無新變更（合併 Task 2 的 PR）。

- [ ] **Step 1:** 確認 Task 4 Step 3 已完成（Pages 自動部署關閉）。在 GitHub 把 Task 2 的 PR 更新到最新 `main`（`Update branch`），等 CI 綠燈。
- [ ] **Step 2: 合併**（push `main` → 只有 Workers Builds 會建置）。
- [ ] **Step 3: 驗證建置與空窗狀態（PowerShell）**
  1. Worker → Deployments：這次建置成功（log 中 `astro build` 未因 Turnstile 檢查失敗，代表建置變數正確）。
  2. Pages → Deployments：**沒有**因這次 push 產生新部署。
  3. 正式站仍由 Pages 提供、且內容未變：

```powershell
curl.exe -sI https://modlangforge.com/
curl.exe -s https://modlangforge.com/api/v1/me
curl.exe -sI https://modlangforge.jack3555tw.workers.dev/
```

Expected：第一行 `200`；第二行仍是 Pages 的 404 HTML（不是 JSON）；第三行**不是** `200`（workers.dev 已關閉，Cloudflare 回 404 類錯誤頁）。

- [ ] **若 Step 3 第 2 點出現 Pages 新部署：** 立即在 Pages → Deployments 對 Task 4 記下的部署按 **Rollback to this deployment**，再回頭檢查 Task 4 Step 3 的設定。

---

### Task 6: 把 modlangforge.com 從 Pages 移到 Worker（每步需使用者明確同意；含回退）

**Files:** 無程式變更。

- [ ] **Step 1: 移除 Pages 自訂網域** — Pages 專案 `modlangforge` → **Custom domains** → `modlangforge.com` 右側 **⋯** → **Remove domain** → 確認。（`www` 若在清單中，保留。）
- [ ] **Step 2: 刪除殘留的 apex CNAME** — Zone → **DNS** → **Records**：若 `modlangforge.com` 仍有 CNAME → `modlangforge.pages.dev`，**Delete**。只刪 apex 這一筆，不動 `www` 與其他記錄。
- [ ] **Step 3: Worker 加自訂網域** — Worker `modlangforge` → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → 輸入 `modlangforge.com` → **Add domain**。等狀態由 Initializing 變為 **Active**（通常 1–2 分鐘；Cloudflare 會自動建立 DNS 記錄與憑證）。若出現「hostname 已有 DNS 記錄」錯誤，回 Step 2。
- [ ] **Step 4（選用）: 清除 zone 快取** — Zone → **Caching** → **Configuration** → **Purge Everything**（避免邊緣快取殘留 Pages 版 HTML）。
- [ ] **Step 5: 冒煙（PowerShell）**

```powershell
curl.exe -sI https://modlangforge.com/
curl.exe -s https://modlangforge.com/api/v1/me
curl.exe -s https://modlangforge.com/api/v1/contributors
curl.exe -sI https://modlangforge.com/contributors/1
curl.exe -sI https://www.modlangforge.com/mods/
curl.exe -sI https://modlangforge.pages.dev/mods/
curl.exe -s https://modlangforge.com/robots.txt
curl.exe -sI https://modlangforge.com/ | Select-String -SimpleMatch 'mc-heads.net'
```

Expected（依序）：
  1. `200`。
  2. JSON，含 `"ok":true` 與 `"csrfToken"`（證明由 Worker 提供）。
  3. JSON，`"ok":true`。
  4. `301`，`location: /contributors/1/`。
  5. `301`，`location: https://modlangforge.com/mods/`。
  6. `301`，`location: https://modlangforge.com/mods/`。
  7. 含 `Sitemap: https://modlangforge.com/sitemap-index.xml`。
  8. 有輸出（CSP 的 `img-src` 已放行頭像）。

- [ ] **Step 6: 瀏覽器冒煙（https://modlangforge.com）**
  - [ ] 首頁、模組目錄、搜尋、模組頁、合併資源包下載正常。
  - [ ] 模組頁有「建議修改」、沒有「在 GitHub 修正譯文」「回報問題」。
  - [ ] 未登入對一條譯文送建議（Turnstile 正常）→ 顯示感謝訊息。
  - [ ] 以 GitHub（MrPippi）登入、再以另一個 Discord 帳號登入 → 都回到 modlangforge.com，選單顯示名稱。
  - [ ] `/me/`、`/contributors/`、`/contributors/<MrPippi 的 id>/` 正常，頭像顯示。
  - [ ] `/admin/` 看得到剛才的測試建議 → **退回**它（避免發佈測試內容）。
  - [ ] Workers Logs：沒有 `bad_origin`、`misconfigured`、`unhandled`。

- [ ] **回退條件：** 接上網域 10 分鐘後 Step 5 的 1–3 仍失敗，或登入／送建議因設定問題 15 分鐘內無法修正。

- [ ] **回退步驟（需使用者同意）：**
  1. Worker → Settings → **Domains & Routes** → `modlangforge.com` → **Remove**（Cloudflare 會一併刪除它建立的 DNS 記錄）。
  2. Pages 專案 → **Custom domains** → **Set up a custom domain** → `modlangforge.com` → Continue → **Activate domain**（Cloudflare 會重建 CNAME → `modlangforge.pages.dev`）。等狀態 Active。
  3. 驗證：`curl.exe -sI https://modlangforge.com/` 為 `200`，`curl.exe -s https://modlangforge.com/api/v1/me` 為 Pages 的 404 HTML。此時 Pages 提供的是 Task 4 記下的最後一版（旗標關閉、純靜態，可獨立運作）。
  4. **不要**重新啟用 Pages 自動部署（`main` 已移除旗標，Pages 建置會因 Turnstile 檢查失敗）。
  5. 若要恢復 workers.dev 測試站：以新分支 `git revert -m 1 <切換 PR 的 merge commit>` → 開 PR → 經同意合併，Workers Builds 會以 workers.dev 設定重新部署。
  6. D1 資料不受影響（切換期間送出的建議仍在）；只有在資料損壞時才用 Task 4 的書籤還原。
  7. 找出原因後，從 Task 5 Step 3 重新開始。

---

### Task 7: 收尾 — 網域寫進設定、清理建置變數、自動部署的發佈冒煙（每步需使用者明確同意）

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: 把自訂網域寫進 `wrangler.jsonc`**（讓之後的 `wrangler deploy` 以設定為準，不會意外移除 dashboard 加的網域）

```bash
git switch -c chore/custom-domain-config origin/main
```

`wrangler.jsonc` 在 `"workers_dev": false,` 之前加：

```jsonc
  // 正式網域；3C2 Task 6 已在 dashboard 綁定，這裡讓部署以設定為準
  "routes": [{ "pattern": "modlangforge.com", "custom_domain": true }],
```

Run: `npx wrangler deploy --dry-run`；Expected：無錯誤（dry-run 不會改任何東西）。

```bash
git add wrangler.jsonc
git commit -m "chore: declare the modlangforge.com custom domain in wrangler config

Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX"
```

經同意 push、開 PR、CI 綠燈後經同意合併。合併後的自動部署完成時，確認 Worker → Domains & Routes 的 `modlangforge.com` 仍為 **Active**，且 `curl.exe -s https://modlangforge.com/api/v1/me` 仍為 JSON。

- [ ] **Step 2: 移除過時的建置變數** — Worker → Settings → Build → Variables and secrets → 刪除 `PUBLIC_SUGGEST_ENABLED`（程式已不讀取）。下一次建置時生效，不需立即重建。

- [ ] **Step 3: 發佈自動上線冒煙（會 push `main`，需使用者再次同意）**
  1. 選一條真實、無爭議的已核准（或先核准一條）建議，`/admin/` → 發佈 → 顯示 commit。
  2. GitHub `main` 出現由 ModLangForge Bot 建立的 commit；Worker → Deployments 隨即出現一次 Workers Builds 建置並成功。
  3. 約 2–3 分鐘後：

```powershell
curl.exe -s https://modlangforge.com/api/v1/mods/<modId>.json | Select-String -SimpleMatch '<新譯文的一小段>'
```

  Expected：有輸出（Worker 靜態資產已自動更新，**不再需要**手動 `wrangler deploy`）。
  4. 在網站上對同一句送出相同內容 → 回「與目前譯文相同」。

- [ ] **Step 4: Pages 收尾確認（唯讀）**
  - Pages 專案仍存在、自動部署為關閉、Custom domains 不含 apex。
  - `curl.exe -sI https://modlangforge.pages.dev/` 為 `301` 到 `https://modlangforge.com/`。

- [ ] **Step 5: 外部登記的後續（由使用者決定，建議 2 週回退窗口後再做）**
  - Discord Redirects、GitHub Login App Callback URLs 中的 workers.dev 網址可移除（保留不影響安全，但已無用途）。
  - Turnstile 小工具的 workers.dev hostname 可移除。
  - 本計畫不執行這些變更。

---

## 自我檢查（撰寫時已完成）

- 規格對照：§5.3 步驟 7（Task 3、Task 7 Step 3）；§8 步驟 3 網域綁 Worker、`SITE_URL`（Task 2、6）；步驟 5 Workers Builds＋build 前 migrations（Task 3，deploy command 先 migrations 再 deploy）；步驟 6 Pages 收尾（Task 4、7；裁定理由見「Pages 的最終狀態」）；步驟 7 移除 GitHub 編輯／回報連結（Task 2）；§1 repo 可私人、不依賴 GitHub 編輯／回報（Task 2；翻譯需求連結的保留列為使用者決定）；§11 檔案數警告（Task 1）；§3 secrets 只在 Worker secrets（Task 3 Step 4）。
- 回退：Task 3（斷開 Git）、Task 5（Pages rollback）、Task 6（網域移回 Pages＋revert）皆有明確步驟。
- 型別一致：`distFileVerdict`／`DIST_FILE_LIMITS`／`countFiles` 只在 Task 1 定義與使用；`turnstileConfigError` 新簽章在 `astro.config.mjs` 以 `process.env` 呼叫，相容（多餘欄位無妨）。
- Review Focus 每一項都有對應的測試或明確的檢查步驟（Task 2 Step 2/4、Task 5 Step 3、Task 3 Step 3、Task 7 Step 1、Task 1 測試）。
