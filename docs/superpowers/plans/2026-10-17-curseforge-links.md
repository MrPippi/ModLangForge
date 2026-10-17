# 回填模組 CurseForge 連結 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增維護者腳本 `npm run backfill:curseforge`（`--dry-run`、`--mod <modId>`），為缺少 `links.curseforge` 的模組查詢 CurseForge，只在確定是同一個模組時把 `https://www.curseforge.com/minecraft/mc-mods/<slug>` 寫進 `mod.json` 的 `links`（放在 `modrinth` 之後，其餘欄位與格式不變），無法確定的列出候選供人工確認；`fetch:modrinth` 有金鑰時新增模組也一併寫入 CurseForge 連結，沒有金鑰則照舊。

**Architecture:** `packages/core/src/modpackImport/curseforge.ts` 匯出既有的 `apiInit`（`x-api-key`＋`redirect: 'error'`）並新增 `searchCurseforge`（`GET /mods/search`，zod 驗證；`findModpack` 改用它，網址不變）；`run.ts` 匯出既有的 `redact`。新模組 `packages/core/src/curseforgeLinks/`（`@mlf/core/curseforgeLinks`）是 IO 注入的核心：`match.ts`（名稱正規化、比對規則、網址＝`platformModUrl`）、`lookup.ts`（依序 slug 查詢 → 名稱查詢）、`metaLinks.ts`（在原始 `mod.json` 物件的 `links` 中插入 `curseforge`）、`backfill.ts`（`runCurseforgeBackfill`、給 `fetch:modrinth` 用的 `draftCurseforgeLink`）、`report.ts`（台灣繁中輸出）。腳本只負責讀金鑰（`scripts/lib/curseforgeKey.ts`，`add:modpack` 共用）、讀寫 `data/mods/<id>/mod.json`（`scripts/lib/modFiles.ts`）與印出結果。

**Tech Stack:** TypeScript、zod 4、Vitest（core: node）、tsx（腳本）、Node 24 `process.loadEnvFile`。

**Spec:** docs/superpowers/specs/2026-10-17-curseforge-links-design.md

## Global Constraints

- 腳本：`npm run backfill:curseforge`；參數 `--dry-run`（只列出結果，不寫檔）、`--mod <modId>`（只處理一個模組；不在 `data/mods` 的 modId 直接以錯誤結束）。
- 比對規則（對每個缺少 `links.curseforge` 的模組，以 Modrinth slug 與模組名稱為依據）：
  1. 以 slug 查詢：`GET /v1/mods/search?gameId=432&classId=6&slug=<modrinth slug>`。結果中 slug 完全相同（不分大小寫）且名稱正規化後相同 → 採用。
  2. 否則以名稱查詢：`GET /v1/mods/search?gameId=432&classId=6&searchFilter=<名稱>&pageSize=20`。名稱正規化後完全相同的結果恰好一個 → 採用。
  3. 其餘情況（沒有結果、多個候選、只有 slug 相同但名稱不同）→ 不寫入，列為「需要人工確認」並附上候選。
- 名稱正規化：轉小寫、去除括號內文字（例如「(REI)」、「(Zoom)」）、移除非字母數字字元。正規化後為空字串的名稱一律不算相同。
- 寫入格式：`https://www.curseforge.com/minecraft/mc-mods/<CurseForge slug>`，與 4b 的對照規則（`resolve.ts`）一致——直接用 `platformModUrl({ platform: 'curseforge', slug })`，並以 `curseforgeSlug()` 讀回驗證。
- 已有 `links.curseforge` 的模組不查詢、不覆寫。
- 只在**確定是同一個模組**時寫入，寧可漏掉也不誤配；回應中 `classId !== 6` 的專案一律不採用、不列為候選。
- 寫入：只改 `mod.json` 的 `links`（加入 `curseforge`，放在 `modrinth` 之後；沒有 `modrinth` 時放在最前面），其餘欄位、欄位順序與格式不變（檔案格式為 `JSON.stringify(x, null, 2) + '\n'`，即 `scripts/lib/modrinth.ts` 的 `toJson`）；寫回的是讀到的原始物件（不經 `catalogModSchema.parse`，避免補上預設值或改變順序）；`updatedAt` 不更新。
- 金鑰：讀取環境變數 `CURSEFORGE_API_KEY`（`CURSEFORGE_KEY_ENV`），專案根目錄有 `.env` 時先載入；未設定時印出 `MISSING_KEY_MESSAGE` 並以非 0 結束。金鑰只送往 `api.curseforge.com`（沿用 4b 的 `apiInit`：`redirect: 'error'`），不寫入檔案、不印出，錯誤訊息以 `redact` 遮蔽。
- 所有 CurseForge 回應以 zod 驗證（沿用 `curseforge.ts` 的 `searchSchema`／`modSchema` 與 `parseOrThrow`）；`mod.json` 以 `catalogModSchema` 驗證，不符者列為「查詢失敗」且不寫入。
- 輸出（台灣繁中）：已寫入（dry-run 為「將寫入」）、需要人工確認（附候選名稱與網址）、查詢失敗，以及各類數量（含「已有連結、略過」）。有查詢失敗時 exit code 為 1，其餘模組照常處理。
- 查詢依序進行（一次一個請求），每個請求之間不重試；單一模組失敗不影響其他模組。
- `fetch:modrinth`：有金鑰時新增模組同時查詢並寫入 CurseForge 連結（同一套比對規則）；沒有金鑰則照舊只寫 Modrinth 連結、不發任何 CurseForge 請求、不報錯；CurseForge 查詢失敗或需要人工確認時仍新增模組，只在該行輸出附註。
- 不在範圍：從 CurseForge 匯入新模組、跨平台 slug 自動對照（整合包對照規則不變）、每週自動回填。
- 模組名稱只用英文（`name`）；不新增、不使用 `nameZh`。
- 不重複 helper：沿用 `apiInit`、`searchCurseforge`（新）、`CURSEFORGE_API`／`CURSEFORGE_GAME_ID`／`CURSEFORGE_MOD_CLASS`、`fetchJson`、`parseOrThrow`、`redact`、`MISSING_KEY_MESSAGE`、`CURSEFORGE_KEY_ENV`、`platformModUrl`／`curseforgeSlug`（`modpack/resolve`）、`modrinthSlug`（`pipeline/modrinth`）、`catalogModSchema`、`parseJsonText`（`@mlf/core/node`）、`MODS_DIR`／`toJson`（`scripts/lib/modrinth.ts`）、測試的 `fakeFetch`、`CF_API`、`CF_FAKE_KEY`（`modpackFixtures`）。`.env` 載入邏輯抽成 `scripts/lib/curseforgeKey.ts`，`add-modpack.ts` 改用它（不複製）。
- 不可變：所有函式回傳新物件／陣列，不修改輸入；檔案 200–400 行為主、最多 800 行；函式 < 50 行。
- CurseForge 金鑰：絕不寫死、印出或提交；測試只用 `fakeFetch` 與假金鑰 `CF_FAKE_KEY`；絕不讀取 `.env`、不印出環境變數；**本計畫不包含以真實金鑰執行腳本的步驟**（由 controller 另外執行並以資料 PR 提交）。
- TDD：每個 task 先寫失敗的測試、執行並記錄 RED，再實作到 PASS。core 覆蓋率（`npm run test:coverage -w @mlf/core`）維持 ≥ 80%。
- 驗證指令：`npm test -w @mlf/core`、`npm run lint`、`npm run typecheck -w @mlf/core`、`npm run validate:data`、`npm run test:coverage -w @mlf/core`（site 未修改，不需 `npm test -w @mlf/site`）。
- Commit：英文 Conventional Commits；絕不加 `Claude-Session` trailer、`Co-Authored-By` 或任何 claude.ai 連結。PR 標題 `feat: <繁中>`，說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。
- 換行：repo 檔案一律 LF。每次 commit 前確認 `git diff --cached --stat` 與 `git diff --cached --ignore-cr-at-eol --stat` 輸出相同（不同代表寫入了 CRLF，先轉回 LF）。git 指令一律在 worktree 根目錄逐條執行（不用 `cd … &&` 串接、不用 `git -C`）。

## Review Focus

