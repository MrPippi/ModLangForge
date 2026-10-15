# 第三階段 3B2：站內審核、直接編輯與 GitHub App 批次發佈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 審核者在 `/admin/` 審核建議（依模組分組、比較同 key、核准／修改後核准／退回）、直接編輯整份譯文、標記模組狀態；管理員按一次「發佈」，Worker 以 GitHub App 讀取 repo、套用並偵測衝突、合併署名，產生**單一** fast-forward commit 到 `main`。

**Architecture:** 套用、衝突判定、勝出者挑選、署名合併、commit 訊息全是 `packages/core/src/review` 的純函式（輸入檔案文字、輸出檔案文字）。Worker 的 `runPublish` 只做 I/O：D1 取已核准建議 → GitHub Contents API 讀檔（固定 base SHA）→ core 產生計畫 → Git Data API 建 tree／commit → 非強制更新 ref，被拒則整個流程重試一次。GitHub 以 `GITHUB_API_BASE` 可替換；同一個假 GitHub（純 Request→Response 處理器）同時供單元測試與 E2E 的 node 伺服器使用。發佈期間以 `publish_batches` 中 `commit_sha IS NULL` 的列當鎖。

**Tech Stack:** Hono 4.13.12、zod 4、WebCrypto（RS256 JWT、PKCS#1→PKCS#8 轉換）、D1、React 18、`@tanstack/react-virtual`（沿用翻譯工具的 `TranslationTable`）、Vitest 5、Playwright、tsx。**不新增任何 npm 依賴。**

**Spec:** `docs/superpowers/specs/2026-10-15-phase3-community-review-design.md`

**前置計畫：** `docs/superpowers/plans/2026-10-16-phase3b1-auth-and-roles.md`（必須已完成並合併）。3B 與 3C 的切分見該檔「範圍」一節。

## 範圍

規格 §5.2（審核、直接編輯、模組狀態）、§5.3 步驟 1–6（發佈；步驟 7 的 Workers Builds 屬 3C）、§6 剩餘的 admin API 拒絕測試、§9 E2E（匿名建議 → 測試登入 → 核准 → 發佈 → 假 GitHub 收到預期 commit）、§8 步驟 4（建立 Discord 應用程式與 GitHub App、設定 secrets）與部署到 workers.dev。

## 目前部署狀態與發佈路徑

- 正式站 https://modlangforge.com 為 Cloudflare **Pages**，push `main` 自動重建；**發佈 commit 進 `main` 就會觸發 Pages 重建**，這是 3C 之前的上線路徑，屬預期行為。
- Worker 測試站 https://modlangforge.jack3555tw.workers.dev 為手動 `wrangler deploy`，其靜態資產（含 `/api/v1/mods/<id>.json`）**不會**因發佈自動更新。新建議的 `base_target` 取自 Worker 資產；資產過舊會讓之後的發佈出現「已被取代」或「衝突」。因此 3C 之前，**每次發佈後應重新 `npm run build && npx wrangler deploy`**（Task 11 的冒煙清單包含此步）。
- D1 `modlangforge`（`fad76eba-4f80-4439-bf81-9eb1d2012870`）已套用 0001；本計畫不需新 migration。

## 設計決定（規格未明訂處）

| 情況 | 決定 |
|---|---|
| 同一 key 有多條「已核准」（例如核准建議後又直接編輯） | 依 `reviewed_at`（同時再比 id）最晚者勝出，其餘標 `superseded` |
| repo 現值已等於建議內容 | 標 `superseded`（不算衝突、不寫入） |
| key 已從 repo 的 `en_us.json` 移除、或模組資料夾不存在 | 標 `conflict` |
| 直接編輯的署名 | `author_user_id` = 編輯者本人，`reviewer_id` = 本人；公開時列入貢獻者 |
| 模組狀態變更的模組在 repo 不存在 | 該變更保持未發佈（`batch_id` 為 NULL） |
| 只有衝突／取代、沒有可寫入檔案 | 不建 commit；更新建議狀態，回 `commitSha: null` |
| `updatedAt` 日期 | 以台灣時間（UTC+8）的發佈當日 |
| `translation.status` 為 `machine` 的模組套用建議 | 不自動變更狀態；只依明確的模組狀態變更寫入 |
| GitHub App 私鑰格式 | GitHub 下載的 PKCS#1 PEM 可直接 `wrangler secret put`；Worker 內轉為 PKCS#8 匯入 |
| 發佈鎖 | `publish_batches` 中 `commit_sha IS NULL` 且建立未滿 10 分鐘的列；完成時填入 sha，失敗時刪除 |

## Global Constraints

- 不新增 npm 依賴；JWT 以 `crypto.subtle`（`RSASSA-PKCS1-v1_5`、SHA-256）簽章；JWT `iat = now − 60s`、`exp = iat + 540s`、`iss = GITHUB_APP_ID`。
- GitHub 請求一律帶 `Accept`、`User-Agent: modlangforge`、`X-GitHub-Api-Version: 2022-11-28`；檔案以 `application/vnd.github.raw+json` 讀原文，`ref` 固定為該次嘗試的 base SHA。
- 只更新 `refs/heads/main`，`force: false`；被拒（422）時整個讀取→套用→commit 流程重試**一次**，仍被拒回 409 `main_moved`。
- 全有或全無：任何 GitHub 錯誤、資料驗證失敗或 main 前進兩次 → D1 不變（建議維持 `approved`）、不更新 ref。
- 輸出 `zh_tw.json`：依 repo `en_us.json` 原始 key 順序（含整數形式 key），以 `serializeLang(pairs, 'json')` 輸出；`mod.json`：`JSON.stringify(meta, null, 2) + '\n'`，保留原有欄位順序與 `sourceVersions` 等所有欄位；寫入前以 `validateModData` 驗證，有 `error` 級問題即中止。
- 署名：只收已登入、`public = 1`、未停權作者的 `display_name`；附加到 `translation.contributors` 尾端、去重、保留原順序。
- 權限：審核、直接編輯、模組狀態 = `review`（reviewer／admin）；發佈 = `publish`（admin）；使用者與封鎖 = `manage`（admin）。每支 admin 路由都必須在 `adminAccess.test.ts` 表格中。
- 所有寫入 API 沿用 3B1 的 `requireWrite`（Origin＋CSRF）；前端一律經 `apps/site/src/islands/api.ts`。
- 前端新元件只用語意 class（`text-muted`、`text-danger`、`text-warn`、`bg-surface`、`border-line` 等）；管理頁文案集中在 `apps/site/src/admin/strings.ts`。
- 任何對 Cloudflare／GitHub／Discord 帳號的建立、設定、部署，以及會 push `main` 的發佈，都需使用者在對話中逐步明確同意；secrets 由使用者自行 `wrangler secret put`，不得寫入檔案或輸出。
- 不可變資料；檔案 < 400 行；函式 < 50 行。
- Commit 訊息結尾空一行後加：`Claude-Session: https://claude.ai/code/session_01Mij6QbCw76DqArswXDvJnX`

## Review Focus

1. **同一 key 有多條已核准建議**（核准後又直接編輯、或兩位審核者先後核准）：只套用最晚核准者，其餘 `superseded`，`zh_tw.json` 只寫一次 → Task 1、Task 2 測試。
2. **repo 現值已等於建議內容**（上次發佈後 D1 更新失敗、或有人手動改了同一句）：應標 `superseded` 而不是 `conflict`，也不產生空 commit → Task 2、Task 6 測試。
3. **兩位管理員同時按「發佈」**：第二位得到 409 `publish_in_progress`，不會產生兩個 commit → Task 3、Task 6 測試。
4. **套用後資料不合法**（repo 中 `mod.json` 被手動改壞、`sourceVersions` 缺漏）：整批 422、不 push、建議仍為 `approved` → Task 2、Task 6 測試。
5. **key 為 `constructor`／`__proto__` 或整數形式**：直接編輯表格不得把原型屬性當成譯文；輸出的 `zh_tw.json` 不得重排整數 key → Task 2、Task 8 測試。

---

## File Structure

```
packages/core/src/review/
  publishTypes.ts          ApprovedChange、StatusChange、ModFiles、PublishPlan、PublishValidationError、MOD_STATUS_TARGETS
  contributors.ts          mergeContributors、taipeiDate
  commitMessage.ts         buildCommitMessage
  applyMod.ts              單一模組套用（衝突、順序、署名、驗證）
  planPublish.ts           pickWinners、planPublish
  publish.test.ts
  index.ts                 （修改）
apps/worker/src/
  repo/reviewTypes.ts、repo/d1Review.ts、repo/types.ts（修改）、repo/index.ts（修改）
  routes/rejections.ts     建議驗證錯誤訊息（自 suggestions.ts 抽出）
  routes/adminReview.ts    清單、核准、退回、直接編輯、模組狀態
  routes/adminPublish.ts   發佈摘要、發佈
  github/pem.ts、github/appJwt.ts、github/client.ts、github/fakeGithub.ts
  publish/runPublish.ts
  env.ts、testEnv.ts、app.ts（修改）
apps/site/src/admin/
  strings.ts、adminApi.ts、group.ts、modStrings.ts、testFetch.ts
  AdminApp.tsx、ReviewQueue.tsx、SuggestionCard.tsx、DirectEditor.tsx、PublishPanel.tsx、UsersPanel.tsx、BlocksPanel.tsx
  *.test.ts(x)
apps/site/src/pages/admin/index.astro、apps/site/src/lib/siteMeta.ts（修改）
e2e/fake-github.ts、e2e/prepare-dev-vars.ts、e2e/review-publish.spec.ts、playwright.config.ts
wrangler.jsonc、.dev.vars.example、README.md
```

---

### Task 0: 前置確認

- [ ] **Step 1:** Run: `git log origin/main --oneline | head -20`；Expected：3B1 的 commit（`feat: route auth, me and admin paths to the Worker and add login e2e` 等）已在 `main`。否則先完成 3B1。
- [ ] **Step 2:** Run: `npm ci && npm test && npm run test:coverage -w @mlf/worker && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`；Expected：全部通過，記下測試數。

---

### Task 1: core — 發佈型別、署名合併、台灣日期、commit 訊息、勝出者

**Files:**
- Create: `packages/core/src/review/publishTypes.ts`、`contributors.ts`、`commitMessage.ts`、`planPublish.ts`（本 Task 只放 `pickWinners`）
- Modify: `packages/core/src/review/index.ts`
- Test: `packages/core/src/review/publish.test.ts`

**Interfaces:**
- Produces:

```ts
export const MOD_STATUS_TARGETS = ['partial', 'reviewed'] as const;
export type ModStatusTarget = (typeof MOD_STATUS_TARGETS)[number];
export interface ApprovedChange { id: number; modId: string; key: string; baseTarget: string | null; proposed: string; reviewedAt: string; creditName: string | null }
export interface StatusChange { id: number; modId: string; status: ModStatusTarget; createdAt: string }
export interface ModFiles { en: string; zh: string; meta: string }
export type ChangeOutcome = 'applied' | 'conflict' | 'superseded';
export interface ChangeResult { id: number; outcome: ChangeOutcome }
export interface PublishFile { path: string; content: string }
export interface PublishPlan { files: readonly PublishFile[]; results: readonly ChangeResult[]; appliedStatusChangeIds: readonly number[]; message: string }
export class PublishValidationError extends Error { readonly modId: string; readonly issues: readonly string[] }
mergeContributors(existing: readonly string[], incoming: readonly (string | null)[]): string[]
taipeiDate(now: Date): string   // YYYY-MM-DD，UTC+8
buildCommitMessage(s: { perMod: readonly { modId: string; count: number }[]; statuses: readonly { modId: string; status: string }[]; contributors: readonly string[] }): string
pickWinners(changes: readonly ApprovedChange[]): { winners: ApprovedChange[]; superseded: number[] }
```

- [ ] **Step 1: 寫失敗測試**

```ts
// packages/core/src/review/publish.test.ts
import { describe, expect, it } from 'vitest';
import { buildCommitMessage, mergeContributors, pickWinners, taipeiDate, type ApprovedChange } from './index';

const change = (over: Partial<ApprovedChange> = {}): ApprovedChange => ({
  id: 1, modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', reviewedAt: '2026-10-15T00:00:00.000Z', creditName: null, ...over,
});

describe('mergeContributors', () => {
  it('appends new names in order, dedupes and skips blanks', () => {
    expect(mergeContributors(['原譯者', 'Alice'], ['Bob', null, 'Alice', ' ', 'Bob', ' Carol '])).toEqual(['原譯者', 'Alice', 'Bob', 'Carol']);
  });

  it('returns a copy when nothing is added', () => {
    const existing = ['A'];
    const merged = mergeContributors(existing, []);
    expect(merged).toEqual(['A']);
    expect(merged).not.toBe(existing);
  });
});

describe('taipeiDate', () => {
  it('uses UTC+8', () => {
    expect(taipeiDate(new Date('2026-10-15T15:59:59.000Z'))).toBe('2026-10-15');
    expect(taipeiDate(new Date('2026-10-15T16:00:00.000Z'))).toBe('2026-10-16');
  });
});

describe('buildCommitMessage', () => {
  it('lists counts, mods, statuses and contributors', () => {
    expect(buildCommitMessage({
      perMod: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
      statuses: [{ modId: 'create', status: 'reviewed' }],
      contributors: ['Alice', 'Bob'],
    })).toBe([
      'chore(data): publish 3 reviewed translations',
      '',
      'Mods: create (2), jei (1)',
      'Status: create -> reviewed',
      'Contributors: Alice, Bob',
      '',
      'Published from the ModLangForge review queue.',
    ].join('\n'));
  });

  it('uses a status-only title and singular wording', () => {
    expect(buildCommitMessage({ perMod: [], statuses: [{ modId: 'jei', status: 'partial' }], contributors: [] }).split('\n')[0])
      .toBe('chore(data): update translation status');
    expect(buildCommitMessage({ perMod: [{ modId: 'jei', count: 1 }], statuses: [], contributors: [] }).split('\n')[0])
      .toBe('chore(data): publish 1 reviewed translation');
  });
});

describe('pickWinners', () => {
  it('keeps the latest approval per mod/key and supersedes the rest', () => {
    const result = pickWinners([
      change({ id: 1, reviewedAt: '2026-10-15T02:00:00.000Z' }),
      change({ id: 2, reviewedAt: '2026-10-15T01:00:00.000Z' }),
      change({ id: 3, key: 'b' }),
      change({ id: 4, modId: 'jei' }),
    ]);
    expect(result.winners.map((c) => c.id)).toEqual([1, 3, 4]);
    expect(result.superseded).toEqual([2]);
  });

  it('breaks reviewedAt ties by the higher id', () => {
    expect(pickWinners([change({ id: 5 }), change({ id: 6 })]).winners.map((c) => c.id)).toEqual([6]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/review/publish.test.ts`
Expected: FAIL（未匯出）。

- [ ] **Step 3: 實作**

```ts
// packages/core/src/review/publishTypes.ts
export const MOD_STATUS_TARGETS = ['partial', 'reviewed'] as const;
export type ModStatusTarget = (typeof MOD_STATUS_TARGETS)[number];

/** 已核准、待發佈的變更；creditName 只在作者已登入、公開且未停權時有值 */
export interface ApprovedChange {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly reviewedAt: string;
  readonly creditName: string | null;
}

export interface StatusChange {
  readonly id: number;
  readonly modId: string;
  readonly status: ModStatusTarget;
  readonly createdAt: string;
}

/** repo 中 data/mods/<id>/ 三個檔案的原文 */
export interface ModFiles {
  readonly en: string;
  readonly zh: string;
  readonly meta: string;
}

export type ChangeOutcome = 'applied' | 'conflict' | 'superseded';

export interface ChangeResult {
  readonly id: number;
  readonly outcome: ChangeOutcome;
}

export interface PublishFile {
  readonly path: string;
  readonly content: string;
}

export interface PublishPlan {
  readonly files: readonly PublishFile[];
  readonly results: readonly ChangeResult[];
  readonly appliedStatusChangeIds: readonly number[];
  readonly message: string;
}

/** 套用後資料不合法；整批發佈必須中止 */
export class PublishValidationError extends Error {
  constructor(readonly modId: string, readonly issues: readonly string[]) {
    super(`publish validation failed for ${modId}`);
    this.name = 'PublishValidationError';
  }
}
```

```ts
// packages/core/src/review/contributors.ts
/** 附加新名字到尾端：去除前後空白、去重、略過空值，保留既有順序 */
export function mergeContributors(existing: readonly string[], incoming: readonly (string | null)[]): string[] {
  return incoming.reduce<string[]>((acc, raw) => {
    const name = raw?.trim() ?? '';
    return name === '' || acc.includes(name) ? acc : [...acc, name];
  }, [...existing]);
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 台灣日期（UTC+8，無日光節約） */
export function taipeiDate(now: Date): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}
```

```ts
// packages/core/src/review/commitMessage.ts
export interface CommitSummary {
  readonly perMod: readonly { readonly modId: string; readonly count: number }[];
  readonly statuses: readonly { readonly modId: string; readonly status: string }[];
  readonly contributors: readonly string[];
}

export function buildCommitMessage(s: CommitSummary): string {
  const total = s.perMod.reduce((n, m) => n + m.count, 0);
  const title = total > 0
    ? `chore(data): publish ${total} reviewed translation${total === 1 ? '' : 's'}`
    : 'chore(data): update translation status';
  const lines = [
    ...(s.perMod.length > 0 ? [`Mods: ${s.perMod.map((m) => `${m.modId} (${m.count})`).join(', ')}`] : []),
    ...(s.statuses.length > 0 ? [`Status: ${s.statuses.map((m) => `${m.modId} -> ${m.status}`).join(', ')}`] : []),
    ...(s.contributors.length > 0 ? [`Contributors: ${s.contributors.join(', ')}`] : []),
  ];
  return [title, '', ...lines, '', 'Published from the ModLangForge review queue.'].join('\n');
}
```

```ts
// packages/core/src/review/planPublish.ts
import type { ApprovedChange } from './publishTypes';

const changeKey = (c: ApprovedChange): string => `${c.modId}\u0000${c.key}`;

/** 同一 mod/key 只保留最晚核准者（reviewedAt，再比 id） */
export function pickWinners(changes: readonly ApprovedChange[]): { winners: ApprovedChange[]; superseded: number[] } {
  const sorted = [...changes].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id - b.id);
  const latest = new Map(sorted.map((c) => [changeKey(c), c] as const));
  const winners = [...latest.values()].sort((a, b) => a.id - b.id);
  const winnerIds = new Set(winners.map((w) => w.id));
  return { winners, superseded: changes.filter((c) => !winnerIds.has(c.id)).map((c) => c.id) };
}
```

`index.ts` 追加：

```ts
export * from './publishTypes';
export { mergeContributors, taipeiDate } from './contributors';
export { buildCommitMessage, type CommitSummary } from './commitMessage';
export { pickWinners } from './planPublish';
```

（`new Map(entries)` 中後出現的 key 覆蓋先前者，因此排序後最後一筆即勝出者。）

- [ ] **Step 4: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): add publish types, contributor merge, commit message and winner selection"
```

---

### Task 2: core — 單一模組套用與發佈計畫

**Files:**
- Create: `packages/core/src/review/applyMod.ts`
- Modify: `packages/core/src/review/planPublish.ts`、`packages/core/src/review/index.ts`
- Test: `packages/core/src/review/publish.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1；`parseJsonLang`、`serializeLang`（`../lang`）、`validateModData`（`../catalog`）。
- Produces:
  - `applyToMod(input: { modId: string; files: ModFiles; changes: readonly ApprovedChange[]; status: StatusChange | null; today: string }): { files: PublishFile[]; results: ChangeResult[]; appliedCount: number; credits: (string | null)[] }` — `changes` 必須已是勝出者
  - `planPublish(input: { mods: Readonly<Record<string, ModFiles | null>>; changes: readonly ApprovedChange[]; statusChanges: readonly StatusChange[]; today: string }): PublishPlan`
  - 檔案路徑：`data/mods/<modId>/zh_tw.json`、`data/mods/<modId>/mod.json`

- [ ] **Step 1: 追加失敗測試**

```ts
// 追加到 publish.test.ts
import { applyToMod, planPublish, PublishValidationError, type ModFiles, type StatusChange } from './index';

const META = {
  modId: 'create', name: 'Create', aliases: [], summary: '機械動力。', authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  sourceVersions: [{ modVersion: '6.0.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] }],
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: ['原譯者'] },
  updatedAt: '2026-10-01',
};

const files = (over: Partial<ModFiles> = {}): ModFiles => ({
  en: '{\n  "b": "Banana",\n  "10": "Ten",\n  "a": "Apple",\n  "old": "Old"\n}\n',
  zh: '{\n  "b": "香蕉",\n  "a": "蘋果"\n}\n',
  meta: `${JSON.stringify(META, null, 2)}\n`,
  ...over,
});

const TODAY = '2026-10-16';
const status = (over: Partial<StatusChange> = {}): StatusChange => ({ id: 1, modId: 'create', status: 'reviewed', createdAt: '2026-10-15T00:00:00.000Z', ...over });
const byPath = (out: { files: readonly { path: string; content: string }[] }, name: string) => out.files.find((f) => f.path === `data/mods/create/${name}`)?.content;

describe('applyToMod', () => {
  it('applies a matching change in en_us key order, keeping integer keys in place', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: '10', baseTarget: null, proposed: '十' }), change({ id: 2, key: 'a', proposed: '紅蘋果', creditName: 'Alice' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'applied' }, { id: 2, outcome: 'applied' }]);
    expect(byPath(out, 'zh_tw.json')).toBe('{\n  "b": "香蕉",\n  "10": "十",\n  "a": "紅蘋果"\n}\n');
    const meta = JSON.parse(byPath(out, 'mod.json') ?? '{}');
    expect(meta.translation.contributors).toEqual(['原譯者', 'Alice']);
    expect(meta.translation.status).toBe('machine');
    expect(meta.updatedAt).toBe(TODAY);
    expect(meta.sourceVersions).toEqual(META.sourceVersions);
    expect(Object.keys(meta)).toEqual(Object.keys(META));
  });

  it('marks a conflict when the repo value differs from base_target', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: 'a', baseTarget: '舊蘋果' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'conflict' }]);
    expect(out.files).toEqual([]);
  });

  it('marks superseded when the repo already holds the proposal', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: 'a', baseTarget: '舊', proposed: '蘋果' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'superseded' }]);
    expect(out.files).toEqual([]);
  });

  it.each(['gone', 'constructor', '__proto__'])('marks a conflict when key %s is not in en_us', (key) => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key, baseTarget: null })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'conflict' }]);
  });

  it('writes only mod.json for a status-only change', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [], status: status(), today: TODAY });
    expect(out.files.map((f) => f.path)).toEqual(['data/mods/create/mod.json']);
    const meta = JSON.parse(byPath(out, 'mod.json') ?? '{}');
    expect(meta.translation.status).toBe('reviewed');
    expect(meta.translation.contributors).toEqual(['原譯者']);
  });

  it('throws PublishValidationError when the result is invalid', () => {
    const broken = files({ meta: JSON.stringify({ ...META, sourceVersions: [] }) });
    expect(() => applyToMod({ modId: 'create', files: broken, changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
  });

  it('throws PublishValidationError for unparsable repo files', () => {
    expect(() => applyToMod({ modId: 'create', files: files({ zh: '{oops' }), changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
    expect(() => applyToMod({ modId: 'create', files: files({ meta: '[]' }), changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
  });
});

describe('planPublish', () => {
  it('combines winners, superseded duplicates, missing mods, statuses and the message', () => {
    const plan = planPublish({
      mods: { create: files(), ghost: null },
      changes: [
        change({ id: 1, key: 'a', proposed: '青蘋果', reviewedAt: '2026-10-15T01:00:00.000Z', creditName: 'Bob' }),
        change({ id: 2, key: 'a', proposed: '紅蘋果', reviewedAt: '2026-10-15T02:00:00.000Z', creditName: 'Alice' }),
        change({ id: 3, modId: 'ghost', key: 'x' }),
      ],
      statusChanges: [status({ id: 7 }), status({ id: 8, status: 'partial', createdAt: '2026-10-15T05:00:00.000Z' }), status({ id: 9, modId: 'ghost' })],
      today: TODAY,
    });
    expect(plan.results).toEqual(expect.arrayContaining([{ id: 1, outcome: 'superseded' }, { id: 2, outcome: 'applied' }, { id: 3, outcome: 'conflict' }]));
    expect(plan.results).toHaveLength(3);
    expect(plan.appliedStatusChangeIds).toEqual([7, 8]);
    expect(plan.files.map((f) => f.path)).toEqual(['data/mods/create/zh_tw.json', 'data/mods/create/mod.json']);
    expect(JSON.parse(plan.files[1]?.content ?? '{}').translation.status).toBe('partial');
    expect(plan.message).toContain('Mods: create (1)');
    expect(plan.message).toContain('Status: create -> partial');
    expect(plan.message).toContain('Contributors: Alice');
  });

  it('produces no files when nothing applies', () => {
    const plan = planPublish({ mods: { create: files() }, changes: [change({ key: 'a', baseTarget: 'x' })], statusChanges: [], today: TODAY });
    expect(plan.files).toEqual([]);
    expect(plan.results).toEqual([{ id: 1, outcome: 'conflict' }]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd packages/core && npx vitest run src/review/publish.test.ts`
Expected: FAIL（`applyToMod` 未匯出）。

- [ ] **Step 3: 實作 applyMod**

```ts
// packages/core/src/review/applyMod.ts
import { validateModData } from '../catalog/validateMod';
import { parseJsonLang } from '../lang/parseJson';
import { serializeLang } from '../lang/serialize';
import type { ParsedLang } from '../lang/types';
import { mergeContributors } from './contributors';
import { PublishValidationError, type ApprovedChange, type ChangeOutcome, type ChangeResult, type ModFiles, type PublishFile, type StatusChange } from './publishTypes';

export interface ModApplyInput {
  readonly modId: string;
  readonly files: ModFiles;
  /** 已經 pickWinners 篩選過 */
  readonly changes: readonly ApprovedChange[];
  readonly status: StatusChange | null;
  readonly today: string;
}

export interface ModApplyResult {
  readonly files: PublishFile[];
  readonly results: ChangeResult[];
  readonly appliedCount: number;
  readonly credits: (string | null)[];
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const ownString = (rec: Readonly<Record<string, string>>, key: string): string | null => (Object.hasOwn(rec, key) ? rec[key] ?? null : null);

function parseFiles(modId: string, files: ModFiles): { en: ParsedLang; zh: ParsedLang; meta: Json } {
  try {
    const meta: unknown = JSON.parse(files.meta);
    if (!isRecord(meta)) throw new Error('mod.json 頂層必須是物件');
    return { en: parseJsonLang(files.en), zh: parseJsonLang(files.zh), meta };
  } catch (err) {
    throw new PublishValidationError(modId, [err instanceof Error ? err.message : String(err)]);
  }
}

function outcomeFor(c: ApprovedChange, en: ParsedLang, zh: ParsedLang): ChangeOutcome {
  if (ownString(en.entries, c.key) === null) return 'conflict';
  const current = ownString(zh.entries, c.key);
  if (current === c.proposed) return 'superseded';
  return current === c.baseTarget ? 'applied' : 'conflict';
}

/** 依 en_us 原始順序輸出；不在 en_us 的既有 key 依原順序附在最後 */
function buildZh(en: ParsedLang, zh: ParsedLang, overrides: ReadonlyMap<string, string>): string {
  const enKeys = new Set(en.order);
  const valueOf = (k: string): string => overrides.get(k) ?? ownString(zh.entries, k) ?? '';
  const ordered = en.order.filter((k) => overrides.has(k) || ownString(zh.entries, k) !== null).map((k) => [k, valueOf(k)] as const);
  const extras = zh.order.filter((k) => !enKeys.has(k)).map((k) => [k, valueOf(k)] as const);
  return serializeLang([...ordered, ...extras], 'json');
}

function updateMeta(meta: Json, credits: readonly (string | null)[], status: StatusChange | null, today: string): Json {
  const translation = isRecord(meta.translation) ? meta.translation : {};
  const existing = Array.isArray(translation.contributors) ? translation.contributors.filter((x): x is string => typeof x === 'string') : [];
  return {
    ...meta,
    translation: { ...translation, ...(status ? { status: status.status } : {}), contributors: mergeContributors(existing, credits) },
    updatedAt: today,
  };
}

function assertValid(modId: string, meta: Json, en: ParsedLang, zhText: string): void {
  const issues = validateModData(modId, meta, en.entries, JSON.parse(zhText)).filter((i) => i.level === 'error');
  if (issues.length > 0) throw new PublishValidationError(modId, issues.map((i) => `${i.file}${i.key ? `:${i.key}` : ''} ${i.message}`));
}

export function applyToMod(input: ModApplyInput): ModApplyResult {
  const { en, zh, meta } = parseFiles(input.modId, input.files);
  const results = input.changes.map((c) => ({ id: c.id, outcome: outcomeFor(c, en, zh) }));
  const applied = input.changes.filter((_, i) => results[i]?.outcome === 'applied');
  if (applied.length === 0 && !input.status) return { files: [], results, appliedCount: 0, credits: [] };

  const credits = applied.map((c) => c.creditName);
  const newMeta = updateMeta(meta, credits, input.status, input.today);
  const zhText = applied.length > 0 ? buildZh(en, zh, new Map(applied.map((c) => [c.key, c.proposed]))) : input.files.zh;
  assertValid(input.modId, newMeta, en, zhText);
  const dir = `data/mods/${input.modId}`;
  const files: PublishFile[] = [
    ...(applied.length > 0 ? [{ path: `${dir}/zh_tw.json`, content: zhText }] : []),
    { path: `${dir}/mod.json`, content: `${JSON.stringify(newMeta, null, 2)}\n` },
  ];
  return { files, results, appliedCount: applied.length, credits };
}
```

- [ ] **Step 4: 實作 planPublish**

在 `planPublish.ts` 追加（imports 併入檔首）：

```ts
import { applyToMod, type ModApplyResult } from './applyMod';
import { buildCommitMessage } from './commitMessage';
import { mergeContributors } from './contributors';
import type { ApprovedChange, ModFiles, PublishPlan, StatusChange } from './publishTypes';

export interface PlanInput {
  readonly mods: Readonly<Record<string, ModFiles | null>>;
  readonly changes: readonly ApprovedChange[];
  readonly statusChanges: readonly StatusChange[];
  readonly today: string;
}

interface ModPlan {
  readonly modId: string;
  readonly result: ModApplyResult;
  readonly status: StatusChange | null;
  readonly statusIds: number[];
}

function latestStatus(list: readonly StatusChange[]): StatusChange | null {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).at(-1) ?? null;
}

function planMod(modId: string, input: PlanInput, winners: readonly ApprovedChange[]): ModPlan {
  const files = Object.hasOwn(input.mods, modId) ? input.mods[modId] ?? null : null;
  const changes = winners.filter((c) => c.modId === modId);
  if (!files) {
    const results = changes.map((c) => ({ id: c.id, outcome: 'conflict' as const }));
    return { modId, result: { files: [], results, appliedCount: 0, credits: [] }, status: null, statusIds: [] };
  }
  const statuses = input.statusChanges.filter((s) => s.modId === modId);
  const status = latestStatus(statuses);
  const result = applyToMod({ modId, files, changes, status, today: input.today });
  return { modId, result, status, statusIds: statuses.map((s) => s.id) };
}

/** 純函式：由 repo 檔案原文與待發佈變更產生要寫入的檔案、每條建議的結果與 commit 訊息 */
export function planPublish(input: PlanInput): PublishPlan {
  const { winners, superseded } = pickWinners(input.changes);
  const modIds = [...new Set([...winners.map((c) => c.modId), ...input.statusChanges.map((s) => s.modId)])].sort();
  const mods = modIds.map((modId) => planMod(modId, input, winners));
  const message = buildCommitMessage({
    perMod: mods.filter((m) => m.result.appliedCount > 0).map((m) => ({ modId: m.modId, count: m.result.appliedCount })),
    statuses: mods.flatMap((m) => (m.status ? [{ modId: m.modId, status: m.status.status }] : [])),
    contributors: mergeContributors([], mods.flatMap((m) => m.result.credits)),
  });
  return {
    files: mods.flatMap((m) => m.result.files),
    results: [...superseded.map((id) => ({ id, outcome: 'superseded' as const })), ...mods.flatMap((m) => m.result.results)],
    appliedStatusChangeIds: mods.flatMap((m) => m.statusIds),
    message,
  };
}
```

`index.ts`：`export { pickWinners } from './planPublish';` 改為 `export { pickWinners, planPublish, type PlanInput } from './planPublish';`，並加 `export { applyToMod, type ModApplyInput, type ModApplyResult } from './applyMod';`。

- [ ] **Step 5: 執行確認通過**

Run: `cd packages/core && npx vitest run src/review && npm run test:coverage`
Expected: PASS；coverage 門檻通過。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/review
git commit -m "feat(core): plan publishes with conflict detection, ordering and contributor merge"
```

---

### Task 3: ReviewRepo（D1）

**Files:**
- Create: `apps/worker/src/repo/reviewTypes.ts`、`apps/worker/src/repo/d1Review.ts`
- Modify: `apps/worker/src/repo/types.ts`（`Repos` 加 `review`）、`apps/worker/src/repo/index.ts`
- Test: `apps/worker/src/repo/review.test.ts`

**Interfaces:**
- Consumes: `ApprovedChange`、`StatusChange`、`ChangeResult`、`ModStatusTarget`、`SuggestionStatus`（core）。
- Produces:

```ts
export interface AdminSuggestion { id; modId; key; baseTarget: string | null; proposed; note: string | null; formatWarning: boolean; status: SuggestionStatus; authorUserId: number | null; authorName: string | null; authorSubject: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null }
export interface SuggestionFilter { status: SuggestionStatus; modId: string | null; limit: number }
export const PUBLISH_LOCK_TTL_MS = 10 * 60 * 1000;
export interface ReviewRepo {
  list(filter: SuggestionFilter): Promise<AdminSuggestion[]>;
  findById(id: number): Promise<AdminSuggestion | null>;
  approve(input: { id: number; reviewerId: number; proposed: string; formatWarning: boolean; now: string }): Promise<boolean>;
  reject(input: { id: number; reviewerId: number; reason: string | null; now: string }): Promise<boolean>;
  createDirectEdit(input: { modId: string; key: string; baseTarget: string | null; proposed: string; formatWarning: boolean; reviewerId: number; authorHash: string; now: string }): Promise<number>;
  addStatusChange(input: { modId: string; status: ModStatusTarget; createdBy: number; now: string }): Promise<number>;
  listPendingStatusChanges(): Promise<StatusChange[]>;
  listApprovedForPublish(): Promise<ApprovedChange[]>;
  acquirePublishLock(createdBy: number, now: Date): Promise<number | null>;
  releasePublishLock(batchId: number): Promise<void>;
  completePublish(input: { batchId: number; commitSha: string | null; results: readonly ChangeResult[]; statusChangeIds: readonly number[] }): Promise<void>;
}
```

- [ ] **Step 1: 寫失敗測試**

```ts
// apps/worker/src/repo/review.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewSuggestion, Repos } from './types';

const NOW = '2026-10-15T12:00:00.000Z';
let db: D1Database;
let repos: Repos;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const pending = (over: Partial<NewSuggestion> = {}) => repos.suggestions.upsertPending({
  modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', note: null, formatWarning: false,
  authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});
const statusOf = async (id: number) => (await repos.review.findById(id))?.status;

describe('ReviewRepo review actions', () => {
  it('lists by status and mod with author info', async () => {
    const alice = await createUser(db, 'contributor', 'Alice');
    await pending({ authorUserId: alice.id });
    await pending({ authorHash: 'h2', key: 'b' });
    await pending({ modId: 'jei', authorHash: 'h3' });
    const list = await repos.review.list({ status: 'pending', modId: 'create', limit: 10 });
    expect(list.map((s) => [s.key, s.authorName, s.authorSubject])).toEqual([['a', 'Alice', `user:${alice.id}`], ['b', null, 'ip:h2']]);
    expect(await repos.review.list({ status: 'approved', modId: null, limit: 10 })).toEqual([]);
  });

  it('approves one suggestion and supersedes other pending ones for the same key', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await pending();
    const b = await pending({ authorHash: 'h2', proposed: '青蘋果' });
    const other = await pending({ authorHash: 'h3', key: 'b' });
    expect(await repos.review.approve({ id: a.id, reviewerId: reviewer.id, proposed: '大紅蘋果', formatWarning: true, now: NOW })).toBe(true);
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'approved', proposed: '大紅蘋果', formatWarning: true, reviewedAt: NOW });
    expect(await statusOf(b.id)).toBe('superseded');
    expect(await statusOf(other.id)).toBe('pending');
    expect(await repos.review.approve({ id: a.id, reviewerId: reviewer.id, proposed: 'x', formatWarning: false, now: NOW })).toBe(false);
  });

  it('rejects pending or approved suggestions with a reason', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await pending();
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: '用詞不一致', now: NOW })).toBe(true);
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'rejected', reviewNote: '用詞不一致' });
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: null, now: NOW })).toBe(false);
  });

  it('creates a direct edit as an approved suggestion and supersedes pending ones', async () => {
    const reviewer = await createUser(db, 'reviewer', '審核者');
    const old = await pending();
    const id = await repos.review.createDirectEdit({ modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '蘋果！', formatWarning: false, reviewerId: reviewer.id, authorHash: 'h9', now: NOW });
    expect(await repos.review.findById(id)).toMatchObject({ status: 'approved', authorUserId: reviewer.id, authorName: '審核者', reviewedAt: NOW });
    expect(await statusOf(old.id)).toBe('superseded');
  });

  it('lists approved changes with credit only for public, unbanned authors', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const pub = await createUser(db, 'contributor', '公開者');
    const hidden = await createUser(db, 'contributor', '隱藏者');
    await db.prepare('UPDATE users SET public = 0 WHERE id = ?').bind(hidden.id).run();
    const ids = [
      (await pending({ authorUserId: pub.id })).id,
      (await pending({ authorUserId: hidden.id, key: 'b' })).id,
      (await pending({ key: 'c' })).id,
    ];
    for (const id of ids) await repos.review.approve({ id, reviewerId: reviewer.id, proposed: '譯文', formatWarning: false, now: NOW });
    const list = await repos.review.listApprovedForPublish();
    expect(list.map((c) => [c.key, c.creditName, c.reviewedAt])).toEqual([['a', '公開者', NOW], ['b', null, NOW], ['c', null, NOW]]);
  });
});