1. 金鑰外洩：每個請求都只送往 `https://api.curseforge.com/v1/`、帶 `x-api-key` 且 `redirect: 'error'`；寫入的 `mod.json` 與錯誤訊息都不含金鑰（以 `[已隱藏]` 取代）。（Task 1 `searchCurseforge sends the key with redirect error`；Task 4 `sends the key only to CurseForge and never writes it`、`redacts the key and keeps going after a failure`、draft `redacts the key in the note`）
2. 誤配：只有 slug 相同但名稱不同、多個同名、正規化後為空的名稱、非模組專案（`classId` ≠ 6）→ 一律不寫入，只列候選。（Task 2 `asks for review when only the slug matches but the name differs`、`asks for review when several results share the name`、`never matches a name that normalizes to empty`、`ignores projects that are not mods`）
3. `mod.json` 格式：寫回後除了 `links` 多一行 `"curseforge"`（緊接在 `modrinth` 之後）以外逐字相同，`updatedAt` 不變，沒有補上 schema 預設值。（Task 3 `inserts curseforge right after modrinth and keeps every other byte`；Task 4 `writes only confident matches and lists the rest for review`）
4. 不覆寫、不越界：已有 `links.curseforge` 的模組不發請求；`--mod` 只接受 `data/mods` 既有的資料夾名稱（不會組出 `../` 路徑）。（Task 4 `skips mods that already have a CurseForge link without any request`、`rejects --mod values that are not in data/mods`）
5. `fetch:modrinth` 相容：沒有金鑰時 meta 原樣、0 個 CurseForge 請求；查詢失敗不阻止新增模組；`findModpack` 改用 `searchCurseforge` 後網址不變。（Task 4 `leaves the draft untouched without a key`、`keeps the draft when the lookup fails`；既有 `curseforge.test.ts`、`run.test.ts` 的 slug 路由全部照常 PASS）

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `packages/core/src/modpackImport/curseforge.ts`（修改） | 匯出 `apiInit`、`CurseforgeMod`；新增 `searchCurseforge`；`findModpack` 改用它 |
| `packages/core/src/modpackImport/run.ts`（修改） | 匯出 `redact` |
| `packages/core/src/curseforgeLinks/match.ts` | `LinkTarget`、`LinkCandidate`、`ReviewReason`、`LinkMatch`、`MAX_CANDIDATES`、`normalizeModName`、`curseforgeModUrl`、`matchBySlug`、`decideLink` |
| `packages/core/src/curseforgeLinks/lookup.ts` | `NAME_SEARCH_PAGE_SIZE`、`findCurseforgeLink` |
| `packages/core/src/curseforgeLinks/metaLinks.ts` | `withCurseforgeLink` |
| `packages/core/src/curseforgeLinks/backfill.ts` | `CurseforgeLinkIO`、`BackfillIO`、`BackfillArgs`、`BackfillEntry`、`BackfillDone`、`BackfillResult`、`runCurseforgeBackfill`、`DraftLink`、`draftCurseforgeLink` |
| `packages/core/src/curseforgeLinks/report.ts` | `REVIEW_REASON_TEXT`、`renderBackfillReport` |
| `packages/core/src/curseforgeLinks/index.ts` | 匯出（`@mlf/core/curseforgeLinks`，由 `package.json` 的 `"./*"` 自動對應） |
| `packages/core/src/test/curseforgeLinkFixtures.ts` | 測試用 `cfMod`、`cfSlugSearch`、`cfNameSearch`、`rawMod` |
| `scripts/lib/curseforgeKey.ts` | `readCurseforgeKey`（載入 `.env`＋讀 `CURSEFORGE_API_KEY`） |
| `scripts/lib/modFiles.ts` | `listModIds`、`readModJson`、`writeModJson` |
| `scripts/backfill-curseforge.ts` | CLI |
| `scripts/add-modpack.ts`、`scripts/fetch-modrinth.ts`、`package.json`（修改） | 共用金鑰讀取、`fetch:modrinth` 寫入 CurseForge 連結、新增 npm script |
| `docs/development.md`、`CONTRIBUTING.md`（修改） | 文件 |

---

### Task 1: 匯出 CurseForge 搜尋與金鑰遮蔽 helper（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/modpackImport/curseforge.ts`
- Modify: `packages/core/src/modpackImport/run.ts`
- Test: `packages/core/src/modpackImport/curseforge.test.ts`、`packages/core/src/modpackImport/run.test.ts`

**Interfaces:**
- Consumes: `fetchJson`、`FetchLike`、`FetchInit`（`http.ts`）、`parseOrThrow`（`errors.ts`）
- Produces:
  - `apiInit(apiKey: string, extra?: Omit<FetchInit, 'headers' | 'redirect'> & { readonly headers?: Readonly<Record<string, string>> }): FetchInit`（既有，改為 export）
  - `type CurseforgeMod = { id: number; name: string; slug: string; classId?: number | null; authors: { name: string }[] }`
  - `searchCurseforge(fetchImpl: FetchLike, apiKey: string, params: Readonly<Record<string, string | number>>): Promise<readonly CurseforgeMod[]>`
  - `redact(message: string, secret: string | undefined): string`（既有，改為 export）

- [ ] **Step 1: Write the failing tests**

`packages/core/src/modpackImport/curseforge.test.ts`：import 改為

```ts
import { apiInit, importFromCurseforge, noDownloadMessage, searchCurseforge, USER_AGENT } from './index';
```

並在檔案最後加上

```ts
describe('searchCurseforge', () => {
  const url = `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=Just%20Enough%20Items&pageSize=20`;
  const jei = { id: 238222, name: 'Just Enough Items (JEI)', slug: 'jei', classId: 6, authors: [{ name: 'mezz' }] };

  it('encodes parameters in the given order and returns validated results', async () => {
    const f = fakeFetch({ [url]: { data: [jei] } });
    expect(await searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 })).toEqual([jei]);
    expect(f.calls.map((c) => c.url)).toEqual([url]);
  });

  it('sends the key with redirect error', async () => {
    const f = fakeFetch({ [url]: { data: [] } });
    await searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 });
    expect(f.calls[0]?.init).toEqual({
      headers: { 'User-Agent': USER_AGENT, 'x-api-key': CF_FAKE_KEY, Accept: 'application/json' },
      redirect: 'error',
    });
    expect(apiInit(CF_FAKE_KEY)).toEqual({ headers: { 'x-api-key': CF_FAKE_KEY, Accept: 'application/json' }, redirect: 'error' });
  });

  it('rejects malformed responses', async () => {
    const f = fakeFetch({ [url]: { data: [{ id: 'x' }] } });
    await expect(searchCurseforge(f, CF_FAKE_KEY, { gameId: 432, classId: 6, searchFilter: 'Just Enough Items', pageSize: 20 }))
      .rejects.toThrow('CurseForge 搜尋結果 格式不符');
  });
});
```

`packages/core/src/modpackImport/run.test.ts`：`./index` 的 import 加上 `redact`：

```ts
import {
  type AddModpackIO, type ExistingModpack, type FetchLike, MISSING_KEY_MESSAGE, type ModpackFiles, noDownloadMessage, redact, runAddModpack, unsupportedQuestNote,
} from './index';
```

並在檔案最後加上

```ts
describe('redact', () => {
  it('replaces every occurrence of the key and leaves other text alone', () => {
    expect(redact(`a ${CF_FAKE_KEY} b ${CF_FAKE_KEY}`, CF_FAKE_KEY)).toBe('a [已隱藏] b [已隱藏]');
    expect(redact('plain', undefined)).toBe('plain');
    expect(redact('plain', '')).toBe('plain');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- src/modpackImport/curseforge.test.ts src/modpackImport/run.test.ts`
Expected: FAIL — `TypeError: searchCurseforge is not a function`、`apiInit is not a function`、`redact is not a function`（既有測試仍 PASS）。記錄 RED 輸出。

- [ ] **Step 3: Implement** — `packages/core/src/modpackImport/curseforge.ts`

把 `type CfMod = z.infer<typeof modSchema>;` 這一行改為

```ts
type CfMod = z.infer<typeof modSchema>;
/** CurseForge 搜尋結果中的一個專案（已以 zod 驗證） */
export type CurseforgeMod = CfMod;
```

`function apiInit(` 改為 `export function apiInit(`（內容不變）。

把 `findModpack` 整個換成以下兩個函式（slug 查詢網址與原本逐字相同）：

```ts
/** GET /mods/search；參數依傳入順序組成查詢字串，回應以 zod 驗證 */
export async function searchCurseforge(
  fetchImpl: FetchLike,
  apiKey: string,
  params: Readonly<Record<string, string | number>>,
): Promise<readonly CurseforgeMod[]> {
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const raw = await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods/search?${query}`, apiInit(apiKey));
  return parseOrThrow(searchSchema, raw, 'CurseForge 搜尋結果').data;
}