describe('ReviewRepo status changes and publishing', () => {
  it('records pending mod status changes', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const id = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: reviewer.id, now: NOW });
    expect(await repos.review.listPendingStatusChanges()).toEqual([{ id, modId: 'create', status: 'reviewed', createdAt: NOW }]);
  });

  it('holds a single publish lock until released or stale', async () => {
    const admin = await createUser(db, 'admin');
    const at = new Date(NOW);
    const first = await repos.review.acquirePublishLock(admin.id, at);
    expect(first).toEqual(expect.any(Number));
    expect(await repos.review.acquirePublishLock(admin.id, at)).toBeNull();
    expect(await repos.review.acquirePublishLock(admin.id, new Date(at.getTime() + 11 * 60 * 1000))).toEqual(expect.any(Number));
    await resetDb(db);
    const admin2 = await createUser(db, 'admin');
    const lock = await repos.review.acquirePublishLock(admin2.id, at);
    await repos.review.releasePublishLock(lock!);
    expect(await repos.review.acquirePublishLock(admin2.id, at)).toEqual(expect.any(Number));
  });

  it('completes a publish: statuses, batch row and status changes', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    const b = await pending({ key: 'b', authorHash: 'h2' });
    for (const id of [a.id, b.id]) await repos.review.approve({ id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const statusId = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ batchId: batchId!, commitSha: 'abc123', results: [{ id: a.id, outcome: 'applied' }, { id: b.id, outcome: 'conflict' }], statusChangeIds: [statusId] });
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'published' });
    expect(await statusOf(b.id)).toBe('conflict');
    expect(await db.prepare('SELECT commit_sha, suggestion_count FROM publish_batches').first()).toEqual({ commit_sha: 'abc123', suggestion_count: 1 });
    expect(await db.prepare('SELECT batch_id FROM suggestions WHERE id = ?').bind(a.id).first()).toEqual({ batch_id: batchId });
    expect(await repos.review.listPendingStatusChanges()).toEqual([]);
  });

  it('completes a publish without a commit by dropping the batch row', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    await repos.review.approve({ id: a.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ batchId: batchId!, commitSha: null, results: [{ id: a.id, outcome: 'superseded' }], statusChangeIds: [] });
    expect(await statusOf(a.id)).toBe('superseded');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first()).toEqual({ n: 0 });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/repo/review.test.ts`
Expected: FAIL（`repos.review` undefined）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/repo/reviewTypes.ts
import type { ApprovedChange, ChangeResult, ModStatusTarget, StatusChange, SuggestionStatus } from '@mlf/core/review';

export interface AdminSuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly status: SuggestionStatus;
  readonly authorUserId: number | null;
  readonly authorName: string | null;
  /** 封鎖用主體：user:<id> 或 ip:<hash> */
  readonly authorSubject: string;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface SuggestionFilter {
  readonly status: SuggestionStatus;
  readonly modId: string | null;
  readonly limit: number;
}

export const PUBLISH_LOCK_TTL_MS = 10 * 60 * 1000;

export interface ReviewRepo {
  list(filter: SuggestionFilter): Promise<AdminSuggestion[]>;
  findById(id: number): Promise<AdminSuggestion | null>;
  /** 只對 pending 生效；同時把同 mod/key 的其他 pending 標為 superseded（單一交易） */
  approve(input: { id: number; reviewerId: number; proposed: string; formatWarning: boolean; now: string }): Promise<boolean>;
  /** pending、approved、conflict 可退回 */
  reject(input: { id: number; reviewerId: number; reason: string | null; now: string }): Promise<boolean>;
  createDirectEdit(input: { modId: string; key: string; baseTarget: string | null; proposed: string; formatWarning: boolean; reviewerId: number; authorHash: string; now: string }): Promise<number>;
  addStatusChange(input: { modId: string; status: ModStatusTarget; createdBy: number; now: string }): Promise<number>;
  listPendingStatusChanges(): Promise<StatusChange[]>;
  listApprovedForPublish(): Promise<ApprovedChange[]>;
  /** 沒有未過期的鎖時建立 commit_sha 為 NULL 的批次列並回傳 id，否則 null */
  acquirePublishLock(createdBy: number, now: Date): Promise<number | null>;
  releasePublishLock(batchId: number): Promise<void>;
  completePublish(input: { batchId: number; commitSha: string | null; results: readonly ChangeResult[]; statusChangeIds: readonly number[] }): Promise<void>;
}
```

```ts
// apps/worker/src/repo/d1Review.ts
import type { ApprovedChange, StatusChange } from '@mlf/core/review';
import { PUBLISH_LOCK_TTL_MS, type AdminSuggestion, type ReviewRepo } from './reviewTypes';

const SELECT_ADMIN = `SELECT s.id, s.mod_id, s.key, s.base_target, s.proposed, s.note, s.format_warning, s.status,
  s.author_user_id, s.author_hash, s.review_note, s.created_at, s.reviewed_at, u.display_name AS author_name
  FROM suggestions s LEFT JOIN users u ON u.id = s.author_user_id`;

interface AdminRow {
  readonly id: number; readonly mod_id: string; readonly key: string; readonly base_target: string | null;
  readonly proposed: string; readonly note: string | null; readonly format_warning: number; readonly status: AdminSuggestion['status'];
  readonly author_user_id: number | null; readonly author_hash: string; readonly review_note: string | null;
  readonly created_at: string; readonly reviewed_at: string | null; readonly author_name: string | null;
}

const toAdmin = (r: AdminRow): AdminSuggestion => ({
  id: r.id, modId: r.mod_id, key: r.key, baseTarget: r.base_target, proposed: r.proposed, note: r.note,
  formatWarning: r.format_warning === 1, status: r.status, authorUserId: r.author_user_id, authorName: r.author_name,
  authorSubject: r.author_user_id !== null ? `user:${r.author_user_id}` : `ip:${r.author_hash}`,
  reviewNote: r.review_note, createdAt: r.created_at, reviewedAt: r.reviewed_at,
});

function reviewActions(db: D1Database): Pick<ReviewRepo, 'approve' | 'reject' | 'createDirectEdit'> {
  return {
    async approve({ id, reviewerId, proposed, formatWarning, now }) {
      const [first] = await db.batch([
        db.prepare(`UPDATE suggestions SET status = 'approved', proposed = ?2, format_warning = ?3, reviewer_id = ?4, reviewed_at = ?5
                    WHERE id = ?1 AND status = 'pending'`).bind(id, proposed, formatWarning ? 1 : 0, reviewerId, now),
        db.prepare(`UPDATE suggestions SET status = 'superseded', reviewer_id = ?2, reviewed_at = ?3
                    WHERE status = 'pending' AND id <> ?1 AND EXISTS (
                      SELECT 1 FROM suggestions t WHERE t.id = ?1 AND t.status = 'approved' AND t.reviewed_at = ?3
                        AND t.mod_id = suggestions.mod_id AND t.key = suggestions.key)`).bind(id, reviewerId, now),
      ]);
      return (first?.meta.changes ?? 0) === 1;
    },
    async reject({ id, reviewerId, reason, now }) {
      const result = await db
        .prepare(`UPDATE suggestions SET status = 'rejected', review_note = ?, reviewer_id = ?, reviewed_at = ?
                  WHERE id = ? AND status IN ('pending', 'approved', 'conflict')`)
        .bind(reason, reviewerId, now, id)
        .run();
      return result.meta.changes === 1;
    },
    async createDirectEdit({ modId, key, baseTarget, proposed, formatWarning, reviewerId, authorHash, now }) {
      const [, inserted] = await db.batch<{ id: number }>([
        db.prepare(`UPDATE suggestions SET status = 'superseded', reviewer_id = ?3, reviewed_at = ?4
                    WHERE status = 'pending' AND mod_id = ?1 AND key = ?2`).bind(modId, key, reviewerId, now),
        db.prepare(`INSERT INTO suggestions (mod_id, key, base_target, proposed, format_warning, author_user_id, author_hash, status, reviewer_id, created_at, reviewed_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'approved', ?6, ?8, ?8) RETURNING id`)
          .bind(modId, key, baseTarget, proposed, formatWarning ? 1 : 0, reviewerId, authorHash, now),
      ]);
      const id = inserted?.results[0]?.id;
      if (id === undefined) throw new Error('direct edit insert returned no id');
      return id;
    },
  };
}

function publishActions(db: D1Database): Pick<ReviewRepo, 'listApprovedForPublish' | 'acquirePublishLock' | 'releasePublishLock' | 'completePublish'> {
  return {
    async listApprovedForPublish(): Promise<ApprovedChange[]> {
      const { results } = await db
        .prepare(`SELECT s.id, s.mod_id, s.key, s.base_target, s.proposed, COALESCE(s.reviewed_at, s.created_at) AS reviewed_at,
                    CASE WHEN u.public = 1 AND u.banned = 0 THEN u.display_name END AS credit_name
                  FROM suggestions s LEFT JOIN users u ON u.id = s.author_user_id
                  WHERE s.status = 'approved' ORDER BY s.id`)
        .all<{ id: number; mod_id: string; key: string; base_target: string | null; proposed: string; reviewed_at: string; credit_name: string | null }>();
      return results.map((r) => ({ id: r.id, modId: r.mod_id, key: r.key, baseTarget: r.base_target, proposed: r.proposed, reviewedAt: r.reviewed_at, creditName: r.credit_name }));
    },
    async acquirePublishLock(createdBy, now) {
      const staleBefore = new Date(now.getTime() - PUBLISH_LOCK_TTL_MS).toISOString();
      const [, inserted] = await db.batch<{ id: number }>([
        db.prepare('DELETE FROM publish_batches WHERE commit_sha IS NULL AND created_at <= ?').bind(staleBefore),
        db.prepare(`INSERT INTO publish_batches (commit_sha, created_by, suggestion_count, created_at)
                    SELECT NULL, ?1, 0, ?2 WHERE NOT EXISTS (SELECT 1 FROM publish_batches WHERE commit_sha IS NULL)
                    RETURNING id`).bind(createdBy, now.toISOString()),
      ]);
      return inserted?.results[0]?.id ?? null;
    },
    async releasePublishLock(batchId) {
      await db.prepare('DELETE FROM publish_batches WHERE id = ? AND commit_sha IS NULL').bind(batchId).run();
    },
    async completePublish({ batchId, commitSha, results, statusChangeIds }) {
      const applied = results.filter((r) => r.outcome === 'applied').length;
      const updates = results.map((r) => db
        .prepare(`UPDATE suggestions SET status = ?, batch_id = ? WHERE id = ? AND status = 'approved'`)
        .bind(r.outcome === 'applied' ? 'published' : r.outcome, r.outcome === 'applied' && commitSha ? batchId : null, r.id));
      const statusUpdate = commitSha && statusChangeIds.length > 0
        ? [db.prepare(`UPDATE mod_status_changes SET batch_id = ? WHERE id IN (${statusChangeIds.map(() => '?').join(', ')})`).bind(batchId, ...statusChangeIds)]
        : [];
      const batchRow = commitSha
        ? db.prepare('UPDATE publish_batches SET commit_sha = ?, suggestion_count = ? WHERE id = ?').bind(commitSha, applied, batchId)
        : db.prepare('DELETE FROM publish_batches WHERE id = ?').bind(batchId);
      // 先更新建議（外鍵指向批次列），刪除批次列放最後
      await db.batch(commitSha ? [batchRow, ...updates, ...statusUpdate] : [...updates, batchRow]);
    },
  };
}

export function createD1Review(db: D1Database): ReviewRepo {
  return {
    async list({ status, modId, limit }) {
      const { results } = await db
        .prepare(`${SELECT_ADMIN} WHERE s.status = ?1 AND (?2 IS NULL OR s.mod_id = ?2) ORDER BY s.mod_id, s.key, s.created_at, s.id LIMIT ?3`)
        .bind(status, modId, limit)
        .all<AdminRow>();
      return results.map(toAdmin);
    },
    async findById(id) {
      const row = await db.prepare(`${SELECT_ADMIN} WHERE s.id = ?`).bind(id).first<AdminRow>();
      return row ? toAdmin(row) : null;
    },
    ...reviewActions(db),
    async addStatusChange({ modId, status, createdBy, now }) {
      const row = await db
        .prepare('INSERT INTO mod_status_changes (mod_id, status, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(modId, status, createdBy, now)
        .first<{ id: number }>();
      if (!row) throw new Error('status change insert returned no id');
      return row.id;
    },
    async listPendingStatusChanges(): Promise<StatusChange[]> {
      const { results } = await db
        .prepare('SELECT id, mod_id, status, created_at FROM mod_status_changes WHERE batch_id IS NULL ORDER BY id')
        .all<{ id: number; mod_id: string; status: StatusChange['status']; created_at: string }>();
      return results.map((r) => ({ id: r.id, modId: r.mod_id, status: r.status, createdAt: r.created_at }));
    },
    ...publishActions(db),
  };
}
```

`repo/types.ts`：`import type { ReviewRepo } from './reviewTypes';`，`Repos` 加 `readonly review: ReviewRepo;`。`repo/index.ts` 加 `review: createD1Review(db)`。

> 鎖的唯一性：`DELETE` 過期鎖與條件 `INSERT` 在同一個 D1 交易內，兩個並發請求只有一個會看到「沒有未完成批次」。

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/repo && npx tsc --noEmit`
Expected: PASS；typecheck 0 errors。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/repo
git commit -m "feat(worker): add D1 review repository with publish lock"
```

---

### Task 4: 審核 API（清單、核准、修改後核准、退回、直接編輯、模組狀態）

**Files:**
- Create: `apps/worker/src/routes/rejections.ts`、`apps/worker/src/routes/adminReview.ts`
- Modify: `apps/worker/src/routes/suggestions.ts`（改用 `rejections.ts`）、`apps/worker/src/app.ts`
- Test: `apps/worker/src/routes/adminReview.test.ts`、`apps/worker/src/routes/adminAccess.test.ts`（表格追加）

**Interfaces:**
- Consumes: `ReviewRepo`（Task 3）、`requireWrite`、`requirePermission`、`parseJson`、`lookupEntry`、`validateSuggestion`、`MOD_STATUS_TARGETS`。
- Produces:
  - `GET /api/v1/admin/suggestions?status=pending&modId=` → `{ suggestions: AdminSuggestion[] }`（最多 500，依 mod、key 排序）
  - `POST /api/v1/admin/suggestions/:id/approve` `{ proposed? }` → `{ id }`；非 pending 409 `not_pending`；不存在 404 `suggestion_not_found`；內容無效 400（同建議錯誤碼）
  - `POST /api/v1/admin/suggestions/:id/reject` `{ reason? }` → `{ id }`
  - `POST /api/v1/admin/edits` `{ modId, key, proposed }` → 201 `{ id, formatWarning }`
  - `POST /api/v1/admin/mods/:modId/status` `{ status: 'partial' | 'reviewed' }` → 201 `{ id }`；模組不存在 404
  - `REJECTION_MESSAGES: Readonly<Record<SuggestionRejection, string>>`

- [ ] **Step 1: 寫失敗測試**

`adminAccess.test.ts` 的 `ADMIN_ENDPOINTS` 追加：

```ts
  { method: 'GET', route: '/api/v1/admin/suggestions', path: '/api/v1/admin/suggestions', minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/suggestions/:id/approve', path: '/api/v1/admin/suggestions/999/approve', body: {}, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/suggestions/:id/reject', path: '/api/v1/admin/suggestions/999/reject', body: {}, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/edits', path: '/api/v1/admin/edits', body: { modId: 'create', key: 'a', proposed: '新' }, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/mods/:modId/status', path: '/api/v1/admin/mods/create/status', body: { status: 'reviewed' }, minRole: 'reviewer' },
```

```ts
// apps/worker/src/routes/adminReview.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());
type Actor = { id: number; sessionVersion: number };
const get = async (path: string, who: Actor) => app.request(path, { headers: await writeHeaders(who) }, testEnv({ DB: db }));
const post = async (path: string, who: Actor, body: unknown) =>
  app.request(path, { method: 'POST', headers: { ...(await writeHeaders(who)), 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(body) }, testEnv({ DB: db }));

/** TEST_MOD：en { a: 'Apple %s', b: 'Banana' }、zh { a: '蘋果 %s' } */
const seed = (over: { key?: string; proposed?: string; hash?: string } = {}) => createD1Repos(db).suggestions.upsertPending({
  modId: 'create', key: over.key ?? 'a', baseTarget: '蘋果 %s', proposed: over.proposed ?? '紅蘋果 %s', note: '更自然',
  formatWarning: false, authorUserId: null, authorHash: over.hash ?? 'h1', createdAt: TEST_NOW.toISOString(),
});

describe('admin review API', () => {
  it('lists pending suggestions filtered by mod', async () => {
    const reviewer = await createUser(db, 'reviewer');
    await seed();
    await seed({ key: 'b', proposed: '香蕉', hash: 'h2' });
    const res = await get('/api/v1/admin/suggestions?status=pending&modId=create', reviewer);
    const body = await readJson<{ suggestions: { key: string; authorSubject: string }[] }>(res);
    expect(body.data.suggestions.map((s) => s.key)).toEqual(['a', 'b']);
    expect(body.data.suggestions[0]?.authorSubject).toBe('ip:h1');
    expect((await get('/api/v1/admin/suggestions?status=bogus', reviewer)).status).toBe(400);
  });

  it('approves as-is and supersedes the competing pending suggestion', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    const b = await seed({ proposed: '青蘋果 %s', hash: 'h2' });
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, {})).status).toBe(200);
    const repos = createD1Repos(db);
    expect((await repos.review.findById(a.id))?.status).toBe('approved');
    expect((await repos.review.findById(b.id))?.status).toBe('superseded');
    const again = await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, {});
    expect(again.status).toBe(409);
    expect((await readJson(again)).error.code).toBe('not_pending');
  });

  it('approves an edited text and re-validates it', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    const unchanged = await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, { proposed: '蘋果 %s' });
    expect((await readJson(unchanged)).error.code).toBe('unchanged');
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, { proposed: '大蘋果' })).status).toBe(200);
    expect(await createD1Repos(db).review.findById(a.id)).toMatchObject({ proposed: '大蘋果', formatWarning: true });
  });

  it('returns 404 for unknown suggestions and 400 for bad ids', async () => {
    const reviewer = await createUser(db, 'reviewer');
    expect((await post('/api/v1/admin/suggestions/12345/approve', reviewer, {})).status).toBe(404);
    expect((await post('/api/v1/admin/suggestions/abc/reject', reviewer, {})).status).toBe(400);
  });

  it('rejects with a reason', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    expect((await post(`/api/v1/admin/suggestions/${a.id}/reject`, reviewer, { reason: '用詞不一致' })).status).toBe(200);
    expect(await createD1Repos(db).review.findById(a.id)).toMatchObject({ status: 'rejected', reviewNote: '用詞不一致' });
  });

  it('creates a direct edit against the current site value', async () => {
    const reviewer = await createUser(db, 'reviewer', '審核者');
    const pendingOne = await seed();
    const res = await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'a', proposed: '蘋果！%s' });
    expect(res.status).toBe(201);
    const { id } = (await readJson<{ id: number }>(res)).data;
    expect(await createD1Repos(db).review.findById(id)).toMatchObject({ status: 'approved', baseTarget: '蘋果 %s', authorUserId: reviewer.id });
    expect((await createD1Repos(db).review.findById(pendingOne.id))?.status).toBe('superseded');
    expect((await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'constructor', proposed: 'x' })).status).toBe(404);
    expect((await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'b', proposed: '  ' })).status).toBe(400);
  });

  it('queues a mod status change for existing mods only', async () => {
    const reviewer = await createUser(db, 'reviewer');
    expect((await post('/api/v1/admin/mods/create/status', reviewer, { status: 'reviewed' })).status).toBe(201);
    expect((await post('/api/v1/admin/mods/nope/status', reviewer, { status: 'reviewed' })).status).toBe(404);
    expect((await post('/api/v1/admin/mods/create/status', reviewer, { status: 'machine' })).status).toBe(400);
    expect(await createD1Repos(db).review.listPendingStatusChanges()).toMatchObject([{ modId: 'create', status: 'reviewed' }]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/adminReview.test.ts src/routes/adminAccess.test.ts`
Expected: FAIL（路由不存在；路由比對測試失敗）。

- [ ] **Step 3: 實作**

```ts
// apps/worker/src/routes/rejections.ts
import type { SuggestionRejection } from '@mlf/core/review';

export const REJECTION_MESSAGES: Readonly<Record<SuggestionRejection, string>> = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
};
```

`suggestions.ts`：刪除本地 `REJECTION_MESSAGES` 常數，改 `import { REJECTION_MESSAGES } from './rejections';`。

```ts
// apps/worker/src/routes/adminReview.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { lookupEntry, MOD_STATUS_TARGETS, SUGGESTION_LIMITS, SUGGESTION_STATUSES, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, ok, parseJson } from '../http';
import { clientIp, hashIp } from '../ipHash';
import { REJECTION_MESSAGES } from './rejections';

const LIST_LIMIT = 500;
const modIdSchema = z.string().regex(MOD_ID_PATTERN).max(64);
const proposedSchema = z.string().max(SUGGESTION_LIMITS.maxChars * 2);
const listQuery = z.object({ status: z.enum(SUGGESTION_STATUSES).default('pending'), modId: modIdSchema.optional() });
const approveBody = z.object({ proposed: proposedSchema.optional() });
const rejectBody = z.object({ reason: z.string().trim().max(SUGGESTION_LIMITS.maxNote).optional() });
const editBody = z.object({ modId: modIdSchema, key: z.string().min(1).max(256), proposed: proposedSchema });
const statusBody = z.object({ status: z.enum(MOD_STATUS_TARGETS) });
const idParam = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const NOT_PENDING = '這條建議已被處理。';

function actorId(c: Ctx): number {
  const user = c.get('user');
  if (!user) throw new Error('requirePermission must run before admin handlers');
  return user.id;
}

function suggestionId(c: Ctx): number | Response {
  const parsed = idParam.safeParse(c.req.param('id'));
  return parsed.success ? parsed.data : fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
}

/** 以 Worker 目前的靜態資產為準重新驗證；回傳現值作為 base_target */
async function checkProposal(c: Ctx, deps: AppDeps, modId: string, key: string, proposed: string): Promise<Response | { current: string | null; formatWarning: boolean }> {
  const mod = await deps.loadMod(c.env, modId);
  if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const entry = lookupEntry(mod.en, mod.zh, key);
  if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
  const verdict = validateSuggestion({ ...entry, proposed });
  if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);
  return { current: entry.current, formatWarning: verdict.formatWarning };
}

async function handleApprove(c: Ctx, deps: AppDeps): Promise<Response> {
  const id = suggestionId(c);
  if (id instanceof Response) return id;
  const body = await parseJson(c, approveBody);
  if (body instanceof Response) return body;
  const review = c.get('repos').review;
  const target = await review.findById(id);
  if (!target) return fail(c, 404, 'suggestion_not_found', '找不到這條建議。');
  if (target.status !== 'pending') return fail(c, 409, 'not_pending', NOT_PENDING);
  const proposed = body.proposed ?? target.proposed;
  const checked = await checkProposal(c, deps, target.modId, target.key, proposed);
  if (checked instanceof Response) return checked;
  const done = await review.approve({ id, reviewerId: actorId(c), proposed, formatWarning: checked.formatWarning, now: deps.now().toISOString() });
  return done ? ok(c, { id }) : fail(c, 409, 'not_pending', NOT_PENDING);
}

async function handleReject(c: Ctx, deps: AppDeps): Promise<Response> {
  const id = suggestionId(c);
  if (id instanceof Response) return id;
  const body = await parseJson(c, rejectBody);
  if (body instanceof Response) return body;
  const review = c.get('repos').review;
  if (!(await review.findById(id))) return fail(c, 404, 'suggestion_not_found', '找不到這條建議。');
  const done = await review.reject({ id, reviewerId: actorId(c), reason: body.reason || null, now: deps.now().toISOString() });
  return done ? ok(c, { id }) : fail(c, 409, 'not_pending', NOT_PENDING);
}

async function handleEdit(c: Ctx, deps: AppDeps): Promise<Response> {
  const body = await parseJson(c, editBody);
  if (body instanceof Response) return body;
  const checked = await checkProposal(c, deps, body.modId, body.key, body.proposed);
  if (checked instanceof Response) return checked;
  const id = await c.get('repos').review.createDirectEdit({
    modId: body.modId, key: body.key, baseTarget: checked.current, proposed: body.proposed, formatWarning: checked.formatWarning,
    reviewerId: actorId(c), authorHash: await hashIp(c.env.IP_HASH_SALT, clientIp(c.req.raw)), now: deps.now().toISOString(),
  });
  return ok(c, { id, formatWarning: checked.formatWarning }, 201);
}

async function handleModStatus(c: Ctx, deps: AppDeps): Promise<Response> {
  const modId = modIdSchema.safeParse(c.req.param('modId'));
  if (!modId.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
  const body = await parseJson(c, statusBody);
  if (body instanceof Response) return body;
  if (!(await deps.loadMod(c.env, modId.data))) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const id = await c.get('repos').review.addStatusChange({ modId: modId.data, status: body.status, createdBy: actorId(c), now: deps.now().toISOString() });
  return ok(c, { id }, 201);
}

export function registerAdminReviewRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/suggestions', requirePermission('review'), async (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
    const suggestions = await c.get('repos').review.list({ status: query.data.status, modId: query.data.modId ?? null, limit: LIST_LIMIT });
    return ok(c, { suggestions });
  });
  app.post('/api/v1/admin/suggestions/:id/approve', requireWrite, requirePermission('review'), (c) => handleApprove(c, deps));
  app.post('/api/v1/admin/suggestions/:id/reject', requireWrite, requirePermission('review'), (c) => handleReject(c, deps));
  app.post('/api/v1/admin/edits', requireWrite, requirePermission('review'), (c) => handleEdit(c, deps));
  app.post('/api/v1/admin/mods/:modId/status', requireWrite, requirePermission('review'), (c) => handleModStatus(c, deps));
}
```

`app.ts`：import 並於 `registerAdminBlockRoutes(app, deps);` 後加 `registerAdminReviewRoutes(app, deps);`。

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: PASS（含拒絕表格新增的 5 支 × 各情境）；coverage ≥ 80%。

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): add review queue, direct edit and mod status APIs"
```

---

### Task 5: GitHub App 客戶端（PEM 轉換、JWT、Git Data API）與假 GitHub

**Files:**
- Create: `apps/worker/src/github/pem.ts`、`github/appJwt.ts`、`github/client.ts`、`github/fakeGithub.ts`
- Modify: `apps/worker/src/env.ts`、`apps/worker/src/testEnv.ts`、`apps/worker/vitest.config.ts`
- Test: `apps/worker/src/github/github.test.ts`

**Interfaces:**
- Consumes: `toBase64Url`（3B1 `auth/crypto.ts`）、`FetchLike`、`PublishFile`（core）。
- Produces:
  - `pemToPkcs8Der(pem: string): Uint8Array<ArrayBuffer>`（接受 PKCS#1 `RSA PRIVATE KEY` 或 PKCS#8 `PRIVATE KEY`，亦接受以 `\n` 字面跳脫的單行 PEM）
  - `importPrivateKey(pem): Promise<CryptoKey>`；`createAppJwt(appId: string, key: CryptoKey, now: Date): Promise<string>`
  - `class GithubError extends Error { status: number; endpoint: string }`
  - `interface GithubConfig { apiBase; appId; privateKeyPem; installationId; repo; fetch: FetchLike; now: Date }`；`githubConfig(env, fetchImpl, now): GithubConfig`
  - `interface GithubClient { mainSha(); commitTree(sha); readFile(path, ref): Promise<string | null>; createTree(baseTree, files); createCommit(message, tree, parent); fastForwardMain(sha): Promise<'ok' | 'not_fast_forward'> }`；`createGithubClient(cfg): Promise<GithubClient>`
  - `createFakeGithub(files: Record<string, string>, opts?: { repo?: string; concurrentPushes?: number; failPath?: RegExp }): FakeGithub`；`FakeGithub { fetch; head(); fileAtHead(path); commits(); requests() }`
  - `Env` 新增 `GITHUB_APP_ID`、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_INSTALLATION_ID`、`REPO`；`ENV_GROUPS.githubApp = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_INSTALLATION_ID', 'GITHUB_API_BASE', 'REPO']`
  - testEnv：`TEST_GITHUB_KEY`（啟動時產生的 PKCS#1 PEM）與 `TEST_GITHUB_PUBLIC_KEY`

- [ ] **Step 1: 擴充 Env 與測試 Env**

`env.ts` 的 `Env` 加：

```ts
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY: string;
  readonly GITHUB_INSTALLATION_ID: string;
  /** owner/name */
  readonly REPO: string;
```

`ENV_GROUPS` 加：

```ts
  githubApp: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_INSTALLATION_ID', 'GITHUB_API_BASE', 'REPO'],
```

`testEnv.ts` 檔首加：

```ts
import { generateKeyPairSync } from 'node:crypto';

const TEST_KEYS = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
/** 與 GitHub 下載格式相同的 PKCS#1 PEM */
export const TEST_GITHUB_KEY = TEST_KEYS.privateKey;
export const TEST_GITHUB_PUBLIC_KEY = TEST_KEYS.publicKey;
```

並在 `testEnv()` 回傳物件加：`GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_KEY, GITHUB_INSTALLATION_ID: '99', REPO: 'MrPippi/ModLangForge',`。

`vitest.config.ts` coverage `exclude` 加 `'src/github/fakeGithub.ts'`。

- [ ] **Step 2: 寫失敗測試**

```ts
// apps/worker/src/github/github.test.ts
import { createPrivateKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TEST_GITHUB_KEY, TEST_GITHUB_PUBLIC_KEY } from '../testEnv';
import { createAppJwt, importPrivateKey } from './appJwt';
import { createGithubClient, GithubError, type GithubConfig } from './client';
import { createFakeGithub } from './fakeGithub';
import { pemToPkcs8Der } from './pem';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const FILES = { 'data/mods/create/zh_tw.json': '{\n  "a": "蘋果"\n}\n' };
const config = (fetchImpl: GithubConfig['fetch']): GithubConfig => ({
  apiBase: 'https://api.github.test', appId: '1', privateKeyPem: TEST_GITHUB_KEY, installationId: '99', repo: 'MrPippi/ModLangForge', fetch: fetchImpl, now: NOW,
});
const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('pemToPkcs8Der', () => {
  it('wraps PKCS#1 exactly like OpenSSL', () => {
    const expected = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'der' });
    expect(Buffer.from(pemToPkcs8Der(TEST_GITHUB_KEY))).toEqual(expected);
  });

  it('accepts PKCS#8 and single-line PEM with escaped newlines', () => {
    const pkcs8 = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'pem' }).toString();
    const expected = createPrivateKey(TEST_GITHUB_KEY).export({ type: 'pkcs8', format: 'der' });
    expect(Buffer.from(pemToPkcs8Der(pkcs8))).toEqual(expected);
    expect(Buffer.from(pemToPkcs8Der(TEST_GITHUB_KEY.trim().replace(/\n/g, '\\n')))).toEqual(expected);
  });

  it('rejects anything else', () => {
    expect(() => pemToPkcs8Der('not a key')).toThrow();
  });
});

describe('createAppJwt', () => {
  it('signs an RS256 JWT GitHub accepts', async () => {
    const jwt = await createAppJwt('1', await importPrivateKey(TEST_GITHUB_KEY), NOW);
    const [header, payload, signature] = jwt.split('.');
    expect(decode(header!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const iat = Math.floor(NOW.getTime() / 1000) - 60;
    expect(decode(payload!)).toEqual({ iat, exp: iat + 540, iss: '1' });
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), TEST_GITHUB_PUBLIC_KEY, Buffer.from(signature!, 'base64url'))).toBe(true);
  });
});

describe('GitHub client against the fake', () => {
  it('reads, commits and fast-forwards main', async () => {
    const fake = createFakeGithub(FILES);
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    expect(await gh.readFile('data/mods/create/zh_tw.json', base)).toBe(FILES['data/mods/create/zh_tw.json']);
    expect(await gh.readFile('data/mods/nope/zh_tw.json', base)).toBeNull();
    const tree = await gh.createTree(await gh.commitTree(base), [{ path: 'data/mods/create/zh_tw.json', content: '{}\n' }]);
    const commit = await gh.createCommit('msg', tree, base);
    expect(await gh.fastForwardMain(commit)).toBe('ok');
    expect(fake.head()).toBe(commit);
    expect(fake.fileAtHead('data/mods/create/zh_tw.json')).toBe('{}\n');
    expect(fake.requests()[0]).toEqual({ method: 'POST', path: '/app/installations/99/access_tokens' });
  });

  it('reports a non-fast-forward when main moved', async () => {
    const fake = createFakeGithub(FILES, { concurrentPushes: 1 });
    const gh = await createGithubClient(config(fake.fetch));
    const base = await gh.mainSha();
    const commit = await gh.createCommit('msg', await gh.commitTree(base), base);
    expect(await gh.fastForwardMain(commit)).toBe('not_fast_forward');
  });

  it('throws GithubError on failures', async () => {
    const fake = createFakeGithub(FILES, { failPath: /access_tokens/ });
    await expect(createGithubClient(config(fake.fetch))).rejects.toBeInstanceOf(GithubError);
    await expect(createGithubClient({ ...config(fake.fetch), repo: 'not a repo' })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/github`
Expected: FAIL（模組不存在）。

- [ ] **Step 4: 實作 PEM 與 JWT**

```ts
// apps/worker/src/github/pem.ts
const PEM_PATTERN = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/;

/** AlgorithmIdentifier { rsaEncryption, NULL } */
const RSA_ALGORITHM = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
const VERSION_ZERO = [0x02, 0x01, 0x00];

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return [0x80 | bytes.length, ...bytes];
}

function derNode(tag: number, content: readonly number[]): number[] {
  return [tag, ...derLength(content.length), ...content];
}

/** PKCS#1 RSAPrivateKey → PKCS#8 PrivateKeyInfo（GitHub 下載的私鑰是 PKCS#1） */
function wrapPkcs1(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(derNode(0x30, [...VERSION_ZERO, ...RSA_ALGORITHM, ...derNode(0x04, [...pkcs1])]));
}

export function pemToPkcs8Der(pem: string): Uint8Array<ArrayBuffer> {
  const match = PEM_PATTERN.exec(pem.replace(/\\n/g, '\n'));
  const body = match?.[2];
  if (!match || !body) throw new Error('GITHUB_APP_PRIVATE_KEY is not a PEM private key');
  const der = Uint8Array.from(atob(body.replace(/\s+/g, '')), (ch) => ch.charCodeAt(0));
  return match[1] ? wrapPkcs1(der) : der;
}
```

```ts
// apps/worker/src/github/appJwt.ts
import { toBase64Url } from '../auth/crypto';
import { pemToPkcs8Der } from './pem';

const encoder = new TextEncoder();
const CLOCK_SKEW_SEC = 60;
const LIFETIME_SEC = 540;

const encodeJson = (value: unknown): string => toBase64Url(encoder.encode(JSON.stringify(value)));

export function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToPkcs8Der(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** GitHub App JWT：iat 往前 60 秒容忍時鐘誤差，總效期 9 分鐘（上限 10 分鐘） */
export async function createAppJwt(appId: string, key: CryptoKey, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000) - CLOCK_SKEW_SEC;
  const input = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({ iat, exp: iat + LIFETIME_SEC, iss: appId })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}
```

- [ ] **Step 5: 實作 client**

```ts
// apps/worker/src/github/client.ts
import { z } from 'zod';
import type { PublishFile } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';
import type { Env } from '../env';
import { createAppJwt, importPrivateKey } from './appJwt';

export class GithubError extends Error {
  constructor(readonly status: number, readonly endpoint: string) {
    super(`GitHub ${endpoint} failed with ${status}`);
    this.name = 'GithubError';
  }
}

export interface GithubConfig {
  readonly apiBase: string;
  readonly appId: string;
  readonly privateKeyPem: string;
  readonly installationId: string;
  readonly repo: string;
  readonly fetch: FetchLike;
  readonly now: Date;
}

export interface GithubClient {
  mainSha(): Promise<string>;
  commitTree(sha: string): Promise<string>;
  readFile(path: string, ref: string): Promise<string | null>;
  createTree(baseTree: string, files: readonly PublishFile[]): Promise<string>;
  createCommit(message: string, tree: string, parent: string): Promise<string>;
  fastForwardMain(sha: string): Promise<'ok' | 'not_fast_forward'>;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = 'main';
const shaSchema = z.object({ sha: z.string().min(1) });

export function githubConfig(env: Env, fetchImpl: FetchLike, now: Date): GithubConfig {
  return {
    apiBase: env.GITHUB_API_BASE, appId: env.GITHUB_APP_ID, privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
    installationId: env.GITHUB_INSTALLATION_ID, repo: env.REPO, fetch: fetchImpl, now,
  };
}

function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': 'modlangforge', 'X-GitHub-Api-Version': '2022-11-28' };
}

async function expectJson<T>(res: Response, endpoint: string, schema: z.ZodType<T>): Promise<T> {
  if (!res.ok) throw new GithubError(res.status, endpoint);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new GithubError(res.status, `${endpoint} (unexpected body)`);
  return parsed.data;
}

async function installationToken(cfg: GithubConfig): Promise<string> {
  const jwt = await createAppJwt(cfg.appId, await importPrivateKey(cfg.privateKeyPem), cfg.now);
  const res = await cfg.fetch(`${cfg.apiBase}/app/installations/${encodeURIComponent(cfg.installationId)}/access_tokens`, { method: 'POST', headers: headers(jwt) });
  return (await expectJson(res, 'installation token', z.object({ token: z.string().min(1) }))).token;
}

export async function createGithubClient(cfg: GithubConfig): Promise<GithubClient> {
  if (!REPO_PATTERN.test(cfg.repo)) throw new Error('REPO must be owner/name');
  const token = await installationToken(cfg);
  const base = `${cfg.apiBase}/repos/${cfg.repo}`;
  const send = (path: string, method: string, body: unknown) =>
    cfg.fetch(`${base}${path}`, { method, headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const getJson = async <T>(path: string, schema: z.ZodType<T>) => expectJson(await cfg.fetch(`${base}${path}`, { headers: headers(token) }), path, schema);

  return {
    async mainSha() {
      return (await getJson(`/git/ref/heads/${BRANCH}`, z.object({ object: shaSchema }))).object.sha;
    },
    async commitTree(sha) {
      return (await getJson(`/git/commits/${sha}`, z.object({ tree: shaSchema }))).tree.sha;
    },
    async readFile(path, ref) {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const res = await cfg.fetch(`${base}/contents/${encoded}?ref=${encodeURIComponent(ref)}`, { headers: headers(token, 'application/vnd.github.raw+json') });
      if (res.status === 404) return null;
      if (!res.ok) throw new GithubError(res.status, 'contents');
      return res.text();
    },
    async createTree(baseTree, files) {
      const tree = files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }));
      return (await expectJson(await send('/git/trees', 'POST', { base_tree: baseTree, tree }), 'create tree', shaSchema)).sha;
    },
    async createCommit(message, tree, parent) {
      return (await expectJson(await send('/git/commits', 'POST', { message, tree, parents: [parent] }), 'create commit', shaSchema)).sha;
    },
    async fastForwardMain(sha) {
      const res = await send(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha, force: false });
      if (res.ok) return 'ok';
      if (res.status === 422) return 'not_fast_forward';
      throw new GithubError(res.status, 'update ref');
    },
  };
}
```

- [ ] **Step 6: 實作假 GitHub（單元測試與 E2E 共用）**

```ts
// apps/worker/src/github/fakeGithub.ts
import type { FetchLike } from '../appEnv';

export interface FakeCommit {
  readonly sha: string;
  readonly tree: string;
  readonly parents: readonly string[];
  readonly message: string;
}

export interface FakeGithubOptions {
  readonly repo?: string;
  /** 每次更新 ref 前模擬他人先推送一次，共幾次 */
  readonly concurrentPushes?: number;
  /** 路徑符合時回 500 */
  readonly failPath?: RegExp;
}

export interface FakeGithub {
  readonly fetch: FetchLike;
  head(): string;
  fileAtHead(path: string): string | null;
  commits(): readonly FakeCommit[];
  requests(): readonly { method: string; path: string }[];
}

type Body = Record<string, unknown> | null;

/** 只實作發佈流程用到的 GitHub REST 端點；狀態存在閉包內（測試替身） */
export function createFakeGithub(initial: Readonly<Record<string, string>>, opts: FakeGithubOptions = {}): FakeGithub {
  const prefix = `/repos/${opts.repo ?? 'MrPippi/ModLangForge'}`;
  const trees = new Map<string, ReadonlyMap<string, string>>();
  const commits = new Map<string, FakeCommit>();
  const log: { method: string; path: string }[] = [];
  let counter = 0;
  let pushesLeft = opts.concurrentPushes ?? 0;
  const nextSha = () => (counter += 1).toString(16).padStart(40, '0');
  const addTree = (files: ReadonlyMap<string, string>) => { const sha = nextSha(); trees.set(sha, files); return sha; };
  const addCommit = (tree: string, parents: readonly string[], message: string) => { const sha = nextSha(); commits.set(sha, { sha, tree, parents, message }); return sha; };
  let head = addCommit(addTree(new Map(Object.entries(initial))), [], 'initial');
  const filesOf = (sha: string) => trees.get(commits.get(sha)?.tree ?? '') ?? null;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const notFound = () => json({ message: 'Not Found' }, 404);

  function updateRef(body: Body): Response {
    if (pushesLeft > 0) {
      pushesLeft -= 1;
      head = addCommit(commits.get(head)?.tree ?? '', [head], 'concurrent push');
    }
    const target = commits.get(String(body?.sha));
    if (!target || target.parents[0] !== head) return json({ message: 'Update is not a fast forward' }, 422);
    head = target.sha;
    return json({ ref: 'refs/heads/main', object: { sha: head } });
  }

  function repoRoute(method: string, rest: string, url: URL, body: Body): Response {
    if (method === 'GET' && rest === '/git/ref/heads/main') return json({ ref: 'refs/heads/main', object: { sha: head, type: 'commit' } });
    const commitPath = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest);
    if (method === 'GET' && commitPath) {
      const c = commits.get(commitPath[1] ?? '');
      return c ? json({ sha: c.sha, tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })), message: c.message }) : notFound();
    }
    if (method === 'GET' && rest.startsWith('/contents/')) {
      const content = filesOf(url.searchParams.get('ref') ?? head)?.get(decodeURIComponent(rest.slice('/contents/'.length)));
      return content === undefined ? notFound() : new Response(content);
    }
    if (method === 'POST' && rest === '/git/trees') {
      const base = trees.get(String(body?.base_tree));
      if (!base) return json({ message: 'base_tree not found' }, 422);
      const entries = (body?.tree as { path: string; content: string }[] | undefined) ?? [];
      return json({ sha: addTree(new Map([...base, ...entries.map((e) => [e.path, e.content] as const)])) }, 201);
    }
    if (method === 'POST' && rest === '/git/commits') {
      if (!trees.has(String(body?.tree))) return json({ message: 'tree not found' }, 422);
      return json({ sha: addCommit(String(body?.tree), (body?.parents as string[] | undefined) ?? [], String(body?.message)) }, 201);
    }
    if (method === 'PATCH' && rest === '/git/refs/heads/main') return updateRef(body);
    return notFound();
  }

  return {
    async fetch(input, init) {
      const req = new Request(input, init);
      const url = new URL(req.url);
      log.push({ method: req.method, path: url.pathname });
      if (opts.failPath?.test(url.pathname)) return json({ message: 'boom' }, 500);
      const body: Body = req.method === 'GET' ? null : await req.json().catch(() => null);
      if (req.method === 'POST' && /^\/app\/installations\/[^/]+\/access_tokens$/.test(url.pathname)) {
        return json({ token: 'ghs_fake', expires_at: '2099-01-01T00:00:00Z' }, 201);
      }
      return url.pathname.startsWith(prefix) ? repoRoute(req.method, url.pathname.slice(prefix.length), url, body) : notFound();
    },
    head: () => head,
    fileAtHead: (path) => filesOf(head)?.get(path) ?? null,
    commits: () => [...commits.values()],
    requests: () => [...log],
  };
}
```