async function findModpack(fetchImpl: FetchLike, ref: string, apiKey: string): Promise<CfMod> {
  const mod = /^\d+$/.test(ref)
    ? parseOrThrow(oneModSchema, await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods/${ref}`, apiInit(apiKey)), 'CurseForge 專案').data
    : (await searchCurseforge(fetchImpl, apiKey, { gameId: CURSEFORGE_GAME_ID, classId: CURSEFORGE_MODPACK_CLASS, slug: ref }))[0];
  if (!mod) throw new ModpackImportError(`CurseForge 上找不到整合包 ${ref}`);
  if (mod.classId !== CURSEFORGE_MODPACK_CLASS) throw new ModpackImportError(`${mod.slug} 不是整合包`);
  return mod;
}
```

`packages/core/src/modpackImport/run.ts`：`function redact(` 改為

```ts
/** 把錯誤訊息中的金鑰換成 [已隱藏]；沒有金鑰時原樣回傳 */
export function redact(message: string, secret: string | undefined): string {
```

（`modpackImport/index.ts` 已 `export * from './curseforge'`、`'./run'`，不需修改。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/modpackImport`
Expected: PASS（含既有 `importFromCurseforge`、`runAddModpack` 全部測試）

Run: `npm run typecheck -w @mlf/core && npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modpackImport/curseforge.ts packages/core/src/modpackImport/run.ts packages/core/src/modpackImport/curseforge.test.ts packages/core/src/modpackImport/run.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "refactor(core): export CurseForge search and key redaction helpers"
```

---

### Task 2: 名稱正規化與比對規則（pure core (full code given)）

**Files:**
- Create: `packages/core/src/curseforgeLinks/match.ts`
- Create: `packages/core/src/curseforgeLinks/index.ts`
- Create: `packages/core/src/test/curseforgeLinkFixtures.ts`
- Test: `packages/core/src/curseforgeLinks/match.test.ts`

**Interfaces:**
- Consumes: `platformModUrl`、`curseforgeSlug`（`modpack/resolve`）、`CURSEFORGE_MOD_CLASS`、`CurseforgeMod`（Task 1）、`CF_API`（`test/modpackFixtures`）
- Produces:
  - `interface LinkTarget { slug: string | null; name: string }`
  - `interface LinkCandidate { name: string; slug: string; url: string }`
  - `type ReviewReason = 'none' | 'ambiguous' | 'name-mismatch'`
  - `type LinkMatch = { kind: 'matched'; via: 'slug' | 'name'; slug: string; url: string } | { kind: 'review'; reason: ReviewReason; candidates: readonly LinkCandidate[] }`
  - `MAX_CANDIDATES = 5`、`normalizeModName(name): string`、`curseforgeModUrl(slug): string`
  - `matchBySlug(target, results): CurseforgeMod | undefined`、`decideLink(target, bySlug, byName): LinkMatch`
  - 測試用：`cfMod(id, name, slug, classId = 6)`、`cfSlugSearch(slug)`、`cfNameSearch(name)`、`rawMod(modId, name, links)`

- [ ] **Step 1: Create the fixtures** — `packages/core/src/test/curseforgeLinkFixtures.ts`

```ts
import { CF_API } from './modpackFixtures';

/** CurseForge 搜尋結果中的一個專案（classId 6＝模組） */
export function cfMod(id: number, name: string, slug: string, classId = 6) {
  return { id, name, slug, classId, authors: [{ name: 'someone' }] };
}

export function cfSlugSearch(slug: string): string {
  return `${CF_API}/mods/search?gameId=432&classId=6&slug=${encodeURIComponent(slug)}`;
}

export function cfNameSearch(name: string): string {
  return `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(name)}&pageSize=20`;
}

/** 與 data/mods/<id>/mod.json 相同結構的原始物件（未經 schema 解析） */
export function rawMod(modId: string, name: string, links: Readonly<Record<string, string>>): Record<string, unknown> {
  return {
    modId,
    name,
    aliases: [],
    summary: '測試用模組。',
    authors: ['someone'],
    links,
    sourceVersions: [{ modVersion: '1.0.0', mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }],
    mcVersions: ['1.20.1'],
    loaders: ['forge'],
    format: 'json',
    translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: [] },
    updatedAt: '2026-10-01',
  };
}
```

- [ ] **Step 2: Write the failing test** — `packages/core/src/curseforgeLinks/match.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { curseforgeSlug } from '../modpack/resolve';
import { cfMod } from '../test/curseforgeLinkFixtures';
import { curseforgeModUrl, decideLink, MAX_CANDIDATES, matchBySlug, normalizeModName } from './index';

const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;
const jei = { slug: 'jei', name: 'Just Enough Items' };

describe('normalizeModName', () => {
  it('lowercases, drops bracketed text and removes non-alphanumerics', () => {
    expect(normalizeModName('Roughly Enough Items (REI)')).toBe('roughlyenoughitems');
    expect(normalizeModName('Ok Zoomer (Zoom)')).toBe('okzoomer');
    expect(normalizeModName("Create: Steam 'n' Rails")).toBe('createsteamnrails');
    expect(normalizeModName('Sodium')).toBe('sodium');
  });

  it('returns an empty string when nothing alphanumeric is left', () => {
    expect(normalizeModName('(beta) ★')).toBe('');
  });
});

describe('curseforgeModUrl', () => {
  it('builds the mc-mods page that the modpack resolver reads back', () => {
    expect(curseforgeModUrl('jei')).toBe(CF('jei'));
    expect(curseforgeSlug(curseforgeModUrl('create'))).toBe('create');
  });
});

describe('matchBySlug', () => {
  it('needs a Modrinth slug', () => {
    expect(matchBySlug({ slug: null, name: 'Just Enough Items' }, [cfMod(1, 'Just Enough Items', 'jei')])).toBeUndefined();
  });
});

describe('decideLink', () => {
  it('adopts a case-insensitive slug hit whose normalized name matches', () => {
    expect(decideLink({ slug: 'JEI', name: 'Just Enough Items' }, [cfMod(238222, 'Just Enough Items (JEI)', 'jei')], [])).toEqual({
      kind: 'matched', via: 'slug', slug: 'jei', url: CF('jei'),
    });
  });

  it('adopts the only exact name match when the slug search has none', () => {
    const byName = [cfMod(1, 'Sodium Extra', 'sodium-extra'), cfMod(2, 'Sodium', 'sodium-forge')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({ kind: 'matched', via: 'name', slug: 'sodium-forge', url: CF('sodium-forge') });
  });

  it('asks for review when several results share the name', () => {
    const byName = [cfMod(1, 'Sodium', 'sodium-a'), cfMod(2, 'Sodium (Fork)', 'sodium-b'), cfMod(3, 'Sodium Extra', 'sodium-extra')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({
      kind: 'review', reason: 'ambiguous',
      candidates: [{ name: 'Sodium', slug: 'sodium-a', url: CF('sodium-a') }, { name: 'Sodium (Fork)', slug: 'sodium-b', url: CF('sodium-b') }],
    });
  });

  it('asks for review when only the slug matches but the name differs', () => {
    const result = decideLink({ slug: 'carryon', name: 'Carry On' }, [cfMod(5, 'Carry Everything', 'carryon')], [cfMod(6, 'Carry On Plus', 'carry-on-plus')]);
    expect(result).toEqual({
      kind: 'review', reason: 'name-mismatch',
      candidates: [{ name: 'Carry Everything', slug: 'carryon', url: CF('carryon') }, { name: 'Carry On Plus', slug: 'carry-on-plus', url: CF('carry-on-plus') }],
    });
  });

  it('asks for review with no candidates when nothing is found', () => {
    expect(decideLink(jei, [], [])).toEqual({ kind: 'review', reason: 'none', candidates: [] });
  });

  it('never matches a name that normalizes to empty', () => {
    expect(decideLink({ slug: null, name: '★' }, [], [cfMod(1, '☆', 'star')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: '☆', slug: 'star', url: CF('star') }],
    });
  });

  it('ignores projects that are not mods', () => {
    const pack = cfMod(1, 'Just Enough Items', 'jei', 12);
    expect(decideLink(jei, [pack], [pack])).toEqual({ kind: 'review', reason: 'none', candidates: [] });
  });

  it('lists each project once and caps the candidates', () => {
    const byName = [...Array.from({ length: 7 }, (_, i) => cfMod(i + 1, 'Sodium', `sodium-${i + 1}`)), cfMod(1, 'Sodium', 'sodium-1')];
    const result = decideLink({ slug: 'other', name: 'Sodium' }, [], byName);
    expect(result.kind === 'review' ? result.candidates.map((c) => c.slug) : []).toEqual(['sodium-1', 'sodium-2', 'sodium-3', 'sodium-4', 'sodium-5']);
    expect(MAX_CANDIDATES).toBe(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/curseforgeLinks/match.test.ts`
Expected: FAIL — 無法解析 `./index`（`curseforgeLinks` 尚未建立）。記錄 RED 輸出。

- [ ] **Step 4: Create `packages/core/src/curseforgeLinks/match.ts`**

```ts
import { platformModUrl } from '../modpack/resolve';
import { CURSEFORGE_MOD_CLASS, type CurseforgeMod } from '../modpackImport/curseforge';

/** 比對依據：Modrinth slug（沒有 Modrinth 連結時為 null）與 mod.json 的英文名稱 */
export interface LinkTarget {
  readonly slug: string | null;
  readonly name: string;
}

export interface LinkCandidate {
  readonly name: string;
  readonly slug: string;
  readonly url: string;
}

/** none＝沒有同名結果；ambiguous＝多個同名；name-mismatch＝只有 slug 相同但名稱不同 */
export type ReviewReason = 'none' | 'ambiguous' | 'name-mismatch';

export type LinkMatch =
  | { readonly kind: 'matched'; readonly via: 'slug' | 'name'; readonly slug: string; readonly url: string }
  | { readonly kind: 'review'; readonly reason: ReviewReason; readonly candidates: readonly LinkCandidate[] };

export const MAX_CANDIDATES = 5;
const BRACKETED = /\([^)]*\)/g;
const NON_ALNUM = /[^a-z0-9]/g;

/** 轉小寫、去除括號內文字、移除非字母數字字元 */
export function normalizeModName(name: string): string {
  return name.toLowerCase().replace(BRACKETED, '').replace(NON_ALNUM, '');
}

/** 與 4b 對照規則（resolve.ts）相同的 CurseForge 模組頁網址 */
export function curseforgeModUrl(slug: string): string {
  return platformModUrl({ platform: 'curseforge', slug });
}

function sameName(a: string, b: string): boolean {
  const n = normalizeModName(a);
  return n !== '' && n === normalizeModName(b);
}

function isMod(m: CurseforgeMod): boolean {
  return m.classId === CURSEFORGE_MOD_CLASS;
}

function sameSlug(m: CurseforgeMod, slug: string | null): boolean {
  return slug !== null && m.slug.toLowerCase() === slug.toLowerCase();
}

/** 規則 1：slug 完全相同（不分大小寫）且名稱正規化後相同 */
export function matchBySlug(target: LinkTarget, results: readonly CurseforgeMod[]): CurseforgeMod | undefined {
  return results.find((m) => isMod(m) && sameSlug(m, target.slug) && sameName(m.name, target.name));
}

function candidatesOf(list: readonly CurseforgeMod[]): LinkCandidate[] {
  const unique = [...new Map(list.map((m) => [m.id, m])).values()];
  return unique.slice(0, MAX_CANDIDATES).map((m) => ({ name: m.name, slug: m.slug, url: curseforgeModUrl(m.slug) }));
}

function matched(via: 'slug' | 'name', m: CurseforgeMod): LinkMatch {
  return { kind: 'matched', via, slug: m.slug, url: curseforgeModUrl(m.slug) };
}

/** 規則 1 → 規則 2（名稱正規化後完全相同的結果恰好一個）→ 其餘列為需要人工確認，附上候選 */
export function decideLink(target: LinkTarget, bySlug: readonly CurseforgeMod[], byName: readonly CurseforgeMod[]): LinkMatch {
  const slugHit = matchBySlug(target, bySlug);
  if (slugHit) return matched('slug', slugHit);
  const named = byName.filter((m) => isMod(m) && sameName(m.name, target.name));
  const only = named.length === 1 ? named[0] : undefined;
  if (only) return matched('name', only);
  const slugOnly = bySlug.filter((m) => isMod(m) && sameSlug(m, target.slug));
  const reason: ReviewReason = named.length > 1 ? 'ambiguous' : slugOnly.length > 0 ? 'name-mismatch' : 'none';
  const pool = named.length > 0 ? named : byName.filter(isMod);
  return { kind: 'review', reason, candidates: candidatesOf([...slugOnly, ...pool]) };
}
```

- [ ] **Step 5: Create `packages/core/src/curseforgeLinks/index.ts`**

```ts
export * from './match';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/curseforgeLinks`
Expected: PASS

Run: `npm run typecheck -w @mlf/core && npm run lint`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/curseforgeLinks/match.ts packages/core/src/curseforgeLinks/index.ts packages/core/src/curseforgeLinks/match.test.ts packages/core/src/test/curseforgeLinkFixtures.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): add CurseForge link matching rules"
```

---

### Task 3: 依序查詢與寫入 `links`（pure core (full code given)）

**Files:**
- Create: `packages/core/src/curseforgeLinks/lookup.ts`
- Create: `packages/core/src/curseforgeLinks/metaLinks.ts`
- Modify: `packages/core/src/curseforgeLinks/index.ts`
- Test: `packages/core/src/curseforgeLinks/lookup.test.ts`、`packages/core/src/curseforgeLinks/metaLinks.test.ts`

**Interfaces:**
- Consumes: `searchCurseforge`、`CURSEFORGE_GAME_ID`、`CURSEFORGE_MOD_CLASS`（Task 1）、`decideLink`、`matchBySlug`、`LinkTarget`、`LinkMatch`（Task 2）
- Produces:
  - `NAME_SEARCH_PAGE_SIZE = 20`
  - `findCurseforgeLink(fetchImpl: FetchLike, apiKey: string, target: LinkTarget): Promise<LinkMatch>`（HTTP／zod 錯誤直接丟出 `ModpackImportError`）
  - `withCurseforgeLink(meta: Readonly<Record<string, unknown>>, url: string): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/curseforgeLinks/lookup.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { cfMod, cfNameSearch, cfSlugSearch } from '../test/curseforgeLinkFixtures';
import { fakeFetch } from '../test/fakeFetch';
import { CF_API, CF_FAKE_KEY } from '../test/modpackFixtures';
import { findCurseforgeLink } from './index';

describe('findCurseforgeLink', () => {
  it('stops after a slug hit', async () => {
    const f = fakeFetch({ [cfSlugSearch('jei')]: { data: [cfMod(238222, 'Just Enough Items (JEI)', 'jei')] } });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' })).toMatchObject({ kind: 'matched', via: 'slug', slug: 'jei' });
    expect(f.calls.map((c) => c.url)).toEqual([`${CF_API}/mods/search?gameId=432&classId=6&slug=jei`]);
  });

  it('falls back to the name search from the spec', async () => {
    const f = fakeFetch({
      [cfSlugSearch('sodium-extra-mr')]: { data: [] },
      [cfNameSearch('Sodium Extra')]: { data: [cfMod(9, 'Sodium Extra', 'sodium-extra')] },
    });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'sodium-extra-mr', name: 'Sodium Extra' })).toMatchObject({ kind: 'matched', via: 'name', slug: 'sodium-extra' });
    expect(f.calls.map((c) => c.url)).toEqual([
      `${CF_API}/mods/search?gameId=432&classId=6&slug=sodium-extra-mr`,
      `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=Sodium%20Extra&pageSize=20`,
    ]);
  });

  it('searches by name only when the mod has no Modrinth link', async () => {
    const f = fakeFetch({ [cfNameSearch('Example Legacy Mod')]: { data: [] } });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: null, name: 'Example Legacy Mod' })).toEqual({ kind: 'review', reason: 'none', candidates: [] });
    expect(f.calls.map((c) => c.url)).toEqual([cfNameSearch('Example Legacy Mod')]);
  });

  it('sends the key only to the CurseForge API without following redirects', async () => {
    const f = fakeFetch({ [cfSlugSearch('jei')]: { data: [] }, [cfNameSearch('Just Enough Items')]: { data: [] } });
    await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' });
    expect(f.calls).toHaveLength(2);
    for (const call of f.calls) {
      expect(call.url.startsWith(`${CF_API}/`)).toBe(true);
      expect(call.init?.headers?.['x-api-key']).toBe(CF_FAKE_KEY);
      expect(call.init?.redirect).toBe('error');
    }
  });

  it('throws on HTTP errors without retrying', async () => {
    const f = fakeFetch({});
    await expect(findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' })).rejects.toThrow(`HTTP 404 ${cfSlugSearch('jei')}`);
    expect(f.calls).toHaveLength(1);
  });
});
```

`packages/core/src/curseforgeLinks/metaLinks.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { withCurseforgeLink } from './index';

const CF_JEI = 'https://www.curseforge.com/minecraft/mc-mods/jei';

describe('withCurseforgeLink', () => {
  it('inserts curseforge right after modrinth and keeps every other byte', () => {
    const before = [
      '{',
      '  "modId": "jei",',
      '  "name": "Just Enough Items",',
      '  "aliases": [],',
      '  "links": {',
      '    "modrinth": "https://modrinth.com/mod/jei",',
      '    "source": "https://github.com/mezz/JustEnoughItems"',
      '  },',
      '  "updatedAt": "2026-10-01"',
      '}',
      '',
    ].join('\n');
    const after = before.replace(
      '    "modrinth": "https://modrinth.com/mod/jei",\n',
      `    "modrinth": "https://modrinth.com/mod/jei",\n    "curseforge": "${CF_JEI}",\n`,
    );
    const meta = JSON.parse(before) as Record<string, unknown>;
    expect(JSON.stringify(withCurseforgeLink(meta, CF_JEI), null, 2) + '\n').toBe(after);
  });

  it('appends after a trailing modrinth link and puts it first without one', () => {
    expect(withCurseforgeLink({ links: { modrinth: 'https://modrinth.com/mod/jei' } }, CF_JEI).links).toEqual({ modrinth: 'https://modrinth.com/mod/jei', curseforge: CF_JEI });
    expect(Object.keys(withCurseforgeLink({ links: { homepage: 'https://example.com' } }, CF_JEI).links as object)).toEqual(['curseforge', 'homepage']);
  });

  it('keeps a single curseforge entry and does not mutate the input', () => {
    const meta = { modId: 'jei', links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/old', modrinth: 'https://modrinth.com/mod/jei' } };
    const copy = structuredClone(meta);
    expect(Object.entries(withCurseforgeLink(meta, CF_JEI).links as object)).toEqual([['modrinth', 'https://modrinth.com/mod/jei'], ['curseforge', CF_JEI]]);
    expect(meta).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- src/curseforgeLinks`
Expected: FAIL — `findCurseforgeLink is not a function`、`withCurseforgeLink is not a function`（Task 2 測試仍 PASS）。記錄 RED 輸出。

- [ ] **Step 3: Create `packages/core/src/curseforgeLinks/lookup.ts`**

```ts
import { CURSEFORGE_GAME_ID, CURSEFORGE_MOD_CLASS, searchCurseforge } from '../modpackImport/curseforge';
import type { FetchLike } from '../modpackImport/http';
import { decideLink, type LinkMatch, type LinkTarget, matchBySlug } from './match';

export const NAME_SEARCH_PAGE_SIZE = 20;

/** 依序查詢：先以 Modrinth slug，沒有確定的結果再以名稱；請求不重試，錯誤直接丟出 */
export async function findCurseforgeLink(fetchImpl: FetchLike, apiKey: string, target: LinkTarget): Promise<LinkMatch> {
  const base = { gameId: CURSEFORGE_GAME_ID, classId: CURSEFORGE_MOD_CLASS };
  const bySlug = target.slug === null ? [] : await searchCurseforge(fetchImpl, apiKey, { ...base, slug: target.slug });
  if (matchBySlug(target, bySlug)) return decideLink(target, bySlug, []);
  const byName = await searchCurseforge(fetchImpl, apiKey, { ...base, searchFilter: target.name, pageSize: NAME_SEARCH_PAGE_SIZE });
  return decideLink(target, bySlug, byName);
}
```

- [ ] **Step 4: Create `packages/core/src/curseforgeLinks/metaLinks.ts`**

```ts
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * mod.json 的 links 加入 curseforge（放在 modrinth 之後；沒有 modrinth 時放最前面）。
 * 其餘欄位與順序不變、不補 schema 預設值、不修改輸入；以 toJson 寫回時只多一行。
 */
export function withCurseforgeLink(meta: Readonly<Record<string, unknown>>, url: string): Record<string, unknown> {
  const entries = Object.entries(isRecord(meta.links) ? meta.links : {}).filter(([key]) => key !== 'curseforge');
  const at = entries.findIndex(([key]) => key === 'modrinth') + 1;
  return { ...meta, links: Object.fromEntries([...entries.slice(0, at), ['curseforge', url], ...entries.slice(at)]) };
}
```

- [ ] **Step 5: Export** — `packages/core/src/curseforgeLinks/index.ts` 改為

```ts
export * from './match';
export * from './lookup';
export * from './metaLinks';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- src/curseforgeLinks`
Expected: PASS

Run: `npm run typecheck -w @mlf/core && npm run lint`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/curseforgeLinks/lookup.ts packages/core/src/curseforgeLinks/metaLinks.ts packages/core/src/curseforgeLinks/index.ts packages/core/src/curseforgeLinks/lookup.test.ts packages/core/src/curseforgeLinks/metaLinks.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): look up CurseForge links and insert them into mod.json links"
```

---

### Task 4: 回填流程、`fetch:modrinth` 草稿連結與輸出（pure core (full code given)）

**Files:**
- Create: `packages/core/src/curseforgeLinks/backfill.ts`
- Create: `packages/core/src/curseforgeLinks/report.ts`
- Modify: `packages/core/src/curseforgeLinks/index.ts`
- Test: `packages/core/src/curseforgeLinks/backfill.test.ts`、`packages/core/src/curseforgeLinks/report.test.ts`

**Interfaces:**
- Consumes: `catalogModSchema`（`catalog/schema`）、`parseOrThrow`、`FetchLike`、`MISSING_KEY_MESSAGE`、`redact`（Task 1）、`modrinthSlug`（`pipeline/modrinth`）、`findCurseforgeLink`、`withCurseforgeLink`（Task 3）
- Produces:
  - `interface CurseforgeLinkIO { fetch: FetchLike; apiKey: string | undefined }`
  - `interface BackfillIO extends CurseforgeLinkIO { listMods(): Promise<readonly string[]>; readMod(modId): Promise<unknown>; writeMod(modId, meta: Readonly<Record<string, unknown>>): Promise<void> }`
  - `interface BackfillArgs { dryRun: boolean; modId?: string }`
  - `type BackfillEntry = { kind: 'written'; modId; url; via } | { kind: 'review'; modId; name; reason; candidates } | { kind: 'failed'; modId; message } | { kind: 'skipped'; modId }`
  - `interface BackfillDone { kind: 'done'; dryRun: boolean; entries: readonly BackfillEntry[] }`、`type BackfillResult = { kind: 'error'; message: string } | BackfillDone`
  - `runCurseforgeBackfill(io: BackfillIO, args: BackfillArgs): Promise<BackfillResult>`
  - `interface DraftLink { meta: Readonly<Record<string, unknown>>; note: string | null }`、`draftCurseforgeLink(io: CurseforgeLinkIO, meta, target: LinkTarget): Promise<DraftLink>`
  - `REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>>`、`renderBackfillReport(result: BackfillDone): string[]`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/curseforgeLinks/backfill.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../modpackImport/http';
import { MISSING_KEY_MESSAGE } from '../modpackImport/run';
import { cfMod, cfNameSearch, cfSlugSearch, rawMod } from '../test/curseforgeLinkFixtures';
import { fakeFetch } from '../test/fakeFetch';
import { CF_API, CF_FAKE_KEY } from '../test/modpackFixtures';
import { type BackfillIO, draftCurseforgeLink, runCurseforgeBackfill, withCurseforgeLink } from './index';

const MR = (slug: string) => `https://modrinth.com/mod/${slug}`;
const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;

const MODS: Readonly<Record<string, Record<string, unknown>>> = {
  create: rawMod('create', 'Create', { modrinth: MR('create'), curseforge: CF('create') }),
  jei: rawMod('jei', 'Just Enough Items', { modrinth: MR('jei'), source: 'https://github.com/mezz/JustEnoughItems' }),
  sodium: rawMod('sodium', 'Sodium', { modrinth: MR('sodium') }),
};

const ROUTES = {
  [cfSlugSearch('jei')]: { data: [cfMod(238222, 'Just Enough Items (JEI)', 'jei')] },
  [cfSlugSearch('sodium')]: { data: [] },
  [cfNameSearch('Sodium')]: { data: [cfMod(1, 'Sodium', 'sodium-a'), cfMod(2, 'Sodium', 'sodium-b')] },
};

const SODIUM_REVIEW = {
  kind: 'review', modId: 'sodium', name: 'Sodium', reason: 'ambiguous',
  candidates: [{ name: 'Sodium', slug: 'sodium-a', url: CF('sodium-a') }, { name: 'Sodium', slug: 'sodium-b', url: CF('sodium-b') }],
};

interface Memory {
  readonly io: BackfillIO;
  readonly writes: { modId: string; meta: Readonly<Record<string, unknown>> }[];
}

function memoryIO(fetchImpl: FetchLike, apiKey: string | undefined = CF_FAKE_KEY, mods: Readonly<Record<string, unknown>> = MODS): Memory {
  const writes: Memory['writes'] = [];
  const io: BackfillIO = {
    fetch: fetchImpl,
    apiKey,
    listMods: async () => Object.keys(mods).reverse(),
    readMod: async (modId) => mods[modId],
    writeMod: async (modId, meta) => {
      writes.push({ modId, meta });
    },
  };
  return { io, writes };
}

describe('runCurseforgeBackfill', () => {
  it('writes only confident matches and lists the rest for review', async () => {
    const { io, writes } = memoryIO(fakeFetch(ROUTES));
    expect(await runCurseforgeBackfill(io, { dryRun: false })).toEqual({
      kind: 'done', dryRun: false,
      entries: [{ kind: 'skipped', modId: 'create' }, { kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' }, SODIUM_REVIEW],
    });
    expect(writes).toEqual([{ modId: 'jei', meta: withCurseforgeLink(MODS.jei ?? {}, CF('jei')) }]);
    expect(Object.keys(writes[0]?.meta.links as object)).toEqual(['modrinth', 'curseforge', 'source']);
    expect({ ...writes[0]?.meta, links: MODS.jei?.links }).toEqual(MODS.jei);
  });

  it('reports the same results without writing on a dry run', async () => {
    const { io, writes } = memoryIO(fakeFetch(ROUTES));
    const result = await runCurseforgeBackfill(io, { dryRun: true });
    expect(result).toMatchObject({ kind: 'done', dryRun: true, entries: [{ kind: 'skipped' }, { kind: 'written', modId: 'jei' }, { kind: 'review' }] });
    expect(writes).toEqual([]);
  });

  it('skips mods that already have a CurseForge link without any request', async () => {
    const f = fakeFetch(ROUTES);
    await runCurseforgeBackfill(memoryIO(f).io, { dryRun: true });
    expect(f.calls.some((c) => c.url.includes('create') || c.url.includes('Create'))).toBe(false);
  });

  it('stops with the setup message when the key is missing', async () => {
    for (const apiKey of [undefined, '']) {
      const f = fakeFetch(ROUTES);
      expect(await runCurseforgeBackfill(memoryIO(f, apiKey).io, { dryRun: false })).toEqual({ kind: 'error', message: MISSING_KEY_MESSAGE });
      expect(f.calls).toEqual([]);
    }
  });

  it('handles one mod with --mod', async () => {
    const f = fakeFetch(ROUTES);
    const result = await runCurseforgeBackfill(memoryIO(f).io, { dryRun: true, modId: 'jei' });
    expect(result).toEqual({ kind: 'done', dryRun: true, entries: [{ kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' }] });
    expect(f.calls.map((c) => c.url)).toEqual([cfSlugSearch('jei')]);
  });

  it('rejects --mod values that are not in data/mods', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f);
    expect(await runCurseforgeBackfill(io, { dryRun: false, modId: '../jei' })).toEqual({ kind: 'error', message: 'data/mods 沒有模組 ../jei' });
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('sends the key only to CurseForge and never writes it', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f);
    await runCurseforgeBackfill(io, { dryRun: false });
    expect(f.calls.length).toBeGreaterThan(0);
    for (const call of f.calls) {
      expect(call.url.startsWith(`${CF_API}/`)).toBe(true);
      expect(call.init?.headers?.['x-api-key']).toBe(CF_FAKE_KEY);
      expect(call.init?.redirect).toBe('error');
    }
    expect(JSON.stringify(writes)).not.toContain(CF_FAKE_KEY);
  });

  it('redacts the key and keeps going after a failure', async () => {
    const ok = fakeFetch(ROUTES);
    const leaky: FetchLike = async (url, init) => {
      if (url === cfSlugSearch('jei')) throw new Error(`connect failed with key ${CF_FAKE_KEY}`);
      return ok(url, init);
    };
    const result = await runCurseforgeBackfill(memoryIO(leaky).io, { dryRun: false });
    expect(result).toEqual({
      kind: 'done', dryRun: false,
      entries: [{ kind: 'skipped', modId: 'create' }, { kind: 'failed', modId: 'jei', message: 'connect failed with key [已隱藏]' }, SODIUM_REVIEW],
    });
  });

  it('reports invalid mod.json files as failures without writing', async () => {
    const f = fakeFetch(ROUTES);
    const { io, writes } = memoryIO(f, CF_FAKE_KEY, { broken: { modId: 'broken' } });
    const result = await runCurseforgeBackfill(io, { dryRun: false });
    expect(result.kind === 'done' ? result.entries[0] : null).toMatchObject({ kind: 'failed', modId: 'broken', message: expect.stringContaining('broken/mod.json 格式不符') });
    expect(f.calls).toEqual([]);
    expect(writes).toEqual([]);
  });
});

describe('draftCurseforgeLink', () => {
  const draft = { modId: 'jei', links: { modrinth: MR('jei') }, updatedAt: '2026-10-17' };
  const target = { slug: 'jei', name: 'Just Enough Items' };

  it('leaves the draft untouched without a key', async () => {
    const f = fakeFetch(ROUTES);
    expect(await draftCurseforgeLink({ fetch: f, apiKey: undefined }, draft, target)).toEqual({ meta: draft, note: null });
    expect(f.calls).toEqual([]);
  });

  it('adds the link after modrinth when the mod matches', async () => {
    const result = await draftCurseforgeLink({ fetch: fakeFetch(ROUTES), apiKey: CF_FAKE_KEY }, draft, target);
    expect(result).toEqual({ meta: { ...draft, links: { modrinth: MR('jei'), curseforge: CF('jei') } }, note: 'CurseForge 連結：jei' });
  });

  it('keeps the draft and notes when a review is needed', async () => {
    const result = await draftCurseforgeLink({ fetch: fakeFetch(ROUTES), apiKey: CF_FAKE_KEY }, { links: { modrinth: MR('sodium') } }, { slug: 'sodium', name: 'Sodium' });
    expect(result).toEqual({ meta: { links: { modrinth: MR('sodium') } }, note: 'CurseForge 連結需要人工確認：有多個同名模組' });
  });

  it('keeps the draft when the lookup fails and redacts the key in the note', async () => {
    const leaky: FetchLike = async () => {
      throw new Error(`boom ${CF_FAKE_KEY}`);
    };
    expect(await draftCurseforgeLink({ fetch: leaky, apiKey: CF_FAKE_KEY }, draft, target)).toEqual({ meta: draft, note: 'CurseForge 查詢失敗：boom [已隱藏]' });
  });
});
```

`packages/core/src/curseforgeLinks/report.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { type BackfillDone, renderBackfillReport } from './index';

const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;

const DONE: BackfillDone = {
  kind: 'done',
  dryRun: false,
  entries: [
    { kind: 'skipped', modId: 'create' },
    { kind: 'written', modId: 'jei', url: CF('jei'), via: 'slug' },
    { kind: 'written', modId: 'sodium', url: CF('sodium'), via: 'name' },
    { kind: 'review', modId: 'carryon', name: 'Carry On', reason: 'name-mismatch', candidates: [{ name: 'Carry Everything', slug: 'carryon', url: CF('carryon') }] },
    { kind: 'review', modId: 'examplelegacy', name: 'Example Legacy Mod', reason: 'none', candidates: [] },
    { kind: 'failed', modId: 'foo', message: 'HTTP 500 https://api.curseforge.com/v1/mods/search?x' },
  ],
};

describe('renderBackfillReport', () => {
  it('lists every group with counts in Traditional Chinese', () => {
    expect(renderBackfillReport(DONE)).toEqual([
      '已寫入：2 個',
      `  jei  ${CF('jei')}（slug 與名稱相同）`,
      `  sodium  ${CF('sodium')}（名稱唯一相同）`,
      '需要人工確認：2 個',
      '  carryon（Carry On）：slug 相同但名稱不同',
      `    候選：Carry Everything  ${CF('carryon')}`,
      '  examplelegacy（Example Legacy Mod）：CurseForge 上找不到同名模組',
      '查詢失敗：1 個',
      '  foo：HTTP 500 https://api.curseforge.com/v1/mods/search?x',
      '已有連結、略過：1 個',
    ]);
  });

  it('says nothing was written on a dry run', () => {
    expect(renderBackfillReport({ kind: 'done', dryRun: true, entries: [] })).toEqual([
      '將寫入（--dry-run，未寫檔）：0 個', '需要人工確認：0 個', '查詢失敗：0 個', '已有連結、略過：0 個',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- src/curseforgeLinks`
Expected: FAIL — `runCurseforgeBackfill is not a function`、`draftCurseforgeLink is not a function`、`renderBackfillReport is not a function`（Task 2–3 測試仍 PASS）。記錄 RED 輸出。

- [ ] **Step 3: Create `packages/core/src/curseforgeLinks/backfill.ts`**

```ts
import { catalogModSchema } from '../catalog/schema';
import { parseOrThrow } from '../modpackImport/errors';
import type { FetchLike } from '../modpackImport/http';
import { MISSING_KEY_MESSAGE, redact } from '../modpackImport/run';
import { modrinthSlug } from '../pipeline/modrinth';
import { findCurseforgeLink } from './lookup';
import type { LinkCandidate, LinkTarget, ReviewReason } from './match';
import { withCurseforgeLink } from './metaLinks';
import { REVIEW_REASON_TEXT } from './report';

/** 腳本傳入全域 fetch 與 CURSEFORGE_API_KEY；金鑰只在記憶體中使用，不寫入、不印出 */
export interface CurseforgeLinkIO {
  readonly fetch: FetchLike;
  readonly apiKey: string | undefined;
}

/** 腳本提供 data/mods 的讀寫，測試注入記憶體實作 */
export interface BackfillIO extends CurseforgeLinkIO {
  readonly listMods: () => Promise<readonly string[]>;
  /** data/mods/<modId>/mod.json 解析後的原始值（未驗證） */
  readonly readMod: (modId: string) => Promise<unknown>;
  readonly writeMod: (modId: string, meta: Readonly<Record<string, unknown>>) => Promise<void>;
}

export interface BackfillArgs {
  readonly dryRun: boolean;
  readonly modId?: string;
}

export type BackfillEntry =
  | { readonly kind: 'written'; readonly modId: string; readonly url: string; readonly via: 'slug' | 'name' }
  | { readonly kind: 'review'; readonly modId: string; readonly name: string; readonly reason: ReviewReason; readonly candidates: readonly LinkCandidate[] }
  | { readonly kind: 'failed'; readonly modId: string; readonly message: string }
  | { readonly kind: 'skipped'; readonly modId: string };

export interface BackfillDone {
  readonly kind: 'done';
  readonly dryRun: boolean;
  readonly entries: readonly BackfillEntry[];
}

export type BackfillResult = { readonly kind: 'error'; readonly message: string } | BackfillDone;

function errorText(err: unknown, apiKey: string): string {
  return redact(err instanceof Error ? err.message : String(err), apiKey);
}

async function backfillOne(io: BackfillIO, apiKey: string, modId: string, dryRun: boolean): Promise<BackfillEntry> {
  try {
    const raw = await io.readMod(modId);
    const meta = parseOrThrow(catalogModSchema, raw, `${modId}/mod.json`);
    if (meta.links.curseforge !== undefined) return { kind: 'skipped', modId };
    const match = await findCurseforgeLink(io.fetch, apiKey, { slug: modrinthSlug(meta.links.modrinth), name: meta.name });
    if (match.kind === 'review') return { kind: 'review', modId, name: meta.name, reason: match.reason, candidates: match.candidates };
    // 已通過 catalogModSchema，raw 必為物件；寫回原始物件以保留欄位順序與格式
    if (!dryRun) await io.writeMod(modId, withCurseforgeLink(raw as Readonly<Record<string, unknown>>, match.url));
    return { kind: 'written', modId, url: match.url, via: match.via };
  } catch (err) {
    return { kind: 'failed', modId, message: errorText(err, apiKey) };
  }
}

/** --mod 只接受 data/mods 既有的資料夾名稱；找不到時回傳 null */
async function selectMods(io: BackfillIO, modId: string | undefined): Promise<readonly string[] | null> {
  const all = [...(await io.listMods())].sort();
  if (modId === undefined) return all;
  return all.includes(modId) ? [modId] : null;
}

/** 為缺少 links.curseforge 的模組依序查詢並寫入；單一模組失敗不影響其他模組 */
export async function runCurseforgeBackfill(io: BackfillIO, args: BackfillArgs): Promise<BackfillResult> {
  const apiKey = io.apiKey ?? '';
  if (apiKey === '') return { kind: 'error', message: MISSING_KEY_MESSAGE };
  const mods = await selectMods(io, args.modId);
  if (mods === null) return { kind: 'error', message: `data/mods 沒有模組 ${args.modId ?? ''}` };
  const entries: BackfillEntry[] = [];
  for (const modId of mods) entries.push(await backfillOne(io, apiKey, modId, args.dryRun));
  return { kind: 'done', dryRun: args.dryRun, entries };
}

export interface DraftLink {
  readonly meta: Readonly<Record<string, unknown>>;
  /** 附在 fetch:modrinth 該行輸出的說明；沒有金鑰時為 null */
  readonly note: string | null;
}

/** fetch:modrinth 新增模組時使用：沒有金鑰不查詢、原樣回傳；查詢失敗或需要人工確認時也原樣回傳並附說明 */
export async function draftCurseforgeLink(io: CurseforgeLinkIO, meta: Readonly<Record<string, unknown>>, target: LinkTarget): Promise<DraftLink> {
  const apiKey = io.apiKey ?? '';
  if (apiKey === '') return { meta, note: null };
  try {
    const match = await findCurseforgeLink(io.fetch, apiKey, target);
    return match.kind === 'matched'
      ? { meta: withCurseforgeLink(meta, match.url), note: `CurseForge 連結：${match.slug}` }
      : { meta, note: `CurseForge 連結需要人工確認：${REVIEW_REASON_TEXT[match.reason]}` };
  } catch (err) {
    return { meta, note: `CurseForge 查詢失敗：${errorText(err, apiKey)}` };
  }
}
```

- [ ] **Step 4: Create `packages/core/src/curseforgeLinks/report.ts`**

```ts
import type { BackfillDone, BackfillEntry } from './backfill';
import type { ReviewReason } from './match';

export const REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>> = {
  none: 'CurseForge 上找不到同名模組',
  ambiguous: '有多個同名模組',
  'name-mismatch': 'slug 相同但名稱不同',
};

const VIA_TEXT = { slug: 'slug 與名稱相同', name: '名稱唯一相同' } as const;

function ofKind<K extends BackfillEntry['kind']>(entries: readonly BackfillEntry[], kind: K): Extract<BackfillEntry, { kind: K }>[] {
  return entries.filter((e): e is Extract<BackfillEntry, { kind: K }> => e.kind === kind);
}

/** 腳本輸出：已寫入（或 dry-run 將寫入）、需要人工確認（附候選）、查詢失敗、略過，各附數量 */
export function renderBackfillReport(result: BackfillDone): string[] {
  const written = ofKind(result.entries, 'written');
  const review = ofKind(result.entries, 'review');
  const failed = ofKind(result.entries, 'failed');
  const skipped = ofKind(result.entries, 'skipped');
  return [
    `${result.dryRun ? '將寫入（--dry-run，未寫檔）' : '已寫入'}：${written.length} 個`,
    ...written.map((e) => `  ${e.modId}  ${e.url}（${VIA_TEXT[e.via]}）`),
    `需要人工確認：${review.length} 個`,
    ...review.flatMap((e) => [
      `  ${e.modId}（${e.name}）：${REVIEW_REASON_TEXT[e.reason]}`,
      ...e.candidates.map((c) => `    候選：${c.name}  ${c.url}`),
    ]),
    `查詢失敗：${failed.length} 個`,
    ...failed.map((e) => `  ${e.modId}：${e.message}`),
    `已有連結、略過：${skipped.length} 個`,
  ];
}
```

- [ ] **Step 5: Export** — `packages/core/src/curseforgeLinks/index.ts` 改為

```ts
export * from './match';
export * from './lookup';
export * from './metaLinks';
export * from './backfill';
export * from './report';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core`
Expected: PASS（全部 core 測試）

Run: `npm run typecheck -w @mlf/core && npm run lint && npm run test:coverage -w @mlf/core`
Expected: 0 errors；覆蓋率 ≥ 80%（`curseforgeLinks/*` 每個分支都有測試）

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/curseforgeLinks/backfill.ts packages/core/src/curseforgeLinks/report.ts packages/core/src/curseforgeLinks/index.ts packages/core/src/curseforgeLinks/backfill.test.ts packages/core/src/curseforgeLinks/report.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): add CurseForge link backfill runner and report"
```

---

### Task 5: `backfill:curseforge` 腳本、`fetch:modrinth` 寫入連結與文件（integration）

**Files:**
- Create: `scripts/lib/curseforgeKey.ts`
- Create: `scripts/lib/modFiles.ts`
- Create: `scripts/backfill-curseforge.ts`
- Modify: `scripts/add-modpack.ts`、`scripts/fetch-modrinth.ts`、`package.json`、`docs/development.md`、`CONTRIBUTING.md`

**Interfaces:**
- Consumes: `runCurseforgeBackfill`、`renderBackfillReport`、`draftCurseforgeLink`、`BackfillArgs`（`@mlf/core/curseforgeLinks`）、`CURSEFORGE_KEY_ENV`（`@mlf/core/modpackImport`）、`parseJsonText`（`@mlf/core/node`）、`MODS_DIR`、`toJson`（`scripts/lib/modrinth.ts`）
- Produces:
  - `readCurseforgeKey(): string | undefined`
  - `listModIds(): Promise<string[]>`、`readModJson(modId: string): Promise<unknown>`、`writeModJson(modId: string, meta: Readonly<Record<string, unknown>>): Promise<void>`
  - npm script `backfill:curseforge`

> 腳本是薄殼：所有行為已在 Task 1–4 以假 fetch＋假金鑰測過。本 task 不執行 `backfill:curseforge` 或 `fetch:modrinth`（會讀 `.env` 並連網）；真實執行由 controller 另外進行。

- [ ] **Step 1: Create `scripts/lib/curseforgeKey.ts`**

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURSEFORGE_KEY_ENV } from '@mlf/core/modpackImport';

const ENV_FILE = resolve(import.meta.dirname, '..', '..', '.env');

/** 專案根目錄有 .env 時先載入；回傳去除空白的 CURSEFORGE_API_KEY，未設定時為 undefined。金鑰不寫入、不印出 */
export function readCurseforgeKey(): string | undefined {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return process.env[CURSEFORGE_KEY_ENV]?.trim() || undefined;
}
```

- [ ] **Step 2: Use it in `scripts/add-modpack.ts`**

刪除 `import { existsSync } from 'node:fs';`、`import { resolve } from 'node:path';` 與 `const ENV_FILE = resolve(import.meta.dirname, '..', '.env');`；`@mlf/core/modpackImport` 的 import 拿掉 `CURSEFORGE_KEY_ENV`：

```ts
import { type AddModpackArgs, type AddModpackResult, runAddModpack } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { readExisting, writeModpack } from './lib/modpackFiles';
```

`main` 改為

```ts
async function main(): Promise<void> {
  const args = parseCli();
  const result = await runAddModpack({
    fetch,
    apiKey: readCurseforgeKey(),
    readLocalFile: async (path) => new Uint8Array(await readFile(path)),
    readExisting,
    write: writeModpack,
  }, args, new Date().toLocaleDateString('sv-SE'));
  report(result);
}
```

- [ ] **Step 3: Create `scripts/lib/modFiles.ts`**

```ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonText } from '@mlf/core/node';
import { MODS_DIR, toJson } from './modrinth';

const MOD_FILE = 'mod.json';

/** data/mods 底下的模組資料夾名稱 */
export async function listModIds(): Promise<string[]> {
  return (await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

/** 讀取 data/mods/<modId>/mod.json（容許 BOM，與 validate:data 一致）；驗證由呼叫端負責 */
export async function readModJson(modId: string): Promise<unknown> {
  const parsed = parseJsonText(await readFile(join(MODS_DIR, modId, MOD_FILE), 'utf8'));
  if (!parsed.ok) throw new Error(`${modId}/${MOD_FILE} JSON 解析失敗：${parsed.reason}`);
  return parsed.value;
}

/** 以既有資料的格式（2 空白縮排＋結尾換行）寫回 */
export async function writeModJson(modId: string, meta: Readonly<Record<string, unknown>>): Promise<void> {
  await writeFile(join(MODS_DIR, modId, MOD_FILE), toJson(meta), 'utf8');
}
```

- [ ] **Step 4: Create `scripts/backfill-curseforge.ts`**

```ts
/**
 * 為缺少 links.curseforge 的模組查詢 CurseForge 並寫入連結；只在確定是同一個模組時寫入，其餘列出候選供人工確認。
 * 用法：npm run backfill:curseforge [-- --dry-run] [-- --mod <modId>]
 * 需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）；金鑰不會寫入檔案，也不會印出。
 */
import { parseArgs } from 'node:util';
import { type BackfillArgs, renderBackfillReport, runCurseforgeBackfill } from '@mlf/core/curseforgeLinks';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { listModIds, readModJson, writeModJson } from './lib/modFiles';

function parseCli(): BackfillArgs {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, mod: { type: 'string' } } });
  return { dryRun: values['dry-run'] ?? false, ...(values.mod !== undefined ? { modId: values.mod } : {}) };
}

async function main(): Promise<void> {
  const args = parseCli();
  const result = await runCurseforgeBackfill(
    { fetch, apiKey: readCurseforgeKey(), listMods: listModIds, readMod: readModJson, writeMod: writeModJson },
    args,
  );
  if (result.kind === 'error') {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  for (const line of renderBackfillReport(result)) console.log(line);
  if (result.entries.some((e) => e.kind === 'failed')) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('backfill-curseforge 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Add the npm script** — `package.json` 的 `"fetch:modrinth"` 下一行加入

```json
    "backfill:curseforge": "tsx scripts/backfill-curseforge.ts",
```

- [ ] **Step 6: Write CurseForge links in `scripts/fetch-modrinth.ts`**

import 加上（放在 `@mlf/core/jar` 之後、`@mlf/core/pipeline` 之前）與 `./lib/curseforgeKey`：

```ts
import { draftCurseforgeLink } from '@mlf/core/curseforgeLinks';
```

```ts
import { readCurseforgeKey } from './lib/curseforgeKey';
import { API, downloadJar, getJson, largestNamespace, MODS_DIR, toJson } from './lib/modrinth';
```

`writeMod` 的 `meta` 型別改為 `Readonly<Record<string, unknown>>`：

```ts
async function writeMod(modId: string, meta: Readonly<Record<string, unknown>>, en: Readonly<Record<string, string>>): Promise<void> {
```

`processHit` 改為（多一個 `apiKey` 參數；只有建立 meta 到 return 的部分不同）：

```ts
async function processHit(hit: ModrinthHit, existing: Set<string>, today: string, apiKey: string | undefined): Promise<string> {
```

並把

```ts
  const meta = buildDraftMeta({ hit, modId: detected.modId, source, builtinPercent: selection.builtinPercent, today });
  await writeMod(detected.modId, meta, selection.en);
  existing.add(detected.modId);
  const builtin = selection.builtinPercent !== undefined ? `, builtin ${selection.builtinPercent}%` : '';
  return `ADDED ${detected.modId} (${Object.keys(selection.en).length} keys${builtin})`;
```

換成

```ts
  const draft = buildDraftMeta({ hit, modId: detected.modId, source, builtinPercent: selection.builtinPercent, today });
  const { meta, note } = await draftCurseforgeLink({ fetch, apiKey }, draft, { slug: hit.slug, name: hit.title });
  await writeMod(detected.modId, meta, selection.en);
  existing.add(detected.modId);
  const builtin = selection.builtinPercent !== undefined ? `, builtin ${selection.builtinPercent}%` : '';
  const cf = note !== null ? `, ${note}` : '';
  return `ADDED ${detected.modId} (${Object.keys(selection.en).length} keys${builtin}${cf})`;
```

`main` 在 `const today = …` 之後加上 `const apiKey = readCurseforgeKey();`，並把 `outcome = await processHit(hit, existing, today);` 改為 `outcome = await processHit(hit, existing, today, apiKey);`。檔頭註解的用法下一行加上：

```ts
 * 有 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）時，新增的模組會一併寫入確定相符的 CurseForge 連結；沒有金鑰時只寫 Modrinth 連結。
```

- [ ] **Step 7: Docs**

`docs/development.md` 的資料維護工具清單，在 `npm run fetch:modrinth …` 下一行加入

```bash
npm run backfill:curseforge -- --dry-run  # 為缺少 CurseForge 連結的模組查詢並列出結果；拿掉 --dry-run 才寫入，--mod <modId> 只處理一個（需要 CurseForge API Key）
```

並把「從 CurseForge 匯入整合包時，請先到」改為「使用 CurseForge API（`add:modpack --curseforge`、`backfill:curseforge`，以及讓 `fetch:modrinth` 一併寫入 CurseForge 連結）時，請先到」（該段其餘文字不變）。

`CONTRIBUTING.md` 把

```markdown
- CurseForge 整合包只會對上 `mod.json` 有填 `links.curseforge` 的模組；目前大多數已收錄的模組只有 Modrinth 連結，所以 CurseForge 整合包頁面可能把它們標成「尚未收錄」。補上 `links.curseforge` 之後就會自動對上。
```

改為

```markdown
- CurseForge 整合包只會對上 `mod.json` 有填 `links.curseforge` 的模組。維護者可執行 `npm run backfill:curseforge`（先加 `--dry-run` 看結果）補上連結：只有 slug 或名稱確定是同一個模組時才寫入，無法確定的會列出候選，請人工確認後手動填入。設定了 CurseForge 金鑰時，`npm run fetch:modrinth` 新增模組也會一併寫入連結。
```

- [ ] **Step 8: Run the full verification**

Run: `npm run lint && npm run typecheck -w @mlf/core && npm test -w @mlf/core && npm run test:coverage -w @mlf/core && npm run validate:data`
Expected: 全部 PASS；core 覆蓋率 ≥ 80%；`validate:data` 0 個錯誤（資料未變）

Run: `git status --short data`
Expected: 沒有輸出（本 task 不產生資料變更）

Run: `git ls-files .env`
Expected: 沒有輸出（`.env` 從未被追蹤）

Run: `git grep -n "x-api-key" -- scripts`
Expected: 沒有輸出（金鑰標頭只在 `curseforge.ts` 的 `apiInit`）

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/curseforgeKey.ts scripts/lib/modFiles.ts scripts/backfill-curseforge.ts scripts/add-modpack.ts scripts/fetch-modrinth.ts package.json docs/development.md CONTRIBUTING.md
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat: add backfill:curseforge script and CurseForge links in fetch:modrinth"
```

PR：標題 `feat: 回填模組 CurseForge 連結`；說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。資料變更（真實執行結果）由 controller 另開資料 PR。

---

## Self-Review

- 每個 spec 規則都有對應測試：slug 命中（含大小寫）、名稱唯一命中、多候選、slug 相同名稱不符、無結果、空名稱、非模組專案；網址格式以 `curseforgeSlug` 讀回。
- 網址與 4b 一致：不自行組字串，直接用 `platformModUrl`；`findModpack` 改用 `searchCurseforge` 後 slug 查詢網址逐字不變（既有 `curseforgeRoutes` 路由 `…classId=4471&slug=example-pack` 繼續命中）。
- `mod.json` 格式：寫回原始物件而非 `catalogModSchema.parse` 的結果（parse 會補 `aliases`／`contributors` 預設值）；`{ ...meta, links }` 保留 `links` 原本的位置；已確認現有 98 個 `mod.json` 全都等於 `JSON.stringify(x, null, 2) + '\n'`。
- 沒有重複 helper：`apiInit`／`redact` 改為 export；`.env` 載入抽到 `scripts/lib/curseforgeKey.ts` 並讓 `add-modpack.ts` 改用；`toJson`／`MODS_DIR`／`parseJsonText`／`fakeFetch`／`CF_FAKE_KEY` 沿用。
- 型別一致：`BackfillEntry.via` 與 `LinkMatch.via` 同為 `'slug' | 'name'`；`REVIEW_REASON_TEXT` 涵蓋 `ReviewReason` 三值；`report.ts` 只以 `import type` 引用 `backfill.ts`（無執行期循環）。
- 沒有以真實金鑰或網路執行任何腳本的步驟。

## 決策（spec 未明定之處）

| 問題 | 決定 |
|---|---|
| 沒有 Modrinth 連結的模組（目前只有 `examplelegacy`） | 跳過 slug 查詢，只做名稱查詢（同樣需要唯一的正規化同名才寫入） |
| 括號的範圍 | 只去除半形圓括號 `( … )`（spec 的例子）；其餘符號由「移除非字母數字」處理 |
| 正規化後為空的名稱 | 永不視為相同（避免全非 ASCII 名稱互相配對） |
| 回應中的非模組專案（`classId` ≠ 6） | 不採用、不列為候選 |
| slug 相同但名稱不同，同時名稱查詢有唯一同名結果 | 依 spec 規則順序採用名稱結果 |
| 候選數量 | 最多 5 個（slug 相同者優先，其次同名者，沒有同名時列名稱查詢結果），同一專案只列一次 |
| `updatedAt` | 不更新（spec：其餘欄位不變） |
| 有查詢失敗時的 exit code | 1（其餘模組照常寫入）；只有「需要人工確認」時為 0 |
| `--mod` 不在 `data/mods` | 以錯誤結束、不發任何請求（同時防止 `../` 路徑） |
| `fetch:modrinth` 查詢失敗／需要人工確認 | 仍新增模組，只在該行輸出加上附註；沒有金鑰時輸出與原本完全相同 |

## Spec Coverage

| Spec 項目 | Task |
|---|---|
| 新增 `npm run backfill:curseforge`，為缺少 `links.curseforge` 的模組查詢並寫入 | 4、5 |
| `fetch:modrinth` 有金鑰時同時寫入 CurseForge 連結、沒有金鑰照舊（不報錯） | 4（`draftCurseforgeLink`）、5 |
| 只在確定是同一個模組時寫入；無法確定的列出 | 2、4 |
| 比對規則 1：`slug=<modrinth slug>`、slug 不分大小寫相同且名稱正規化相同 | 1、2、3 |
| 比對規則 2：`searchFilter=<名稱>&pageSize=20`、正規化同名恰好一個 | 1、2、3 |
| 比對規則 3：沒有結果／多個候選／只有 slug 相同 → 需要人工確認並附候選 | 2、4 |
| 名稱正規化（小寫、去括號內文字、移除非字母數字） | 2 |
| 寫入格式 `https://www.curseforge.com/minecraft/mc-mods/<slug>`，與 `resolve.ts` 一致 | 2 |
| 已有 `links.curseforge` 不查詢、不覆寫 | 4 |
| `--dry-run`、`--mod <modId>` | 4、5 |
| 金鑰：`CURSEFORGE_API_KEY`、先載入 `.env`、未設定印出設定方式並非 0 結束 | 4（`MISSING_KEY_MESSAGE`）、5（`readCurseforgeKey`、exit code） |
| 金鑰只送往 `api.curseforge.com`、`redirect: 'error'`、不寫入不印出、錯誤遮蔽 | 1、3、4 |
| 只改 `links`（加入 `curseforge`），其餘欄位與格式不變 | 3、4、5（`writeModJson` 用 `toJson`） |
| 所有回應以 zod 驗證 | 1（`searchCurseforge`）、4（`catalogModSchema`） |
| 台灣繁中輸出：已寫入、需要人工確認（候選名稱與網址）、查詢失敗、各類數量 | 4（`renderBackfillReport`）、5 |
| 依序查詢、不重試、單一模組失敗不影響其他 | 3、4 |
| 測試：core（正規化、比對規則、網址格式） | 2 |
| 測試：腳本（假 fetch 寫入、dry-run、已有連結略過、無金鑰、金鑰只在 API 請求、錯誤遮蔽） | 4（IO 注入的 `runCurseforgeBackfill`） |
| 測試：`fetch:modrinth` 有金鑰寫入、沒有金鑰照舊 | 4（`draftCurseforgeLink`） |
| 實際執行：維護者以真實金鑰執行一次並以資料 PR 提交 | 不在本計畫（controller 另外執行） |
| 不在範圍（從 CurseForge 匯入新模組、跨平台 slug 自動對照、每週自動回填） | 未實作 |