- [ ] **Step 7: 執行確認通過**

Run: `cd apps/worker && npx vitest run src/github && npx tsc --noEmit`
Expected: PASS（7 tests）；typecheck 0 errors。

- [ ] **Step 8: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): add GitHub App client with PKCS#1 key support and a fake GitHub"
```

---

### Task 6: 發佈流程與 API

**Files:**
- Create: `apps/worker/src/publish/runPublish.ts`、`apps/worker/src/routes/adminPublish.ts`
- Modify: `apps/worker/src/app.ts`
- Test: `apps/worker/src/routes/adminPublish.test.ts`、`apps/worker/src/routes/adminAccess.test.ts`（表格追加）

**Interfaces:**
- Consumes: `planPublish`、`taipeiDate`、`PublishValidationError`（core）；`ReviewRepo`（Task 3）；`createGithubClient`、`githubConfig`、`GithubError`、`createFakeGithub`（Task 5）；`envGuard`。
- Produces:
  - `runPublish(deps: { repos: Repos; github: () => Promise<GithubClient>; now: Date; userId: number }): Promise<PublishOutcome>`
  - `type PublishOutcome = { kind: 'nothing' } | { kind: 'busy' } | { kind: 'main_moved' } | { kind: 'done'; commitSha: string | null; applied: number; conflicts: number; superseded: number }`
  - `GET /api/v1/admin/publish` → `{ approved: number; mods: { modId; count }[]; statusChanges: { modId; status }[] }`
  - `POST /api/v1/admin/publish` → 200 `{ commitSha, applied, conflicts, superseded }`；400 `nothing_to_publish`；409 `publish_in_progress`／`main_moved`；422 `invalid_data`；502 `github_failed`

- [ ] **Step 1: 寫失敗測試**

`adminAccess.test.ts` 的 `ADMIN_ENDPOINTS` 追加：

```ts
  { method: 'GET', route: '/api/v1/admin/publish', path: '/api/v1/admin/publish', minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/publish', path: '/api/v1/admin/publish', body: {}, minRole: 'admin' },
```

```ts
// apps/worker/src/routes/adminPublish.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createFakeGithub, type FakeGithubOptions } from '../github/fakeGithub';
import { createD1Repos } from '../repo';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv } from '../testEnv';

const META = {
  modId: 'create', name: 'Create', aliases: [], summary: '機械動力。', authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  sourceVersions: [{ modVersion: '6.0.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] }],
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: ['原譯者'] },
  updatedAt: '2026-10-01',
};
const repoFiles = (meta: unknown = META): Record<string, string> => ({
  'data/mods/create/en_us.json': '{\n  "a": "Apple %s",\n  "b": "Banana"\n}\n',
  'data/mods/create/zh_tw.json': '{\n  "a": "蘋果 %s"\n}\n',
  'data/mods/create/mod.json': `${JSON.stringify(meta, null, 2)}\n`,
});

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

function setup(opts: FakeGithubOptions & { files?: Record<string, string> } = {}) {
  const fake = createFakeGithub(opts.files ?? repoFiles(), opts);
  const app = createApp(testDeps({ fetch: fake.fetch }));
  const publish = async (who: { id: number; sessionVersion: number }, envOver = {}) =>
    app.request('/api/v1/admin/publish', { method: 'POST', headers: await writeHeaders(who), body: '{}' }, testEnv({ DB: db, ...envOver }));
  return { fake, app, publish };
}

async function seedApproved(over: { key?: string; base?: string | null; proposed?: string; author?: string } = {}): Promise<number> {
  const repos = createD1Repos(db);
  const author = await createUser(db, 'contributor', over.author ?? '貢獻者');
  const s = await repos.suggestions.upsertPending({
    modId: 'create', key: over.key ?? 'a', baseTarget: over.base === undefined ? '蘋果 %s' : over.base, proposed: over.proposed ?? '紅蘋果 %s',
    note: null, formatWarning: false, authorUserId: author.id, authorHash: 'h', createdAt: TEST_NOW.toISOString(),
  });
  await repos.review.approve({ id: s.id, reviewerId: author.id, proposed: s.proposed, formatWarning: false, now: TEST_NOW.toISOString() });
  return s.id;
}

const statusOf = async (id: number) => (await createD1Repos(db).review.findById(id))?.status;

describe('POST /api/v1/admin/publish', () => {
  it('commits approved changes with credits and marks them published', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const { fake, publish } = setup();
    const res = await publish(admin);
    expect(res.status).toBe(200);
    const data = (await readJson<{ commitSha: string; applied: number }>(res)).data;
    expect(data).toMatchObject({ applied: 1, conflicts: 0, superseded: 0, commitSha: fake.head() });
    expect(fake.fileAtHead('data/mods/create/zh_tw.json')).toBe('{\n  "a": "紅蘋果 %s"\n}\n');
    const meta = JSON.parse(fake.fileAtHead('data/mods/create/mod.json') ?? '{}');
    expect(meta.translation.contributors).toEqual(['原譯者', '貢獻者']);
    expect(meta.updatedAt).toBe('2026-10-15');
    expect(fake.commits().at(-1)?.message).toContain('Mods: create (1)');
    expect(await statusOf(id)).toBe('published');
    expect(await db.prepare('SELECT commit_sha, suggestion_count FROM publish_batches').first()).toEqual({ commit_sha: fake.head(), suggestion_count: 1 });
  });

  it('skips conflicts without creating an empty commit', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved({ base: '別的譯文' });
    const { fake, publish } = setup();
    const before = fake.head();
    const data = (await readJson(await publish(admin))).data;
    expect(data).toMatchObject({ commitSha: null, applied: 0, conflicts: 1 });
    expect(fake.head()).toBe(before);
    expect(await statusOf(id)).toBe('conflict');
  });

  it('retries once when main moves and succeeds', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    const { fake, publish } = setup({ concurrentPushes: 1 });
    expect((await publish(admin)).status).toBe(200);
    expect(fake.fileAtHead('data/mods/create/zh_tw.json')).toContain('紅蘋果');
  });

  it('gives up after main moves twice and keeps everything approved', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const res = await setup({ concurrentPushes: 2 }).publish(admin);
    expect(res.status).toBe(409);
    expect((await readJson(res)).error.code).toBe('main_moved');
    expect(await statusOf(id)).toBe('approved');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first()).toEqual({ n: 0 });
  });

  it('refuses a second publish while one is running', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    await createD1Repos(db).review.acquirePublishLock(admin.id, TEST_NOW);
    const res = await setup().publish(admin);
    expect(res.status).toBe(409);
    expect((await readJson(res)).error.code).toBe('publish_in_progress');
  });

  it('reports GitHub failures as 502 and releases the lock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const res = await setup({ failPath: /\/git\/trees$/ }).publish(admin);
    expect(res.status).toBe(502);
    expect((await readJson(res)).error.code).toBe('github_failed');
    expect(await statusOf(id)).toBe('approved');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first()).toEqual({ n: 0 });
    vi.restoreAllMocks();
  });

  it('aborts the whole batch when the result fails validation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const { fake, publish } = setup({ files: repoFiles({ ...META, sourceVersions: [] }) });
    const before = fake.head();
    const res = await publish(admin);
    expect(res.status).toBe(422);
    expect((await readJson(res)).error.code).toBe('invalid_data');
    expect(fake.head()).toBe(before);
    expect(await statusOf(id)).toBe('approved');
    vi.restoreAllMocks();
  });

  it('publishes a status-only change', async () => {
    const admin = await createUser(db, 'admin');
    await createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: TEST_NOW.toISOString() });
    const { fake, publish } = setup();
    expect((await publish(admin)).status).toBe(200);
    expect(JSON.parse(fake.fileAtHead('data/mods/create/mod.json') ?? '{}').translation.status).toBe('reviewed');
    expect(await createD1Repos(db).review.listPendingStatusChanges()).toEqual([]);
  });

  it('returns 400 when there is nothing to publish and 500 when the App is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    expect((await readJson(await setup().publish(admin))).error.code).toBe('nothing_to_publish');
    const res = await setup().publish(admin, { GITHUB_APP_PRIVATE_KEY: '' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('GITHUB');
    vi.restoreAllMocks();
  });
});

describe('GET /api/v1/admin/publish', () => {
  it('summarizes approved changes and pending status changes', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    await seedApproved({ key: 'b', base: null, proposed: '香蕉', author: 'B' });
    await createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: TEST_NOW.toISOString() });
    const res = await setup().app.request('/api/v1/admin/publish', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson(res)).data).toEqual({ approved: 2, mods: [{ modId: 'create', count: 2 }], statusChanges: [{ modId: 'create', status: 'reviewed' }] });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/worker && npx vitest run src/routes/adminPublish.test.ts src/routes/adminAccess.test.ts`
Expected: FAIL（路由不存在）。

- [ ] **Step 3: 實作 runPublish**

```ts
// apps/worker/src/publish/runPublish.ts
import { planPublish, taipeiDate, type ApprovedChange, type ModFiles, type PublishPlan, type StatusChange } from '@mlf/core/review';
import type { GithubClient } from '../github/client';
import type { Repos } from '../repo/types';

export type PublishOutcome =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'main_moved' }
  | { readonly kind: 'done'; readonly commitSha: string | null; readonly applied: number; readonly conflicts: number; readonly superseded: number };

export interface PublishDeps {
  readonly repos: Repos;
  readonly github: () => Promise<GithubClient>;
  readonly now: Date;
  readonly userId: number;
}

type Attempt = { readonly kind: 'ready'; readonly plan: PublishPlan; readonly sha: string | null } | { readonly kind: 'moved' };

const MOD_FILES = ['en_us.json', 'zh_tw.json', 'mod.json'] as const;

async function readMod(gh: GithubClient, modId: string, ref: string): Promise<ModFiles | null> {
  const [en, zh, meta] = await Promise.all(MOD_FILES.map((f) => gh.readFile(`data/mods/${modId}/${f}`, ref)));
  return en != null && zh != null && meta != null ? { en, zh, meta } : null;
}

/** 讀檔（固定 base SHA）→ 套用 → 建 tree／commit → fast-forward；main 已前進時回 moved */
async function attempt(gh: GithubClient, changes: readonly ApprovedChange[], statusChanges: readonly StatusChange[], today: string): Promise<Attempt> {
  const base = await gh.mainSha();
  const modIds = [...new Set([...changes, ...statusChanges].map((c) => c.modId))].sort();
  const mods = Object.fromEntries(await Promise.all(modIds.map(async (id) => [id, await readMod(gh, id, base)] as const)));
  const plan = planPublish({ mods, changes, statusChanges, today });
  if (plan.files.length === 0) return { kind: 'ready', plan, sha: null };
  const tree = await gh.createTree(await gh.commitTree(base), plan.files);
  const commit = await gh.createCommit(plan.message, tree, base);
  return (await gh.fastForwardMain(commit)) === 'ok' ? { kind: 'ready', plan, sha: commit } : { kind: 'moved' };
}

const countOf = (plan: PublishPlan, outcome: string) => plan.results.filter((r) => r.outcome === outcome).length;

export async function runPublish(deps: PublishDeps): Promise<PublishOutcome> {
  const review = deps.repos.review;
  const [changes, statusChanges] = await Promise.all([review.listApprovedForPublish(), review.listPendingStatusChanges()]);
  if (changes.length === 0 && statusChanges.length === 0) return { kind: 'nothing' };
  const batchId = await review.acquirePublishLock(deps.userId, deps.now);
  if (batchId === null) return { kind: 'busy' };
  try {
    const gh = await deps.github();
    const today = taipeiDate(deps.now);
    const first = await attempt(gh, changes, statusChanges, today);
    const result = first.kind === 'moved' ? await attempt(gh, changes, statusChanges, today) : first;
    if (result.kind === 'moved') {
      await review.releasePublishLock(batchId);
      return { kind: 'main_moved' };
    }
    await review.completePublish({ batchId, commitSha: result.sha, results: result.plan.results, statusChangeIds: result.sha ? result.plan.appliedStatusChangeIds : [] });
    return { kind: 'done', commitSha: result.sha, applied: countOf(result.plan, 'applied'), conflicts: countOf(result.plan, 'conflict'), superseded: countOf(result.plan, 'superseded') };
  } catch (err) {
    await review.releasePublishLock(batchId);
    throw err;
  }
}
```

> 若 push 成功但 `completePublish` 寫 D1 失敗，catch 會釋放鎖並回 500；建議仍為 `approved`，下次發佈時 repo 值已等於建議 → 標 `superseded`，不會重複寫入。route 的 log 會記下錯誤供人工對帳。

- [ ] **Step 4: 實作路由**

```ts
// apps/worker/src/routes/adminPublish.ts
import type { Hono } from 'hono';
import { PublishValidationError } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { envGuard } from '../env';
import { createGithubClient, githubConfig, GithubError } from '../github/client';
import { fail, ok } from '../http';
import { runPublish, type PublishOutcome } from '../publish/runPublish';

function respond(c: Ctx, outcome: PublishOutcome): Response {
  switch (outcome.kind) {
    case 'nothing':
      return fail(c, 400, 'nothing_to_publish', '沒有可發佈的變更。');
    case 'busy':
      return fail(c, 409, 'publish_in_progress', '另一個發佈正在進行，請稍後再試。');
    case 'main_moved':
      return fail(c, 409, 'main_moved', 'main 分支同時有其他更新，未發佈任何變更，請稍後再試。');
    case 'done':
      return ok(c, { commitSha: outcome.commitSha, applied: outcome.applied, conflicts: outcome.conflicts, superseded: outcome.superseded });
  }
}

async function handlePublish(c: Ctx, deps: AppDeps): Promise<Response> {
  const user = c.get('user');
  if (!user) return fail(c, 401, 'login_required', '請先登入。');
  const now = deps.now();
  try {
    const outcome = await runPublish({ repos: c.get('repos'), github: () => createGithubClient(githubConfig(c.env, deps.fetch, now)), now, userId: user.id });
    return respond(c, outcome);
  } catch (err) {
    if (err instanceof PublishValidationError) {
      console.error('publish validation failed', err.modId, err.issues);
      return fail(c, 422, 'invalid_data', `模組 ${err.modId} 套用後資料驗證失敗，未發佈任何變更。`);
    }
    if (err instanceof GithubError) {
      console.error('publish github failed', err.status, err.endpoint);
      return fail(c, 502, 'github_failed', 'GitHub 連線失敗，未發佈任何變更。');
    }
    throw err;
  }
}

export function registerAdminPublishRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/publish', requirePermission('publish'), async (c) => {
    const review = c.get('repos').review;
    const [changes, statusChanges] = await Promise.all([review.listApprovedForPublish(), review.listPendingStatusChanges()]);
    const counts = changes.reduce<Record<string, number>>((acc, ch) => ({ ...acc, [ch.modId]: (acc[ch.modId] ?? 0) + 1 }), {});
    return ok(c, {
      approved: changes.length,
      mods: Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([modId, count]) => ({ modId, count })),
      statusChanges: statusChanges.map((s) => ({ modId: s.modId, status: s.status })),
    });
  });
  app.post('/api/v1/admin/publish', requireWrite, requirePermission('publish'), envGuard('githubApp'), (c) => handlePublish(c, deps));
}
```

`app.ts`：import 並於 `registerAdminReviewRoutes(app, deps);` 後加 `registerAdminPublishRoutes(app, deps);`。

- [ ] **Step 5: 執行確認通過**

Run: `cd apps/worker && npx vitest run && npx tsc --noEmit && npm run test:coverage`
Expected: PASS；coverage ≥ 80%。

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): publish approved changes to GitHub with retry and all-or-nothing semantics"
```

---

### Task 7: 管理頁 — API client、頁面骨架與審核佇列

**Files:**
- Create: `apps/site/src/admin/strings.ts`、`adminApi.ts`、`group.ts`、`modStrings.ts`、`testFetch.ts`、`AdminApp.tsx`、`ReviewQueue.tsx`、`SuggestionCard.tsx`、`DirectEditor.tsx`（本 Task 先放佔位元件，Task 8 完成）、`PublishPanel.tsx`、`UsersPanel.tsx`、`BlocksPanel.tsx`（後兩者與 PublishPanel 於 Task 9 完成）
- Create: `apps/site/src/pages/admin/index.astro`
- Modify: `apps/site/src/lib/siteMeta.ts`、`apps/site/src/lib/siteMeta.test.ts`
- Test: `apps/site/src/admin/review.test.tsx`

本 Task 為了讓 `AdminApp` 可編譯，另外三個面板與直接編輯先放只顯示標題的元件（Task 8、9 取代）：

```tsx
// apps/site/src/admin/DirectEditor.tsx
import type { FetchLike } from '../islands/api';
import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function DirectEditor(_props: { readonly api: AdminApi; readonly fetchImpl: FetchLike }) {
  return <p className="text-muted">{s.tabs.edit}</p>;
}
```

```tsx
// apps/site/src/admin/PublishPanel.tsx
import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function PublishPanel(_props: { readonly api: AdminApi }) {
  return <p className="text-muted">{s.tabs.publish}</p>;
}
```

```tsx
// apps/site/src/admin/UsersPanel.tsx
import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function UsersPanel(_props: { readonly api: AdminApi; readonly selfId: number }) {
  return <p className="text-muted">{s.tabs.users}</p>;
}
```

```tsx
// apps/site/src/admin/BlocksPanel.tsx
import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function BlocksPanel(_props: { readonly api: AdminApi }) {
  return <p className="text-muted">{s.tabs.blocks}</p>;
}
```

**Interfaces:**
- Consumes: `apiGet`、`apiSend`、`loadMe`、`resetMe`、`FetchLike`、`Me`（3B1 `islands/api.ts`）；Task 4、6 與 3B1 Task 9 的 API。
- Produces:
  - `createAdminApi(fetchImpl?): AdminApi`（方法：`listSuggestions(status, modId?)`、`approve(id, proposed?)`、`reject(id, reason?)`、`directEdit(modId, key, proposed)`、`setModStatus(modId, status)`、`publishSummary()`、`publish()`、`listUsers(q)`、`setRole(id, role)`、`setBanned(id, banned)`、`listBlocks()`、`addBlock(subject, reason?)`、`removeBlock(subject)`）
  - 型別 `AdminSuggestion`、`AdminUser`、`BlockRecord`、`PublishSummary`、`PublishResult`、`SuggestionStatus`
  - `groupSuggestions(list): { modId: string; keys: { key: string; items: AdminSuggestion[] }[] }[]`
  - `fetchModStrings(modId, fetchImpl): Promise<ModStrings | null>`、`useModStrings(modId, fetchImpl): ModStrings | null | 'loading'`、`clearModCache()`；`ModStrings = { en: Record<string, string>; zh: Record<string, string> }`
  - `routeFetch(routes, me?)`、`envelope(data)`、`failure(code, message, status?)`、`ADMIN_ME`、`REVIEWER_ME`（測試用）

- [ ] **Step 1: 文案與 API client**

```ts
// apps/site/src/admin/strings.ts
import type { PublishResult } from './adminApi';

export const s = {
  title: '管理後台',
  loading: '載入中…',
  loadFailed: '載入失敗，請稍後再試。',
  needLogin: '請先從右上角登入。',
  forbidden: '你沒有審核權限。',
  tabs: { review: '審核', edit: '直接編輯', publish: '發佈', users: '使用者', blocks: '封鎖' },
  status: { pending: '待審核', approved: '已核准', rejected: '已退回', superseded: '已取代', conflict: '衝突', published: '已發佈' },
  statusFilter: '狀態',
  modFilter: '模組 ID',
  apply: '套用',
  empty: '沒有符合的建議。',
  source: '原文',
  current: '目前譯文',
  base: '送出時譯文',
  note: '備註',
  anonymous: '匿名',
  formatWarning: '格式碼與原文不一致',
  approve: '核准',
  editApprove: '修改後核准',
  confirmApprove: '確認核准',
  reject: '退回',
  confirmReject: '確認退回',
  cancel: '取消',
  blockAuthor: '封鎖此來源',
  editLabel: '核准用譯文',
  reasonLabel: '退回理由（選填）',
  cardLabel: (id: number) => `建議 #${id}`,
  approved: '已核准。',
  rejected: '已退回。',
  blocked: '已封鎖此來源。',
  blockReason: (id: number) => `由建議 #${id} 封鎖`,
  modIdLabel: '要編輯的模組 ID',
  open: '開啟',
  search: '搜尋條目',
  saved: (key: string) => `已暫存 ${key}，發佈後生效。`,
  modStatus: '模組狀態',
  statusReviewed: '已校對',
  statusPartial: '部分完成',
  queueStatus: '排入發佈',
  statusQueued: '已排入下次發佈。',
  modNotFound: '找不到這個模組。',
  approvedCount: (n: number) => `已核准待發佈：${n} 條`,
  pendingStatus: '待發佈的模組狀態',
  publish: '發佈到 GitHub',
  publishing: '發佈中…',
  nothing: '目前沒有可發佈的變更。',
  published: (r: PublishResult) => (r.commitSha
    ? `已發佈 ${r.applied} 條（commit ${r.commitSha.slice(0, 7)}）；衝突 ${r.conflicts}、已取代 ${r.superseded}。約 2 分鐘後上線。`
    : `沒有可寫入的變更；衝突 ${r.conflicts}、已取代 ${r.superseded}。`),
  userSearch: '搜尋使用者',
  roleFor: (name: string) => `${name} 的角色`,
  roles: { admin: '管理員', reviewer: '審核者', contributor: '貢獻者' },
  ban: '停權',
  unban: '解除停權',
  self: '（你）',
  subject: '主體（ip:… 或 user:…）',
  reason: '理由（選填）',
  addBlock: '新增封鎖',
  removeBlock: (subject: string) => `解除封鎖 ${subject}`,
  unblock: '解除封鎖',
  noBlocks: '目前沒有封鎖。',
} as const;
```

```ts
// apps/site/src/admin/adminApi.ts
import { apiGet, apiSend, type ApiResult, type FetchLike } from '../islands/api';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'superseded' | 'conflict' | 'published';
export type Role = 'admin' | 'reviewer' | 'contributor';

export interface AdminSuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly status: SuggestionStatus;
  readonly authorUserId: number | null;
  readonly authorName: string | null;
  readonly authorSubject: string;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface AdminUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: Role;
  readonly banned: boolean;
  readonly isPublic: boolean;
  readonly createdAt: string;
  readonly identities: readonly { readonly provider: string; readonly username: string | null }[];
}

export interface BlockRecord {
  readonly subject: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface PublishSummary {
  readonly approved: number;
  readonly mods: readonly { readonly modId: string; readonly count: number }[];
  readonly statusChanges: readonly { readonly modId: string; readonly status: string }[];
}

export interface PublishResult {
  readonly commitSha: string | null;
  readonly applied: number;
  readonly conflicts: number;
  readonly superseded: number;
}

const query = (params: Record<string, string | undefined>): string =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')).toString();

export function createAdminApi(fetchImpl: FetchLike = fetch) {
  return {
    listSuggestions: (status: SuggestionStatus, modId?: string) =>
      apiGet<{ suggestions: AdminSuggestion[] }>(`/api/v1/admin/suggestions?${query({ status, modId })}`, fetchImpl),
    approve: (id: number, proposed?: string): Promise<ApiResult<{ id: number }>> =>
      apiSend(`/api/v1/admin/suggestions/${id}/approve`, 'POST', proposed === undefined ? {} : { proposed }, fetchImpl),
    reject: (id: number, reason?: string): Promise<ApiResult<{ id: number }>> =>
      apiSend(`/api/v1/admin/suggestions/${id}/reject`, 'POST', reason ? { reason } : {}, fetchImpl),
    directEdit: (modId: string, key: string, proposed: string) =>
      apiSend<{ id: number; formatWarning: boolean }>('/api/v1/admin/edits', 'POST', { modId, key, proposed }, fetchImpl),
    setModStatus: (modId: string, status: 'partial' | 'reviewed') =>
      apiSend<{ id: number }>(`/api/v1/admin/mods/${encodeURIComponent(modId)}/status`, 'POST', { status }, fetchImpl),
    publishSummary: () => apiGet<PublishSummary>('/api/v1/admin/publish', fetchImpl),
    publish: () => apiSend<PublishResult>('/api/v1/admin/publish', 'POST', {}, fetchImpl),
    listUsers: (q: string) => apiGet<{ users: AdminUser[] }>(`/api/v1/admin/users?${query({ q })}`, fetchImpl),
    setRole: (id: number, role: Role) => apiSend<{ id: number; role: Role }>(`/api/v1/admin/users/${id}/role`, 'POST', { role }, fetchImpl),
    setBanned: (id: number, banned: boolean) => apiSend<{ id: number; banned: boolean }>(`/api/v1/admin/users/${id}/ban`, 'POST', { banned }, fetchImpl),
    listBlocks: () => apiGet<{ blocks: BlockRecord[] }>('/api/v1/admin/blocks', fetchImpl),
    addBlock: (subject: string, reason?: string) =>
      apiSend<{ subject: string }>('/api/v1/admin/blocks', 'POST', reason ? { subject, reason } : { subject }, fetchImpl),
    removeBlock: (subject: string) => apiSend<{ removed: boolean }>(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', undefined, fetchImpl),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
```

```ts
// apps/site/src/admin/group.ts
import type { AdminSuggestion } from './adminApi';

export interface KeyGroup {
  readonly key: string;
  readonly items: readonly AdminSuggestion[];
}

export interface ModGroup {
  readonly modId: string;
  readonly keys: readonly KeyGroup[];
}

/** 依模組、再依 key 分組（保持 API 回傳順序） */
export function groupSuggestions(list: readonly AdminSuggestion[]): ModGroup[] {
  const modIds = [...new Set(list.map((x) => x.modId))];
  return modIds.map((modId) => {
    const inMod = list.filter((x) => x.modId === modId);
    const keys = [...new Set(inMod.map((x) => x.key))];
    return { modId, keys: keys.map((key) => ({ key, items: inMod.filter((x) => x.key === key) })) };
  });
}
```

```ts
// apps/site/src/admin/modStrings.ts
import { useEffect, useState } from 'react';
import type { FetchLike } from '../islands/api';

export interface ModStrings {
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

const cache = new Map<string, Promise<ModStrings | null>>();

export function clearModCache(): void {
  cache.clear();
}

/** 讀取已部署的 /api/v1/mods/<id>.json（原文與目前譯文）；失敗回 null，且不快取失敗 */
export function fetchModStrings(modId: string, fetchImpl: FetchLike): Promise<ModStrings | null> {
  const hit = cache.get(modId);
  if (hit) return hit;
  const pending = fetchImpl(`/api/v1/mods/${encodeURIComponent(modId)}.json`)
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { en_us?: Record<string, string>; zh_tw?: Record<string, string> };
      return body.en_us && body.zh_tw ? { en: body.en_us, zh: body.zh_tw } : null;
    })
    .catch(() => null)
    .then((value) => {
      if (value === null) cache.delete(modId);
      return value;
    });
  cache.set(modId, pending);
  return pending;
}

export function useModStrings(modId: string, fetchImpl: FetchLike): ModStrings | null | 'loading' {
  const [state, setState] = useState<{ modId: string; value: ModStrings | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchModStrings(modId, fetchImpl).then((value) => { if (alive) setState({ modId, value }); });
    return () => { alive = false; };
  }, [modId, fetchImpl]);
  return state?.modId === modId ? state.value : 'loading';
}

export function ownString(record: Readonly<Record<string, string>>, key: string): string | null {
  return Object.hasOwn(record, key) ? record[key] ?? null : null;
}
```

```ts
// apps/site/src/admin/testFetch.ts（僅測試使用）
import { vi } from 'vitest';

type Handler = (url: string, init?: RequestInit) => unknown;
type Reply = { ok: boolean; status: number; json(): Promise<unknown> };

export const envelope = (data: unknown): Reply => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
export const failure = (code: string, message: string, status = 400): Reply => ({ ok: false, status, json: async () => ({ ok: false, error: { code, message } }) });

export const ADMIN_ME = { user: { id: 1, displayName: '管理員', role: 'admin', identities: [] }, csrfToken: 'csrf' };
export const REVIEWER_ME = { user: { id: 2, displayName: '審核者', role: 'reviewer', identities: [] }, csrfToken: 'csrf' };

const isReply = (v: unknown): v is Reply => typeof v === 'object' && v !== null && 'json' in v && 'status' in v;

/** 依 `METHOD /path`（不含 query）路由；未列出的路徑回 404 envelope；/api/v1/me 回傳 me */
export function routeFetch(routes: Readonly<Record<string, Handler>>, me: unknown = ADMIN_ME) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Reply> => {
    const path = url.split('?')[0] ?? url;
    if (path === '/api/v1/me') return envelope(me);
    const route = `${init?.method ?? 'GET'} ${path}`;
    if (!Object.hasOwn(routes, route)) return failure('not_found', `no route ${route}`, 404);
    const result = routes[route]?.(url, init);
    return isReply(result) ? result : envelope(result);
  });
}
```

- [ ] **Step 2: 寫失敗測試**

```tsx
// apps/site/src/admin/review.test.tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import AdminApp from './AdminApp';
import type { AdminSuggestion } from './adminApi';
import { groupSuggestions } from './group';
import { clearModCache } from './modStrings';
import { ADMIN_ME, failure, REVIEWER_ME, routeFetch } from './testFetch';

const item = (over: Partial<AdminSuggestion> = {}): AdminSuggestion => ({
  id: 1, modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', note: '更自然', formatWarning: false, status: 'pending',
  authorUserId: null, authorName: null, authorSubject: `ip:${'a'.repeat(64)}`, reviewNote: null, createdAt: '2026-10-15T00:00:00.000Z', reviewedAt: null, ...over,
});
const MOD = { en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' } };

beforeEach(() => {
  resetMe();
  clearModCache();
});

describe('groupSuggestions', () => {
  it('groups by mod then key, keeping order', () => {
    const groups = groupSuggestions([item(), item({ id: 2 }), item({ id: 3, key: 'b' }), item({ id: 4, modId: 'jei' })]);
    expect(groups.map((g) => [g.modId, g.keys.map((k) => [k.key, k.items.map((x) => x.id)])])).toEqual([
      ['create', [['a', [1, 2]], ['b', [3]]]],
      ['jei', [['a', [4]]]],
    ]);
  });
});

describe('AdminApp access', () => {
  it.each([
    [{ user: null, csrfToken: 'c' }, '請先從右上角登入。'],
    [{ user: { id: 3, displayName: 'C', role: 'contributor', identities: [] }, csrfToken: 'c' }, '你沒有審核權限。'],
  ])('blocks %j', async (me, text) => {
    render(<AdminApp fetchImpl={routeFetch({}, me) as never} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows only review tabs to reviewers and all tabs to admins', async () => {
    const routes = { 'GET /api/v1/admin/suggestions': () => ({ suggestions: [] }) };
    const { unmount } = render(<AdminApp fetchImpl={routeFetch(routes, REVIEWER_ME) as never} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['審核', '直接編輯']);
    unmount();
    resetMe();
    render(<AdminApp fetchImpl={routeFetch(routes, ADMIN_ME) as never} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['審核', '直接編輯', '發佈', '使用者', '封鎖']);
  });
});

describe('ReviewQueue', () => {
  function mount(list: AdminSuggestion[], extra: Record<string, (url: string, init?: RequestInit) => unknown> = {}) {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/suggestions': () => ({ suggestions: list }),
      'GET /api/v1/mods/create.json': () => ({ ok: true, status: 200, json: async () => MOD }),
      ...extra,
    });
    render(<AdminApp fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  it('groups suggestions for the same key side by side with the source text', async () => {
    mount([item(), item({ id: 2, proposed: '青蘋果', authorName: 'Alice' })]);
    expect(await screen.findByRole('heading', { name: /create/ })).toBeInTheDocument();
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => c.querySelector('p')?.textContent)).toEqual(['紅蘋果', '青蘋果']);
    expect(within(cards[1]!).getByText(/Alice/)).toBeInTheDocument();
  });

  it('approves, then reloads the queue', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/approve': () => ({ id: 1 }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '核准' }));
    expect(await screen.findByText('已核准。')).toBeInTheDocument();
    const approve = fetchImpl.mock.calls.find(([u]) => u.endsWith('/approve'));
    expect(approve?.[1]).toMatchObject({ method: 'POST', body: '{}', headers: { 'X-CSRF-Token': 'csrf' } });
    expect(fetchImpl.mock.calls.filter(([u]) => u.startsWith('/api/v1/admin/suggestions?')).length).toBeGreaterThanOrEqual(2);
  });

  it('approves an edited text', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/approve': () => ({ id: 1 }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '修改後核准' }));
    const box = within(card).getByLabelText('核准用譯文');
    await userEvent.clear(box);
    await userEvent.type(box, '大紅蘋果');
    await userEvent.click(within(card).getByRole('button', { name: '確認核准' }));
    const approve = fetchImpl.mock.calls.find(([u]) => u.endsWith('/approve'));
    expect(approve?.[1]?.body).toBe('{"proposed":"大紅蘋果"}');
  });

  it('rejects with a reason and shows server errors', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/reject': () => failure('not_pending', '這條建議已被處理。', 409) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '退回' }));
    await userEvent.type(within(card).getByLabelText('退回理由（選填）'), '用詞不一致');
    await userEvent.click(within(card).getByRole('button', { name: '確認退回' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('這條建議已被處理。');
    expect(fetchImpl.mock.calls.find(([u]) => u.endsWith('/reject'))?.[1]?.body).toBe('{"reason":"用詞不一致"}');
  });

  it('lets admins block the author subject', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/blocks': () => ({ subject: 'x' }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '封鎖此來源' }));
    expect(JSON.parse(String(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/blocks')?.[1]?.body))).toEqual({ subject: `ip:${'a'.repeat(64)}`, reason: '由建議 #1 封鎖' });
  });

  it('filters by status and mod', async () => {
    const fetchImpl = mount([]);
    expect(await screen.findByText('沒有符合的建議。')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('狀態'), 'conflict');
    await userEvent.type(screen.getByLabelText('模組 ID'), 'jei');
    await userEvent.click(screen.getByRole('button', { name: '套用' }));
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/suggestions?status=conflict&modId=jei')).toBe(true);
  });
});
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/admin`
Expected: FAIL（`./AdminApp` 等不存在）。

- [ ] **Step 4: 實作 AdminApp、ReviewQueue、SuggestionCard**

```tsx
// apps/site/src/admin/AdminApp.tsx
import { useEffect, useMemo, useState } from 'react';
import { loadMe, type FetchLike, type Me } from '../islands/api';
import { createAdminApi } from './adminApi';
import BlocksPanel from './BlocksPanel';
import DirectEditor from './DirectEditor';
import PublishPanel from './PublishPanel';
import ReviewQueue from './ReviewQueue';
import { s } from './strings';
import UsersPanel from './UsersPanel';

type Tab = keyof typeof s.tabs;
const TABS: readonly { readonly id: Tab; readonly adminOnly: boolean }[] = [
  { id: 'review', adminOnly: false },
  { id: 'edit', adminOnly: false },
  { id: 'publish', adminOnly: true },
  { id: 'users', adminOnly: true },
  { id: 'blocks', adminOnly: true },
];

export default function AdminApp({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const api = useMemo(() => createAdminApi(fetchImpl), [fetchImpl]);
  const [me, setMe] = useState<Me | 'error' | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  useEffect(() => {
    void loadMe(fetchImpl).then((r) => setMe(r.ok ? r.data : 'error'));
  }, [fetchImpl]);

  if (me === null) return <p className="text-muted">{s.loading}</p>;
  if (me === 'error') return <p role="alert" className="text-danger">{s.loadFailed}</p>;
  if (!me.user) return <p>{s.needLogin}</p>;
  if (me.user.role === 'contributor') return <p>{s.forbidden}</p>;
  const isAdmin = me.user.role === 'admin';
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div>
      <div role="tablist" aria-label={s.title} className="mb-4 flex flex-wrap gap-2 border-b-2 border-line">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className="min-h-11 px-3 text-muted aria-selected:font-semibold aria-selected:text-fg" onClick={() => setTab(t.id)}>
            {s.tabs[t.id]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={s.tabs[tab]}>
        {tab === 'review' && <ReviewQueue api={api} fetchImpl={fetchImpl} isAdmin={isAdmin} />}
        {tab === 'edit' && <DirectEditor api={api} fetchImpl={fetchImpl} />}
        {tab === 'publish' && isAdmin && <PublishPanel api={api} />}
        {tab === 'users' && isAdmin && <UsersPanel api={api} selfId={me.user.id} />}
        {tab === 'blocks' && isAdmin && <BlocksPanel api={api} />}
      </div>
    </div>
  );
}
```

```tsx
// apps/site/src/admin/SuggestionCard.tsx
import { useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, AdminSuggestion } from './adminApi';
import { s } from './strings';

interface Props {
  readonly item: AdminSuggestion;
  readonly api: AdminApi;
  readonly isAdmin: boolean;
  readonly onDone: (message: string) => void;
}

type Mode = 'view' | 'edit' | 'reject';
const REJECTABLE: readonly AdminSuggestion['status'][] = ['pending', 'approved', 'conflict'];

export default function SuggestionCard({ item, api, isAdmin, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const [text, setText] = useState(item.proposed);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<ApiResult<unknown>>, message: string) => {
    setError(null);
    const result = await action();
    if (result.ok) onDone(message);
    else setError(result.message);
  };

  return (
    <article aria-label={s.cardLabel(item.id)} className="flex flex-col gap-1 rounded-sm border-2 border-line bg-surface p-3">
      <p className="whitespace-pre-wrap">{item.proposed}</p>
      {item.formatWarning && <p className="text-xs text-warn">{s.formatWarning}</p>}
      {item.note && <p className="text-xs text-muted">{s.note}：{item.note}</p>}
      <p className="text-xs text-muted">{s.base}：{item.baseTarget ?? '—'}</p>
      <p className="text-xs text-muted">{item.authorName ?? s.anonymous} · {item.createdAt.slice(0, 10)} · {s.status[item.status]}</p>
      {item.reviewNote && <p className="text-xs text-muted">{item.reviewNote}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {mode === 'view' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === 'pending' && <button type="button" className="btn btn-primary" onClick={() => void run(() => api.approve(item.id), s.approved)}>{s.approve}</button>}
          {item.status === 'pending' && <button type="button" className="btn" onClick={() => setMode('edit')}>{s.editApprove}</button>}
          {REJECTABLE.includes(item.status) && <button type="button" className="btn" onClick={() => setMode('reject')}>{s.reject}</button>}
          {isAdmin && <button type="button" className="btn" onClick={() => void run(() => api.addBlock(item.authorSubject, s.blockReason(item.id)), s.blocked)}>{s.blockAuthor}</button>}
        </div>
      )}
      {mode === 'edit' && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea className="input min-h-20" aria-label={s.editLabel} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void run(() => api.approve(item.id, text), s.approved)}>{s.confirmApprove}</button>
            <button type="button" className="btn" onClick={() => setMode('view')}>{s.cancel}</button>
          </div>
        </div>
      )}
      {mode === 'reject' && (
        <div className="mt-2 flex flex-col gap-2">
          <input className="input" aria-label={s.reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => void run(() => api.reject(item.id, reason.trim() || undefined), s.rejected)}>{s.confirmReject}</button>
            <button type="button" className="btn" onClick={() => setMode('view')}>{s.cancel}</button>
          </div>
        </div>
      )}
    </article>
  );
}
```

```tsx
// apps/site/src/admin/ReviewQueue.tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { FetchLike } from '../islands/api';
import type { AdminApi, AdminSuggestion, SuggestionStatus } from './adminApi';
import { groupSuggestions, type KeyGroup } from './group';
import { ownString, useModStrings } from './modStrings';
import { s } from './strings';
import SuggestionCard from './SuggestionCard';

interface Props {
  readonly api: AdminApi;
  readonly fetchImpl: FetchLike;
  readonly isAdmin: boolean;
}

const STATUSES = Object.keys(s.status) as SuggestionStatus[];

function KeyBlock({ modId, group, fetchImpl, children }: { readonly modId: string; readonly group: KeyGroup; readonly fetchImpl: FetchLike; readonly children: ReactNode }) {
  const strings = useModStrings(modId, fetchImpl);
  const loaded = strings !== 'loading' && strings !== null ? strings : null;
  return (
    <div className="mb-4">
      <p className="text-xs text-muted"><code>{group.key}</code></p>
      <p><span className="text-xs text-muted">{s.source}：</span><span>{loaded ? ownString(loaded.en, group.key) ?? '—' : '…'}</span></p>
      <p><span className="text-xs text-muted">{s.current}：</span><span>{loaded ? ownString(loaded.zh, group.key) ?? '—' : '…'}</span></p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

export default function ReviewQueue({ api, fetchImpl, isAdmin }: Props) {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const [modInput, setModInput] = useState('');
  const [filter, setFilter] = useState<{ status: SuggestionStatus; modId: string }>({ status: 'pending', modId: '' });
  const [list, setList] = useState<readonly AdminSuggestion[] | 'loading' | 'error'>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await api.listSuggestions(filter.status, filter.modId || undefined);
    setList(result.ok ? result.data.suggestions : 'error');
  }, [api, filter]);
  useEffect(() => { void reload(); }, [reload]);

  const onDone = (message: string) => {
    setNotice(message);
    void reload();
  };

  return (
    <div>
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setFilter({ status, modId: modInput.trim() }); }}>
        <label className="flex flex-col text-sm">{s.statusFilter}
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SuggestionStatus)}>
            {STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">{s.modFilter}
          <input className="input" value={modInput} onChange={(e) => setModInput(e.target.value)} />
        </label>
        <button type="submit" className="btn">{s.apply}</button>
      </form>
      {notice && <p role="status" className="mb-2 text-sm">{notice}</p>}
      {list === 'loading' && <p className="text-muted">{s.loading}</p>}
      {list === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof list !== 'string' && list.length === 0 && <p className="text-muted">{s.empty}</p>}
      {typeof list !== 'string' && groupSuggestions(list).map((g) => (
        <section key={g.modId} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{g.modId}</h2>
          {g.keys.map((k) => (
            <KeyBlock key={k.key} modId={g.modId} group={k} fetchImpl={fetchImpl}>
              {k.items.map((x) => <SuggestionCard key={x.id} item={x} api={api} isAdmin={isAdmin} onDone={onDone} />)}
            </KeyBlock>
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 頁面與 noindex**

```astro
---
// apps/site/src/pages/admin/index.astro
import BaseLayout from '../../layouts/BaseLayout.astro';
import AdminApp from '../../admin/AdminApp';
import { SITE_SHORT_NAME, SUGGEST_ENABLED } from '../../lib/config';
---

<BaseLayout title={`管理後台 | ${SITE_SHORT_NAME}`} description="ModLangForge 審核與發佈後台。" noindex>
  <h1 class="mb-4 text-2xl font-bold">管理後台</h1>
  {SUGGEST_ENABLED ? <AdminApp client:only="react" /> : <p>此網站未啟用社群建議功能。</p>}
</BaseLayout>
```

`siteMeta.ts`：`NOINDEX_PATHS` 改為 `['/pack/', '/404/', '/admin/']`；`siteMeta.test.ts` 追加 `expect(isSitemapPage('https://example.org/admin/')).toBe(false);`。

- [ ] **Step 6: 執行確認通過**

Run: `cd apps/site && npx vitest run && npx astro check`
Expected: PASS；astro check 0 errors。

- [ ] **Step 7: Commit**

```bash
git add apps/site
git commit -m "feat(site): add admin page with grouped review queue"
```

---

### Task 8: 直接編輯（虛擬捲動全表）與模組狀態

**Files:**
- Modify: `apps/site/src/admin/DirectEditor.tsx`（取代佔位）
- Create: `apps/site/src/admin/editorHits.ts`
- Test: `apps/site/src/admin/editor.test.tsx`

**Interfaces:**
- Consumes: `TranslationTable`（`apps/site/src/translator/ui/TranslationTable.tsx`，props `hits`、`showModId`、`showReference`、`onCommit(modId, key, target)`）、`SearchHit`（`translator/ui/filterEntries.ts`）、`fetchModStrings`、`ownString`、`AdminApi.directEdit`、`AdminApi.listSuggestions('approved', modId)`、`AdminApi.setModStatus`。
- Produces: `buildHits(modId, strings: ModStrings, overrides: Readonly<Record<string, string>>, query: string): SearchHit[]`；`latestApproved(list: readonly AdminSuggestion[]): Record<string, string>`

- [ ] **Step 1: 寫失敗測試**

```tsx
// apps/site/src/admin/editor.test.tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { createAdminApi } from './adminApi';
import DirectEditor from './DirectEditor';
import { buildHits, latestApproved } from './editorHits';
import { clearModCache } from './modStrings';
import { failure, routeFetch } from './testFetch';

const strings = { en: { a: 'Apple', b: 'Banana', constructor: 'Ctor' }, zh: { a: '蘋果' } };

beforeEach(() => {
  resetMe();
  clearModCache();
});

describe('buildHits', () => {
  it('overlays approved edits and never reads prototype properties', () => {
    const hits = buildHits('create', strings, { b: '香蕉' }, '');
    expect(hits.map((h) => [h.entry.key, h.entry.target, h.entry.status])).toEqual([
      ['a', '蘋果', 'translated'],
      ['b', '香蕉', 'translated'],
      ['constructor', '', 'untranslated'],
    ]);
  });

  it('filters by key, source or target', () => {
    expect(buildHits('create', strings, {}, 'banan').map((h) => h.entry.key)).toEqual(['b']);
    expect(buildHits('create', strings, {}, '蘋').map((h) => h.entry.key)).toEqual(['a']);
  });

  it('keeps the latest approved text per key', () => {
    const base = { modId: 'create', baseTarget: null, note: null, formatWarning: false, status: 'approved' as const, authorUserId: null, authorName: null, authorSubject: 'ip:x', reviewNote: null, createdAt: '', reviewedAt: '' };
    expect(latestApproved([{ ...base, id: 1, key: 'a', proposed: '舊' }, { ...base, id: 2, key: 'a', proposed: '新' }])).toEqual({ a: '新' });
  });
});

describe('DirectEditor', () => {
  function mount(extra: Record<string, (url: string, init?: RequestInit) => unknown> = {}) {
    const fetchImpl = routeFetch({
      'GET /api/v1/mods/create.json': () => ({ ok: true, status: 200, json: async () => ({ en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' } }) }),
      'GET /api/v1/admin/suggestions': () => ({ suggestions: [] }),
      'POST /api/v1/admin/edits': () => ({ id: 9, formatWarning: false }),
      'POST /api/v1/admin/mods/create/status': () => ({ id: 3 }),
      ...extra,
    });
    render(<DirectEditor api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  async function open() {
    await userEvent.type(screen.getByLabelText('要編輯的模組 ID'), 'create');
    await userEvent.click(screen.getByRole('button', { name: '開啟' }));
  }

  it('saves an edit as a direct edit', async () => {
    const fetchImpl = mount();
    await open();
    const box = await screen.findByLabelText('譯文 (zh_tw) b');
    await userEvent.type(box, '香蕉');
    await userEvent.tab();
    expect(await screen.findByText('已暫存 b，發佈後生效。')).toBeInTheDocument();
    const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/edits');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ modId: 'create', key: 'b', proposed: '香蕉' });
  });

  it('shows server errors for rejected edits', async () => {
    mount({ 'POST /api/v1/admin/edits': () => failure('empty', '譯文不能是空白。') });
    await open();
    const box = await screen.findByLabelText('譯文 (zh_tw) a');
    await userEvent.clear(box);
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('譯文不能是空白。');
  });

  it('reports an unknown mod', async () => {
    mount({ 'GET /api/v1/mods/create.json': () => ({ ok: false, status: 404, json: async () => ({}) }) });
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個模組。');
  });

  it('queues a mod status change', async () => {
    const fetchImpl = mount();
    await open();
    await userEvent.selectOptions(await screen.findByLabelText('模組狀態'), 'partial');
    await userEvent.click(screen.getByRole('button', { name: '排入發佈' }));
    expect(await screen.findByText('已排入下次發佈。')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/mods/create/status')?.[1]?.body).toBe('{"status":"partial"}');
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/admin/editor.test.tsx`
Expected: FAIL（`./editorHits` 不存在；佔位元件沒有輸入框）。

- [ ] **Step 3: 實作**

```ts
// apps/site/src/admin/editorHits.ts
import type { SearchHit } from '../translator/ui/filterEntries';
import type { AdminSuggestion } from './adminApi';
import { ownString, type ModStrings } from './modStrings';

/** 依原文順序建立翻譯表列；已核准未發佈的內容覆蓋目前譯文 */
export function buildHits(modId: string, strings: ModStrings, overrides: Readonly<Record<string, string>>, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  return Object.keys(strings.en)
    .map((key): SearchHit => {
      const target = ownString(overrides, key) ?? ownString(strings.zh, key) ?? '';
      return { modId, entry: { key, source: ownString(strings.en, key) ?? '', target, status: target === '' ? 'untranslated' : 'translated' } };
    })
    .filter((h) => q === '' || [h.entry.key, h.entry.source, h.entry.target].some((x) => x.toLowerCase().includes(q)));
}

/** id 較大者為較新的核准 */
export function latestApproved(list: readonly AdminSuggestion[]): Record<string, string> {
  return Object.fromEntries([...list].sort((a, b) => a.id - b.id).map((x) => [x.key, x.proposed]));
}
```

```tsx
// apps/site/src/admin/DirectEditor.tsx
import { useMemo, useState } from 'react';
import type { FetchLike } from '../islands/api';
import { TranslationTable } from '../translator/ui/TranslationTable';
import type { AdminApi } from './adminApi';
import { buildHits, latestApproved } from './editorHits';
import { fetchModStrings, type ModStrings } from './modStrings';
import { s } from './strings';

interface Props {
  readonly api: AdminApi;
  readonly fetchImpl: FetchLike;
}

type Loaded = { readonly modId: string; readonly strings: ModStrings };
type Message = { readonly kind: 'ok' | 'error'; readonly text: string };

function ModStatusControl({ api, modId }: { readonly api: AdminApi; readonly modId: string }) {
  const [status, setStatus] = useState<'partial' | 'reviewed'>('reviewed');
  const [message, setMessage] = useState<string | null>(null);
  const queue = async () => {
    const result = await api.setModStatus(modId, status);
    setMessage(result.ok ? s.statusQueued : result.message);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-sm">{s.modStatus}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'partial' | 'reviewed')}>
          <option value="reviewed">{s.statusReviewed}</option>
          <option value="partial">{s.statusPartial}</option>
        </select>
      </label>
      <button type="button" className="btn" onClick={() => void queue()}>{s.queueStatus}</button>
      {message && <span role="status" className="text-sm">{message}</span>}
    </div>
  );
}

export default function DirectEditor({ api, fetchImpl }: Props) {
  const [modInput, setModInput] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [overrides, setOverrides] = useState<Readonly<Record<string, string>>>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<Message | null>(null);

  const open = async () => {
    const modId = modInput.trim();
    setMessage(null);
    const [strings, approved] = await Promise.all([fetchModStrings(modId, fetchImpl), api.listSuggestions('approved', modId)]);
    if (!strings) {
      setLoaded(null);
      setMessage({ kind: 'error', text: s.modNotFound });
      return;
    }
    setOverrides(approved.ok ? latestApproved(approved.data.suggestions) : {});
    setLoaded({ modId, strings });
  };

  const onCommit = async (modId: string, key: string, target: string) => {
    const result = await api.directEdit(modId, key, target);
    if (result.ok) {
      setOverrides((prev) => ({ ...prev, [key]: target }));
      setMessage({ kind: 'ok', text: s.saved(key) });
    } else {
      setMessage({ kind: 'error', text: result.message });
    }
  };

  const hits = useMemo(() => (loaded ? buildHits(loaded.modId, loaded.strings, overrides, query) : []), [loaded, overrides, query]);

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void open(); }}>
        <label className="flex flex-col text-sm">{s.modIdLabel}
          <input className="input" value={modInput} onChange={(e) => setModInput(e.target.value)} />
        </label>
        <button type="submit" className="btn">{s.open}</button>
      </form>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-danger' : 'text-sm'}>{message.text}</p>}
      {loaded && (
        <>
          <ModStatusControl api={api} modId={loaded.modId} />
          <input className="input" aria-label={s.search} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex h-[70vh] flex-col rounded-sm border-2 border-line">
            <TranslationTable hits={hits} showModId={false} showReference={false} onCommit={(m, k, v) => void onCommit(m, k, v)} />
          </div>
        </>
      )}
    </div>
  );
}
```

> 列的 textarea 無障礙名稱為 `${t.table.target} ${key}`（翻譯工具既有：`譯文 (zh_tw) <key>`），測試據此尋找。若 `feat/site-redesign` 改了 `t.table.target` 文字，測試的 label 跟著調整。

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run src/admin && npx astro check`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/admin
git commit -m "feat(site): add virtualized direct editor and mod status control"
```

---

### Task 9: 發佈、使用者、封鎖面板

**Files:**
- Modify: `apps/site/src/admin/PublishPanel.tsx`、`UsersPanel.tsx`、`BlocksPanel.tsx`（取代佔位）
- Test: `apps/site/src/admin/panels.test.tsx`

**Interfaces:**
- Consumes: `AdminApi`（Task 7）。

- [ ] **Step 1: 寫失敗測試**

```tsx
// apps/site/src/admin/panels.test.tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { createAdminApi } from './adminApi';
import BlocksPanel from './BlocksPanel';
import PublishPanel from './PublishPanel';
import { failure, routeFetch } from './testFetch';
import UsersPanel from './UsersPanel';

beforeEach(() => resetMe());

describe('PublishPanel', () => {
  it('shows the summary, publishes and reports the commit', async () => {
    let published = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => (published
        ? { approved: 0, mods: [], statusChanges: [] }
        : { approved: 2, mods: [{ modId: 'create', count: 2 }], statusChanges: [{ modId: 'create', status: 'reviewed' }] }),
      'POST /api/v1/admin/publish': () => { published = true; return { commitSha: 'abcdef1234', applied: 2, conflicts: 0, superseded: 0 }; },
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    expect(await screen.findByText('已核准待發佈：2 條')).toBeInTheDocument();
    expect(screen.getByText(/create → reviewed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '發佈到 GitHub' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已發佈 2 條（commit abcdef1）');
    expect(await screen.findByText('目前沒有可發佈的變更。')).toBeInTheDocument();
  });

  it('shows publish errors', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => ({ approved: 1, mods: [{ modId: 'create', count: 1 }], statusChanges: [] }),
      'POST /api/v1/admin/publish': () => failure('main_moved', 'main 分支同時有其他更新，未發佈任何變更，請稍後再試。', 409),
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '發佈到 GitHub' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('main 分支');
  });
});

describe('UsersPanel', () => {
  const users = [
    { id: 1, displayName: '管理員', role: 'admin', banned: false, isPublic: true, createdAt: '', identities: [{ provider: 'github', username: 'MrPippi' }] },
    { id: 2, displayName: '史蒂夫', role: 'contributor', banned: false, isPublic: true, createdAt: '', identities: [{ provider: 'discord', username: 'steve' }] },
  ];

  it('changes roles and bans others but not yourself', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/users': () => ({ users }),
      'POST /api/v1/admin/users/2/role': () => ({ id: 2, role: 'reviewer' }),
      'POST /api/v1/admin/users/2/ban': () => ({ id: 2, banned: true }),
    });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} selfId={1} />);
    expect(await screen.findByText('github:MrPippi')).toBeInTheDocument();
    expect(screen.getByLabelText('管理員 的角色')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('史蒂夫 的角色'), 'reviewer');
    await userEvent.click(screen.getByRole('button', { name: '停權 史蒂夫' }));
    expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/users/2/role')?.[1]?.body).toBe('{"role":"reviewer"}');
    expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/users/2/ban')?.[1]?.body).toBe('{"banned":true}');
  });

  it('searches', async () => {
    const fetchImpl = routeFetch({ 'GET /api/v1/admin/users': () => ({ users: [] }) });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} selfId={1} />);
    await userEvent.type(await screen.findByLabelText('搜尋使用者'), 'steve{Enter}');
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/users?q=steve')).toBe(true);
  });
});

describe('BlocksPanel', () => {
  it('adds and removes blocks', async () => {
    const subject = `ip:${'b'.repeat(64)}`;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/blocks': () => ({ blocks: [{ subject, reason: '洗版', createdAt: '2026-10-15T00:00:00.000Z' }] }),
      'POST /api/v1/admin/blocks': () => ({ subject: 'user:5' }),
      [`DELETE /api/v1/admin/blocks/${encodeURIComponent(subject)}`]: () => ({ removed: true }),
    });
    render(<BlocksPanel api={createAdminApi(fetchImpl as never)} />);
    const row = (await screen.findByText(subject)).closest('li');
    expect(row).not.toBeNull();
    await userEvent.type(screen.getByLabelText('主體（ip:… 或 user:…）'), 'user:5');
    await userEvent.type(screen.getByLabelText('理由（選填）'), '測試');
    await userEvent.click(screen.getByRole('button', { name: '新增封鎖' }));
    expect(fetchImpl.mock.calls.find(([u, i]) => u === '/api/v1/admin/blocks' && i?.method === 'POST')?.[1]?.body).toBe('{"subject":"user:5","reason":"測試"}');
    await userEvent.click(within(row!).getByRole('button', { name: `解除封鎖 ${subject}` }));
    expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(true);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd apps/site && npx vitest run src/admin/panels.test.tsx`
Expected: FAIL（佔位元件）。

- [ ] **Step 3: 實作**

```tsx
// apps/site/src/admin/PublishPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, PublishSummary } from './adminApi';
import { s } from './strings';

type Result = { readonly kind: 'ok' | 'error'; readonly text: string };

export default function PublishPanel({ api }: { readonly api: AdminApi }) {
  const [summary, setSummary] = useState<PublishSummary | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    const r = await api.publishSummary();
    setSummary(r.ok ? r.data : 'error');
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const publish = async () => {
    setBusy(true);
    setResult(null);
    const r = await api.publish();
    setBusy(false);
    setResult(r.ok ? { kind: 'ok', text: s.published(r.data) } : { kind: 'error', text: r.message });
    await load();
  };

  if (summary === 'loading') return <p className="text-muted">{s.loading}</p>;
  if (summary === 'error') return <p role="alert" className="text-danger">{s.loadFailed}</p>;
  const empty = summary.approved === 0 && summary.statusChanges.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {empty ? <p className="text-muted">{s.nothing}</p> : <p>{s.approvedCount(summary.approved)}</p>}
      {summary.mods.length > 0 && <ul className="text-sm">{summary.mods.map((m) => <li key={m.modId}><code>{m.modId}</code>：{m.count}</li>)}</ul>}
      {summary.statusChanges.length > 0 && (
        <div className="text-sm">
          <p className="text-muted">{s.pendingStatus}</p>
          <ul>{summary.statusChanges.map((x, i) => <li key={`${x.modId}-${i}`}>{x.modId} → {x.status}</li>)}</ul>
        </div>
      )}
      <button type="button" className="btn btn-primary self-start" disabled={busy || empty} onClick={() => void publish()}>{busy ? s.publishing : s.publish}</button>
      {result && <p role={result.kind === 'error' ? 'alert' : 'status'} className={result.kind === 'error' ? 'text-danger' : ''}>{result.text}</p>}
    </div>
  );
}
```

```tsx
// apps/site/src/admin/UsersPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, AdminUser, Role } from './adminApi';
import { s } from './strings';

const ROLES = Object.keys(s.roles) as Role[];

export default function UsersPanel({ api, selfId }: { readonly api: AdminApi; readonly selfId: number }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<readonly AdminUser[] | 'loading' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    const r = await api.listUsers(q);
    setUsers(r.ok ? r.data.users : 'error');
  }, [api]);
  useEffect(() => { void search(''); }, [search]);

  const act = async (pending: Promise<ApiResult<unknown>>) => {
    const r = await pending;
    setError(r.ok ? null : r.message);
    if (r.ok) await search(query);
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); void search(query.trim()); }}>
        <input className="input" aria-label={s.userSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {users === 'loading' && <p className="text-muted">{s.loading}</p>}
      {users === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof users !== 'string' && (
        <ul className="divide-y divide-line">
          {users.map((u) => {
            const self = u.id === selfId;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-semibold">{u.displayName}{self && s.self}</span>
                <span className="text-xs text-muted">{u.identities.map((i) => `${i.provider}:${i.username ?? '?'}`).join('、')}</span>
                <select className="input" aria-label={s.roleFor(u.displayName)} value={u.role} disabled={self}
                  onChange={(e) => void act(api.setRole(u.id, e.target.value as Role))}>
                  {ROLES.map((r) => <option key={r} value={r}>{s.roles[r]}</option>)}
                </select>
                <button type="button" className="btn" disabled={self} aria-label={`${u.banned ? s.unban : s.ban} ${u.displayName}`}
                  onClick={() => void act(api.setBanned(u.id, !u.banned))}>
                  {u.banned ? s.unban : s.ban}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

```tsx
// apps/site/src/admin/BlocksPanel.tsx
import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, BlockRecord } from './adminApi';
import { s } from './strings';

export default function BlocksPanel({ api }: { readonly api: AdminApi }) {
  const [blocks, setBlocks] = useState<readonly BlockRecord[] | 'loading' | 'error'>('loading');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.listBlocks();
    setBlocks(r.ok ? r.data.blocks : 'error');
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const act = async (pending: Promise<ApiResult<unknown>>, after?: () => void) => {
    const r = await pending;
    setError(r.ok ? null : r.message);
    if (!r.ok) return;
    after?.();
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        void act(api.addBlock(subject.trim(), reason.trim() || undefined), () => { setSubject(''); setReason(''); });
      }}>
        <label className="flex flex-col text-sm">{s.subject}<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="flex flex-col text-sm">{s.reason}<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="submit" className="btn">{s.addBlock}</button>
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {blocks === 'loading' && <p className="text-muted">{s.loading}</p>}
      {blocks === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof blocks !== 'string' && blocks.length === 0 && <p className="text-muted">{s.noBlocks}</p>}
      {typeof blocks !== 'string' && blocks.length > 0 && (
        <ul className="divide-y divide-line">
          {blocks.map((b) => (
            <li key={b.subject} className="flex flex-wrap items-center gap-3 py-2">
              <code className="break-all text-xs">{b.subject}</code>
              <span className="text-sm text-muted">{b.reason ?? ''}</span>
              <button type="button" className="btn" aria-label={s.removeBlock(b.subject)} onClick={() => void act(api.removeBlock(b.subject))}>{s.unblock}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd apps/site && npx vitest run && npx astro check && cd ../.. && npm run lint`
Expected: PASS；0 errors。

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/admin
git commit -m "feat(site): add publish, user and block panels to the admin page"
```

---

### Task 10: E2E — 假 GitHub 伺服器與完整審核發佈流程

**Files:**
- Create: `e2e/fake-github.ts`、`e2e/prepare-dev-vars.ts`、`e2e/review-publish.spec.ts`
- Modify: `playwright.config.ts`、`wrangler.jsonc`、`.dev.vars.example`、`README.md`

**Interfaces:**
- Consumes: `createFakeGithub`（Task 5）；`POST /api/v1/auth/test-login`（3B1）；管理頁（Task 7–9）。
- 假 GitHub 額外端點（僅 E2E 讀取用）：`GET /__state` → `{ head, commits }`；`GET /__file?path=` → 該檔在 head 的內容或 404。

- [ ] **Step 1: 寫失敗的 E2E**

```ts
// e2e/review-publish.spec.ts
import { expect, test } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 8787);
const FAKE_GITHUB = `http://localhost:${PORT + 1}`;
const KEY = 'block.create.shaft';

test('anonymous suggestion is approved by an admin and published as one commit', async ({ page, request }) => {
  const marker = `E2E${Date.now()}`;
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback("XXXX.DUMMY.TOKEN.XXXX"));return "w"},remove(){}};',
    }));

  await page.goto('/mods/create/');
  await page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);
  await page.getByRole('button', { name: `建議修改 ${KEY}` }).click();
  await page.getByLabel('建議譯文').fill(`傳動軸${marker}`);
  await page.getByRole('button', { name: '送出建議' }).click();
  await expect(page.getByText(/感謝你的建議/)).toBeVisible({ timeout: 20_000 });

  const status = await page.evaluate(async () => (await fetch('/api/v1/auth/test-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'github', providerUserId: 'e2e-admin', username: 'MrPippi' }),
  })).status);
  expect(status).toBe(200);

  await page.goto('/admin/');
  const card = page.getByRole('article').filter({ hasText: marker });
  await card.getByRole('button', { name: '核准', exact: true }).click();
  await expect(page.getByText('已核准。')).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole('tab', { name: '發佈' }).click();
  await page.getByRole('button', { name: '發佈到 GitHub' }).click();
  await expect(page.getByRole('status')).toContainText(/已發佈 \d+ 條/, { timeout: 20_000 });

  const file = await request.get(`${FAKE_GITHUB}/__file?path=data/mods/create/zh_tw.json`);
  expect(await file.text()).toContain(`傳動軸${marker}`);
  const state = (await (await request.get(`${FAKE_GITHUB}/__state`)).json()) as { head: string; commits: { sha: string; message: string; parents: string[] }[] };
  const head = state.commits.find((c) => c.sha === state.head);
  expect(head?.message).toMatch(/^chore\(data\): publish \d+ reviewed translations?/);
  expect(head?.message).toContain('create (');
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npx playwright test e2e/review-publish.spec.ts`
Expected: FAIL（沒有假 GitHub 伺服器；`GITHUB_API_BASE` 指向 api.github.com；缺 App 設定 → 發佈回 500）。

- [ ] **Step 3: 假 GitHub 伺服器與本機變數準備**

```ts
// e2e/fake-github.ts
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createFakeGithub } from '../apps/worker/src/github/fakeGithub';

const PORT = Number(process.env.FAKE_GITHUB_PORT ?? 8788);
const MOD_FILES = ['en_us.json', 'zh_tw.json', 'mod.json'];

const files = Object.fromEntries(
  readdirSync('data/mods').flatMap((modId) =>
    MOD_FILES.map((f) => [`data/mods/${modId}/${f}`, readFileSync(join('data/mods', modId, f), 'utf8')] as const)),
);
const fake = createFakeGithub(files);

async function readBody(req: AsyncIterable<unknown>): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__state') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ head: fake.head(), commits: fake.commits() }));
    return;
  }
  if (url.pathname === '/__file') {
    const content = fake.fileAtHead(url.searchParams.get('path') ?? '');
    res.statusCode = content === null ? 404 : 200;
    res.end(content ?? '');
    return;
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  const response = await fake.fetch(url.href, { method, headers: { 'Content-Type': 'application/json' }, body });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`fake GitHub listening on ${PORT}`));
```

```ts
// e2e/prepare-dev-vars.ts
// 本機／CI 的 wrangler dev 需要一把 GitHub App 私鑰才能簽 JWT；假 GitHub 不驗簽，這裡產生一次性金鑰（PKCS#1，與 GitHub 下載格式相同）。
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = '.dev.vars';
if (!existsSync(FILE)) copyFileSync('.dev.vars.example', FILE);
const current = readFileSync(FILE, 'utf8');
if (!/^GITHUB_APP_PRIVATE_KEY=/m.test(current)) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const escaped = privateKey.trim().replace(/\n/g, '\\n');
  const prefix = current.endsWith('\n') ? current : `${current}\n`;
  writeFileSync(FILE, `${prefix}# 本機假 GitHub 用的一次性金鑰（自動產生，非正式憑證）\nGITHUB_APP_PRIVATE_KEY="${escaped}"\n`);
}
```

- [ ] **Step 4: Playwright 與設定**

`playwright.config.ts`：在 `const ORIGIN = …` 後加

```ts
const FAKE_GITHUB_PORT = PORT + 1;
const FAKE_GITHUB_ORIGIN = `http://localhost:${FAKE_GITHUB_PORT}`;
```

並把 `webServer` 改為陣列：

```ts
  webServer: [
    {
      command: 'npx tsx e2e/fake-github.ts',
      url: `${FAKE_GITHUB_ORIGIN}/__state`,
      env: { FAKE_GITHUB_PORT: String(FAKE_GITHUB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx tsx e2e/prepare-dev-vars.ts && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port ${PORT} --var SITE_URL:${ORIGIN} --var GITHUB_API_BASE:${FAKE_GITHUB_ORIGIN}`,
      url: ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
```

`wrangler.jsonc` 的 `vars` 加 `"REPO": "MrPippi/ModLangForge"`。

`.dev.vars.example` 追加：

```
# 本機發佈打到假 GitHub（e2e/fake-github.ts）；私鑰由 e2e/prepare-dev-vars.ts 自動補上
GITHUB_APP_ID=1
GITHUB_INSTALLATION_ID=1
```

README「開發」段落補：

```
# 管理頁與發佈：npx tsx e2e/fake-github.ts（假 GitHub，埠 8788）＋ npx tsx e2e/prepare-dev-vars.ts，
# 再以 --var GITHUB_API_BASE:http://localhost:8788 啟動 wrangler dev；以 test-login 用 github:MrPippi 登入即為管理員。
```

`.github/workflows/ci.yml` 不需修改（既有步驟會 `cp .dev.vars.example .dev.vars`，Playwright 會啟動兩個 server）。

- [ ] **Step 5: 執行確認通過**

Run: `cp .dev.vars.example .dev.vars && PUBLIC_SUGGEST_ENABLED=true npm run build && npx playwright test`
Expected: 全部 E2E 通過（含新流程）。本機若被頻率限制（重複執行累積），刪除 `.wrangler/state` 後重跑。

- [ ] **Step 6: 全套驗證與 Commit**

Run: `npm run lint && npm test && npm run test:coverage -w @mlf/core && npm run test:coverage -w @mlf/worker && npm run typecheck -w @mlf/site && npm run typecheck -w @mlf/worker`
Expected: 全部通過。

```bash
git add e2e playwright.config.ts wrangler.jsonc .dev.vars.example README.md
git commit -m "test: e2e suggest, approve and publish against a fake GitHub"
```

---

### Task 11: 建立 OAuth 應用程式與 GitHub App、設定 secrets、部署到 workers.dev（每步需使用者明確同意）

**Files:** 無程式變更（若部署過程需調整設定再另行 commit）。

> 本 Task 的每一步都會在使用者的 Discord／GitHub／Cloudflare 帳號建立資源、設定憑證或部署；最後的冒煙發佈會 push `main` 並觸發正式站（Pages）重建。執行者必須逐步說明並取得使用者在對話中的同意。**所有 secret 由使用者自己輸入**（`wrangler secret put` 會互動式詢問），執行者不得要求使用者把值貼進對話，也不得寫入任何檔案。

- [ ] **Step 1: 使用者建立 Discord 應用程式**
  1. 開啟 https://discord.com/developers/applications → **New Application**，名稱 `ModLangForge`，同意條款 → Create。
  2. 左側 **OAuth2** → **Redirects** → **Add Redirect**，加入兩筆：
     - `https://modlangforge.jack3555tw.workers.dev/api/v1/auth/discord/callback`
     - `https://modlangforge.com/api/v1/auth/discord/callback`（3C 搬網域後使用，先登記）
  3. Save Changes。記下 **Client ID**；**Client Secret** → Reset Secret → 複製（只顯示一次，暫存在密碼管理器）。
  4. 不需要 Bot、不需要任何其他 scope（程式只要求 `identify`）。

- [ ] **Step 2: 使用者建立 GitHub App**
  1. 開啟 https://github.com/settings/apps/new。
  2. **GitHub App name**：`ModLangForge Bot`（若被占用加後綴）；**Homepage URL**：`https://modlangforge.com`。
  3. **Identifying and authorizing users** → **Callback URL** 加兩筆（按 Add Callback URL）：
     - `https://modlangforge.jack3555tw.workers.dev/api/v1/auth/github/callback`
     - `https://modlangforge.com/api/v1/auth/github/callback`
     - 「Expire user authorization tokens」保持勾選；「Request user authorization (OAuth) during installation」**不勾**；「Enable Device Flow」**不勾**。
  4. **Post installation**：不填。**Webhook**：取消勾選 **Active**（不需要 webhook URL 與 secret）。
  5. **Permissions** → **Repository permissions** → **Contents：Read and write**（Metadata 會自動變為 Read-only）；其他全部 No access；**Account permissions** 全部 No access。
  6. **Where can this GitHub App be installed?**：**Only on this account**。→ **Create GitHub App**。
  7. 建立後頁面：記下 **App ID** 與 **Client ID**；**Client secrets** → Generate a new client secret → 複製；**Private keys** → Generate a private key → 下載 `.pem`（PKCS#1 格式，可直接使用，Worker 會轉換）。
  8. 左側 **Install App** → 安裝到 `MrPippi` → **Only select repositories** → 選 `ModLangForge` → Install。安裝後網址為 `https://github.com/settings/installations/<數字>`，該數字即 **Installation ID**。
  9. 若 `main` 有 branch protection／ruleset 要求 PR 或狀態檢查，需把此 App 加入 bypass 名單，否則更新 ref 會 422（Worker 會回 `main_moved`）。執行者以 `gh api repos/MrPippi/ModLangForge/rules/branches/main` 查詢後向使用者說明。

- [ ] **Step 3: 使用者設定 secrets（逐一互動輸入）**

```bash
npx wrangler secret put SESSION_SECRET            # 值：openssl rand -base64 48 的輸出（≥ 32 字元）
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_CLIENT_ID
npx wrangler secret put GITHUB_APP_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_INSTALLATION_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY < 路徑/modlangforge-bot.<日期>.private-key.pem
```

設定完成後使用者應把下載的 `.pem` 移到安全位置或刪除。`TURNSTILE_SECRET`、`IP_HASH_SALT` 於 3A 已設定。Expected：`npx wrangler secret list` 列出上述名稱（不顯示值）。

- [ ] **Step 4: 確認 D1 與設定**
  - [ ] `npx wrangler d1 migrations list DB --remote` → 無待套用 migration（3B 未新增）。
  - [ ] `wrangler.jsonc` 的 `vars`：`SITE_URL` 為 workers.dev 網址、`ADMIN_BOOTSTRAP` 為 `github:MrPippi`、`GITHUB_API_BASE` 為 `https://api.github.com`、`REPO` 為 `MrPippi/ModLangForge`；**不得**有 `TEST_LOGIN_ENABLED`。

- [ ] **Step 5: 建置並部署（需同意）**

```bash
PUBLIC_SUGGEST_ENABLED=true PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFXt3PiifcT-YOeA SITE_URL=https://modlangforge.jack3555tw.workers.dev npm run build && npx wrangler deploy
```

- [ ] **Step 6: 冒煙清單（workers.dev）**
  - [ ] `POST https://modlangforge.jack3555tw.workers.dev/api/v1/auth/test-login` → 404。
  - [ ] `GET /api/v1/admin/users`（未登入）→ 401；`GET /api/v1/me` → `user: null` 且有 `csrfToken`。
  - [ ] 以 GitHub（MrPippi）登入 → 右上角顯示名稱，選單有「管理後台」；再「綁定 Discord」成功。
  - [ ] 以另一個 Discord 帳號登入 → 角色為 contributor，`/admin/` 顯示「你沒有審核權限」。
  - [ ] 匿名與登入各送一條建議（選一條無爭議的譯文）；`/admin/` 看得到兩條，作者分別為「匿名」與顯示名稱。
  - [ ] 退回其中一條；核准另一條。
  - [ ] **發佈（會 push `main` 並觸發 Pages 重建，需使用者再次同意）**：按「發佈到 GitHub」→ 顯示 commit；GitHub 上 `main` 出現由 App bot 建立的單一 commit，訊息含條數、模組、貢獻者；`mod.json` 的 `contributors` 只在作者公開時新增。
  - [ ] 約 2 分鐘後 https://modlangforge.com 該模組頁顯示新譯文。
  - [ ] 重新 `npm run build && npx wrangler deploy`（同 Step 5 指令），讓 Worker 的靜態資產與 `main` 一致；之後在 workers.dev 對同一句送相同內容應回「與目前譯文相同」。
  - [ ] Workers Logs 無未預期錯誤，且沒有任何 secret 或 token 出現在 log。

- [ ] **Step 7: 記錄**

在 README「部署」段落補一句：「3C 之前，每次站內發佈後需重新 `wrangler deploy` 讓 Worker 資產與 main 一致。」並 commit：

```bash
git add README.md
git commit -m "docs: note manual Worker redeploy after publishing until Workers Builds"
```

---

## 自我檢查（撰寫時已完成）

- 規格對照：§5.2 依模組分組、篩選、同 key 並列比較、核准／修改後核准／退回（附理由）、核准時其他 pending → superseded（Task 3、4、7）；直接編輯 = `approved` 且 `reviewer_id` 為自己、虛擬捲動沿用翻譯工具元件（Task 3、4、8）；模組狀態 partial↔reviewed（Task 4、8）；§5.3 步驟 1–6：installation token、Contents API 固定 base SHA、`base_target` 衝突、署名合併（公開者、去重、保序）、`translation.status`、`updatedAt`、tree→commit→fast-forward、重試一次、全有或全無、`publish_batches`、`published`（Task 1–6）；§6 每支 admin API 拒絕測試（Task 4、6 追加表格列，路由比對防漏）；§9 E2E（Task 10）；§8 步驟 4 與部署（Task 11）；§13 `sourceVersions`：套用保留所有 `mod.json` 欄位並以 `validateModData`（含 sourceVersions 規則）驗證（Task 2）。
- 不在本計畫：§5.3 步驟 7（Workers Builds）、`/me/`、`/contributors/`、自訂網域、Pages 轉址、檔案數警告、移除建議旗標 → 3C。
- 型別一致：`ApprovedChange.creditName`（core）↔ `listApprovedForPublish`（Task 3）；`ChangeResult`／`PublishPlan.appliedStatusChangeIds` ↔ `completePublish`；`GithubClient` 方法名（Task 5）↔ `runPublish`（Task 6）；`AdminApi` 方法（Task 7）↔ 各面板（Task 8、9）。
