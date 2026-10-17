# 新資源包格式（Minecraft 1.21.9 以上與 26.x）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 版本表 `PACK_FORMATS` 加入 1.21.9、1.21.10、1.21.11、26.1、26.1.1、26.1.2、26.2、26.3，改記資源包格式的主、次版本號；`pack.mcmeta` 在資源包格式 ≥ 65 時改寫 `min_format`／`max_format`；`packFormatFor` 遇到表上沒有的版本丟出錯誤。玩家可下載 1.21.9 以上可用的資源包、1.21.9 以上的整合包可收錄、每週追蹤會看這些版本。

**Architecture:** 全部集中在 `packages/core/src/export/packFormats.ts`：`PackFormat`（`mcVersion`、`packFormat`＝主版本號、`packFormatMinor`）、`PACK_FORMATS`（新到舊）、會丟錯誤的 `packFormatFor`、純函式 `packMcmeta(format, description)`。`buildResourcePack.ts` 只改成呼叫 `packMcmeta`。`packFormat` 欄位保持「主版本號」的意義，所以直接讀數字的地方（`JSON_LANG_MIN_PACK_FORMAT`、`loaderPreference` 的 `> 15`、`TRACKED_MC_VERSIONS`、`buildDraftMeta`、`validateAddVersionArgs`）比較的已經是主版本號，程式不用改，只補測試固定行為。`knownMcVersion`、整合包 manifest、`addSourceVersion`、網站版本選單／排序（`pickVersion.ts`、`PackPage`、`ExportDialog`）、整合包下載都依版本表自動生效，同樣只補測試。

**Tech Stack:** TypeScript、zod 4、JSZip、Vitest（core: node；site: jsdom＋Testing Library）、React 18、Playwright（wrangler dev）。

**Spec:** docs/superpowers/specs/2026-10-17-new-pack-formats-design.md

## Global Constraints

- 資源包格式（spec 背景表）：1.21.9、1.21.10 → 69.0；1.21.11 → 75.0；26.1、26.1.1、26.1.2 → 84.0；26.2 → 88.0；26.3 → 97.1。
- 1.21.9 起 `pack.min_format` 與 `pack.max_format` 為必填（整數或 `[主, 次]`）；`pack_format` 選填；`supported_formats` 已移除。目標格式低於 65 的資源包仍使用 `pack_format`。語言檔位置與格式不變（`assets/<ns>/lang/<locale>.json`）。
- 決策 1：版本表加入 1.21.9 以上**每個正式版**：1.21.9、1.21.10、1.21.11、26.1、26.1.1、26.1.2、26.2、26.3（不補 1.21.6、1.21.7 等 1.21.9 以前的缺漏版本）。
- 決策 2：版本表改記主、次版本號：`{ mcVersion, packFormat, packFormatMinor }`（舊版本 `packFormatMinor` 為 0）；表格維持新到舊排序，26.x 在 1.21.x 之前。同一格式的版本也是新到舊（`26.1.2`、`26.1.1`、`26.1`；`1.21.10`、`1.21.9`）。
- 決策 3：`pack.mcmeta`：資源包格式 < 65（1.21.8 以下）維持 `{"pack":{"pack_format":N,"description":…}}`；資源包格式 ≥ 65（1.21.9 以上）寫 `{"pack":{"description":…,"min_format":[主,次],"max_format":[主,次]}}`，兩者都等於目標版本；不寫 `pack_format`。每個資源包只對應一個版本，不做跨版本相容。key 順序照 spec（舊：`pack_format`、`description`；新：`description`、`min_format`、`max_format`）。
- 決策 4：`packFormatFor` 遇到表上沒有的版本丟出錯誤 `不支援的 Minecraft 版本：<版本>`（不再默默套用 1.20.1 的格式）。網站的呼叫端都已有 try/catch 顯示既有錯誤訊息，不新增文字。
- 決策 5：不調整 `fetch:modrinth` 的偏好版本（`PREFERRED_MC_VERSIONS` 仍為 `['1.21.1', '1.20.1']`）；新版本由每週追蹤逐步補上，沿用每次最多寫入 100 個的限制（`track-versions.yml`、`parseMaxBuilds` 不動）。
- 直接讀 `packFormat` 數字的地方改比主版本號：`packFormat` 欄位就是主版本號，`packFormatMinor` 只有 `packMcmeta` 讀。不新增欄位以外的比較邏輯。
- 網站文字：版本選單只顯示 Minecraft 版本字串，不需新文字；不改 `apps/site/src/i18n/zh-TW.ts`、`apps/site/src/translator/i18n/zh-TW.ts`。若有任何新文字，一律台灣繁中、玩家用語。
- 不在範圍：1.21.9 以前缺漏的版本（1.21.6、1.21.7、1.21.2、1.21.3 等）、跨版本相容的資源包、主動為已收錄模組抓新版本原文、修改 `data/`（模組與整合包名稱一律英文、不加 `nameZh`；本計畫不新增也不修改任何 `data/` 檔案）。
- 不可變：所有函式回傳新物件／陣列，不修改輸入；`PACK_FORMATS` 為 `readonly`；檔案 200–400 行為主、最多 800 行；外部資料（API payload、`data/` 檔案）照舊以 zod 驗證（`knownMcVersion` 依版本表）。
- TDD：每個 task 先寫失敗的測試、執行並記錄 RED（貼上失敗訊息），再實作到 PASS。core 覆蓋率（`npm run test:coverage -w @mlf/core`）維持 ≥ 80%。
- 驗證指令：`npm test -w @mlf/core`、site 只用 `npm test -w @mlf/site`、`npm run lint`、`npm run typecheck -w @mlf/core`、`npm run typecheck -w @mlf/site`、`npm run validate:data`、`npm run test:coverage -w @mlf/core`；E2E：`npm run build && E2E_PORT=8797 npm run test:e2e`（需要 `.dev.vars`：`cp .dev.vars.example .dev.vars`）。
- Commit：英文 Conventional Commits；絕不加 `Claude-Session` trailer、`Co-Authored-By` 或任何 claude.ai 連結。PR 標題 `feat: <繁中>`，說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。
- 換行：repo 檔案一律 LF。每次 commit 前確認 `git diff --cached --stat` 與 `git diff --cached --ignore-cr-at-eol --stat` 輸出相同（不同代表寫入了 CRLF，先轉回 LF）。git 指令一律在 worktree 根目錄逐條執行（不用 `cd … &&` 串接、不用 `git -C`）。

## Review Focus

1. 資源包格式 64（1.21.8）與 65 的邊界：64 以下只寫 `pack_format`＋`description`（沒有 `min_format`），65 以上只寫 `description`＋`min_format`＋`max_format`（沒有 `pack_format`、`supported_formats`）。（Task 2 `keeps pack_format below format 65`、`writes min_format and max_format from format 65`；Task 3 `writes the pack.mcmeta for %s`）
2. 次版本號：26.3 必須是 `[97, 1]`，不是 `97` 或 `[97, 0]`；min 與 max 相同。（Task 2 `writes min_format and max_format from format 65`；Task 3 `records the 1.21.9+ formats from the spec`、E2E `merged pack for 26.3 writes min_format and max_format`）
3. 未知版本不再默默變成 pack_format 15：`packFormatFor('9.9')` 與 `exportProjects(…, { mcVersion: '9.9' })` 都以 `不支援的 Minecraft 版本：9.9` 失敗；`1.21.2` 這類未收錄版本在 `resolveSourceRef` 仍回傳 null。（Task 1 `throws for versions that are not in the table`、`rejects Minecraft versions that are not in the table`；Task 3 既有 `returns null for unknown mc versions or loaders`）
4. 排序：26.x 排在 1.21.x 之前（字串比較會把 `26.3` 排錯、`1.21.10` 排在 `1.21.9` 之前也要正確）；版本範圍顯示「舊–新」。（Task 3 `lists every supported release newest first, 26.x before 1.21.x`、`puts 26.x before 1.21.x`、`shows 26.x as the newest end of the range`）
5. 依版本表自動生效的消費者真的接受新版本：模組／整合包 schema、整合包 manifest、`add:version` 參數、`resolveSourceRef`（26.x 偏好 neoforge）、`buildDraftMeta`、`TRACKED_MC_VERSIONS`／`planTracking`、整合包 26.3 下載。（Task 3 `accepts 1.21.9+ and 26.x versions`、`reads 26.x and 1.21.10 modpacks`、`prefers neoforge on 26.x`、`adds a 26.3 build`、`writes min_format and max_format for a 26.3 modpack`）

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `packages/core/src/export/packFormats.ts`（修改） | `PackFormat`、`PACK_FORMATS`（加入 1.21.9 以上）、`DEFAULT_MC_VERSION`、`MIN_MAX_FORMAT_FROM`、`packFormatFor`（未知版本丟錯誤）、`PackMcmeta`、`packMcmeta` |
| `packages/core/src/export/buildResourcePack.ts`（修改） | `packMcmeta(opts)` 改呼叫 `packFormats.packMcmeta` |
| `packages/core/src/export/index.ts`（修改） | 匯出 `PackFormat`、`PackMcmeta`、`packMcmeta`、`MIN_MAX_FORMAT_FROM` |
| `packages/core/src/export/packFormats.test.ts`（新增） | 版本表、`packFormatFor`、`packMcmeta` |
| `packages/core/src/export/export.test.ts`（修改） | 未知版本失敗；1.20.1／1.21.8／1.21.10／26.3 的 `pack.mcmeta` |
| `packages/core/src/pipeline/modrinth.ts`（修改，只改註解） | 說明 `packFormat` 是主版本號 |
| `packages/core/src/catalog/catalog.test.ts`、`modpack/schema.test.ts`、`modpackImport/archive.test.ts`、`pipeline/addVersionPlan.test.ts`、`pipeline/addSourceVersion.test.ts`、`pipeline/pipeline.test.ts`、`pipeline/trackPlan.test.ts`（修改） | 新版本被接受、排序與追蹤 |
| `apps/site/src/islands/pickVersion.test.ts`、`pack.test.tsx`、`modpackDownload.test.tsx`、`translator/ui/ExportDialog.test.tsx`（修改） | 網站排序、合併資源包、整合包下載、翻譯工具版本選單 |
| `apps/site/src/islands/downloadModpack.ts`（修改，只改註解） | 「pack_format」改為「資源包格式」 |
| `e2e/site.spec.ts`（修改） | 合併資源包頁選 26.3 下載並檢查 `pack.mcmeta` |

E2E 資料的選擇：不新增也不修改 `data/`。合併資源包頁（`/pack/`）的版本選單列出整張版本表（`PackPage.tsx` 的 `PACK_VERSIONS`），所以把既有的 `create` 加入合併資源包、選 26.3 下載，就能以範例資料端到端驗證新格式，不必讓任何模組或整合包宣稱支援 26.3（`examplelegacy` 是 .lang 舊版模組，不能用；`vanilla-perfected` 是真實整合包，升版要重新執行 `add:modpack`，不在範圍）。

---

### Task 1: 版本表改記主、次版本號，未知版本丟出錯誤（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/export/packFormats.ts`
- Modify: `packages/core/src/export/buildResourcePack.ts`
- Modify: `packages/core/src/export/index.ts`
- Create: `packages/core/src/export/packFormats.test.ts`
- Modify: `packages/core/src/export/export.test.ts`

**Interfaces:**
- Produces:
  - `interface PackFormat { readonly mcVersion: string; readonly packFormat: number; readonly packFormatMinor: number }`
  - `PACK_FORMATS: readonly PackFormat[]`（本 task 只為既有 11 列加上 `packFormatMinor: 0`，不加新版本）
  - `packFormatFor(mcVersion: string): PackFormat`（找不到時 `throw new Error('不支援的 Minecraft 版本：<版本>')`）
- Consumers：`buildResourcePack.ts` 的 `packMcmeta` 改用 `packFormatFor(opts.mcVersion).packFormat`；其他檔案只讀 `mcVersion`／`packFormat`，不受影響（`npm run typecheck` 兩個 workspace 確認）。

- [ ] **Step 1: Write the failing test** — 新增 `packages/core/src/export/packFormats.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { PACK_FORMATS, packFormatFor } from './index';

describe('packFormatFor', () => {
  it('returns the major and minor resource pack format', () => {
    expect(packFormatFor('1.20.1')).toEqual({ mcVersion: '1.20.1', packFormat: 15, packFormatMinor: 0 });
    expect(packFormatFor('1.21.8')).toEqual({ mcVersion: '1.21.8', packFormat: 64, packFormatMinor: 0 });
  });

  it('throws for versions that are not in the table', () => {
    expect(() => packFormatFor('9.9')).toThrow('不支援的 Minecraft 版本：9.9');
    expect(() => packFormatFor('')).toThrow('不支援的 Minecraft 版本：');
  });
});

describe('PACK_FORMATS', () => {
  it('records a non-negative integer minor version on every row', () => {
    expect(PACK_FORMATS.every((f) => Number.isInteger(f.packFormatMinor) && f.packFormatMinor >= 0)).toBe(true);
  });
});
```

並把 `packages/core/src/export/export.test.ts` 最後一個測試

```ts
  it('unknown mc version falls back to default pack format', async () => {
    const res = await exportProjects([project('a')], opts({ mcVersion: '9.9' }));
    const meta = JSON.parse((await text(await unzip(res.blob), 'pack.mcmeta')) ?? '{}');
    expect(meta.pack.pack_format).toBe(15);
  });
```

換成

```ts
  it('rejects Minecraft versions that are not in the table', async () => {
    await expect(exportProjects([project('a')], opts({ mcVersion: '9.9' }))).rejects.toThrow('不支援的 Minecraft 版本：9.9');
    await expect(exportProjects([project('a')], opts({ kind: 'separate-packs', mcVersion: '9.9' }))).rejects.toThrow('不支援的 Minecraft 版本：9.9');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/export`
Expected: FAIL — `packFormatFor('1.20.1')` 回傳 `15` 不是物件；`packFormatFor('9.9')` 沒有丟錯誤；`packFormatMinor` 為 `undefined`；`exportProjects(… '9.9')` resolved 而非 rejected。把失敗訊息記錄下來。

- [ ] **Step 3: Replace `packages/core/src/export/packFormats.ts`**

```ts
/**
 * Minecraft 版本 → 資源包格式對照表，新到舊。
 * 1.21.9 起資源包格式分成主、次版本號；之前的版本次版本號為 0。
 * 新版本推出時只需在最前面新增一列。
 */
export interface PackFormat {
  readonly mcVersion: string;
  /** 資源包格式的主版本號（1.21.8 以前就是 pack_format）；所有數字比較都用這個欄位 */
  readonly packFormat: number;
  readonly packFormatMinor: number;
}

export const PACK_FORMATS: readonly PackFormat[] = [
  { mcVersion: '1.21.8', packFormat: 64, packFormatMinor: 0 },
  { mcVersion: '1.21.5', packFormat: 55, packFormatMinor: 0 },
  { mcVersion: '1.21.4', packFormat: 46, packFormatMinor: 0 },
  { mcVersion: '1.21.1', packFormat: 34, packFormatMinor: 0 },
  { mcVersion: '1.20.6', packFormat: 32, packFormatMinor: 0 },
  { mcVersion: '1.20.4', packFormat: 22, packFormatMinor: 0 },
  { mcVersion: '1.20.1', packFormat: 15, packFormatMinor: 0 },
  { mcVersion: '1.19.2', packFormat: 9, packFormatMinor: 0 },
  { mcVersion: '1.18.2', packFormat: 8, packFormatMinor: 0 },
  { mcVersion: '1.16.5', packFormat: 6, packFormatMinor: 0 },
  { mcVersion: '1.12.2', packFormat: 3, packFormatMinor: 0 },
];

export const DEFAULT_MC_VERSION = '1.20.1';

/** 表上沒有的版本丟出錯誤，避免默默產生其他版本的資源包 */
export function packFormatFor(mcVersion: string): PackFormat {
  const found = PACK_FORMATS.find((f) => f.mcVersion === mcVersion);
  if (!found) throw new Error(`不支援的 Minecraft 版本：${mcVersion}`);
  return found;
}
```

- [ ] **Step 4: Update `packages/core/src/export/buildResourcePack.ts`** — `packMcmeta` 改為

```ts
function packMcmeta(opts: ExportOptions): string {
  const meta = { pack: { pack_format: packFormatFor(opts.mcVersion).packFormat, description: opts.description } };
  return JSON.stringify(meta, null, 2) + '\n';
}
```

- [ ] **Step 5: Export the type** — `packages/core/src/export/index.ts` 第一行改為

```ts
export { DEFAULT_MC_VERSION, PACK_FORMATS, type PackFormat, packFormatFor } from './packFormats';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core && npm run typecheck -w @mlf/site && npm test -w @mlf/site`
Expected: PASS，兩個 typecheck 無錯誤（`PackPage`、`ExportDialog`、`pickVersion` 只讀 `mcVersion`）

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/export
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): record minor pack formats and reject unknown versions"
```

---

### Task 2: `pack.mcmeta` 依資源包格式選擇寫法（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/export/packFormats.ts`
- Modify: `packages/core/src/export/buildResourcePack.ts`
- Modify: `packages/core/src/export/index.ts`
- Modify: `packages/core/src/export/packFormats.test.ts`
- Modify: `packages/core/src/export/export.test.ts`

**Interfaces:**
- Consumes: `PackFormat`（Task 1）
- Produces:
  - `MIN_MAX_FORMAT_FROM = 65`
  - `type PackMcmeta = { readonly pack: { readonly pack_format: number; readonly description: string } } | { readonly pack: { readonly description: string; readonly min_format: readonly [number, number]; readonly max_format: readonly [number, number] } }`
  - `packMcmeta(format: PackFormat, description: string): PackMcmeta`（純函式；以傳入的 `PackFormat` 決定寫法，不查表，所以本 task 不需要新版本列）

- [ ] **Step 1: Write the failing test** — `packages/core/src/export/packFormats.test.ts` 的 import 改為 `import { MIN_MAX_FORMAT_FROM, PACK_FORMATS, packFormatFor, packMcmeta } from './index';`，並在最後加入

```ts
describe('packMcmeta', () => {
  const format = (packFormat: number, packFormatMinor = 0) => ({ mcVersion: 'x', packFormat, packFormatMinor });

  it('keeps pack_format below format 65', () => {
    expect(MIN_MAX_FORMAT_FROM).toBe(65);
    expect(packMcmeta(format(15), '說明')).toEqual({ pack: { pack_format: 15, description: '說明' } });
    expect(packMcmeta(format(64), '說明')).toEqual({ pack: { pack_format: 64, description: '說明' } });
  });

  it('writes min_format and max_format from format 65', () => {
    expect(packMcmeta(format(65), '說明')).toEqual({ pack: { description: '說明', min_format: [65, 0], max_format: [65, 0] } });
    expect(packMcmeta(format(69), '說明')).toEqual({ pack: { description: '說明', min_format: [69, 0], max_format: [69, 0] } });
    expect(packMcmeta(format(97, 1), '說明')).toEqual({ pack: { description: '說明', min_format: [97, 1], max_format: [97, 1] } });
  });

  it('writes the keys in the documented order', () => {
    expect(Object.keys(packMcmeta(format(64), 'd').pack)).toEqual(['pack_format', 'description']);
    expect(Object.keys(packMcmeta(format(97, 1), 'd').pack)).toEqual(['description', 'min_format', 'max_format']);
  });

  it('returns a fresh object and leaves the format untouched', () => {
    const f = Object.freeze(format(97, 1));
    const a = packMcmeta(f, 'd');
    const b = packMcmeta(f, 'd');
    expect(a).not.toBe(b);
    expect(f).toEqual({ mcVersion: 'x', packFormat: 97, packFormatMinor: 1 });
  });
});
```

並在 `export.test.ts` 的 `describe('exportProjects', …)` 裡、`merged-pack contains pack.mcmeta and every mod lang file` 之後加入（固定舊格式不帶新欄位）

```ts
  it('writes only pack_format and description for formats below 65', async () => {
    const res = await exportProjects([project('a')], opts({ mcVersion: '1.21.8' }));
    const meta = JSON.parse((await text(await unzip(res.blob), 'pack.mcmeta')) ?? '{}');
    expect(meta).toEqual({ pack: { pack_format: 64, description: '測試' } });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- src/export`
Expected: FAIL — `packMcmeta`／`MIN_MAX_FORMAT_FROM` 未匯出（`packMcmeta is not a function`）。`writes only pack_format and description for formats below 65` 此時已通過（行為固定用）。記錄失敗訊息。

- [ ] **Step 3: Add to `packages/core/src/export/packFormats.ts`**（加在 `packFormatFor` 之後）

```ts
/** 資源包格式 65 起（1.21.9 以上）pack.mcmeta 必須寫 min_format／max_format */
export const MIN_MAX_FORMAT_FROM = 65;

export type PackMcmeta =
  | { readonly pack: { readonly pack_format: number; readonly description: string } }
  | {
      readonly pack: {
        readonly description: string;
        readonly min_format: readonly [number, number];
        readonly max_format: readonly [number, number];
      };
    };

/** 每個資源包只對應一個版本：格式 65 以上的 min_format 與 max_format 都等於目標版本，不寫 pack_format */
export function packMcmeta(format: PackFormat, description: string): PackMcmeta {
  if (format.packFormat < MIN_MAX_FORMAT_FROM) return { pack: { pack_format: format.packFormat, description } };
  return {
    pack: {
      description,
      min_format: [format.packFormat, format.packFormatMinor],
      max_format: [format.packFormat, format.packFormatMinor],
    },
  };
}
```

- [ ] **Step 4: Use it in `packages/core/src/export/buildResourcePack.ts`** — import 改為

```ts
import { packFormatFor, packMcmeta as buildPackMcmeta } from './packFormats';
```

`packMcmeta` 改為

```ts
function packMcmeta(opts: ExportOptions): string {
  return JSON.stringify(buildPackMcmeta(packFormatFor(opts.mcVersion), opts.description), null, 2) + '\n';
}
```

- [ ] **Step 5: Export** — `packages/core/src/export/index.ts` 第一行改為

```ts
export {
  DEFAULT_MC_VERSION, MIN_MAX_FORMAT_FROM, PACK_FORMATS, type PackFormat, packFormatFor, type PackMcmeta, packMcmeta,
} from './packFormats';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm run typecheck -w @mlf/core && npm run lint`
Expected: PASS（既有 `pack_format: 34`、`"pack_format": 15` 的斷言不變）

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/export
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat(core): write min_format and max_format for pack format 65 and up"
```

---

### Task 3: 版本表加入 1.21.9 以上的正式版（integration）

這個 task 的實作只有版本表的 8 列；其餘都是依版本表自動生效的消費者（core、網站、E2E），測試先寫、先記錄 RED，再加列。

**Files:**
- Modify: `packages/core/src/export/packFormats.ts`
- Modify: `packages/core/src/pipeline/modrinth.ts`（只改註解）
- Modify: `apps/site/src/islands/downloadModpack.ts`（只改註解）
- Test (core): `packages/core/src/export/packFormats.test.ts`、`export/export.test.ts`、`catalog/catalog.test.ts`、`modpack/schema.test.ts`、`modpackImport/archive.test.ts`、`pipeline/addVersionPlan.test.ts`、`pipeline/addSourceVersion.test.ts`、`pipeline/pipeline.test.ts`、`pipeline/trackPlan.test.ts`
- Test (site): `apps/site/src/islands/pickVersion.test.ts`、`islands/pack.test.tsx`、`islands/modpackDownload.test.tsx`、`translator/ui/ExportDialog.test.tsx`
- Test (E2E): `e2e/site.spec.ts`

**Interfaces:**
- Consumes: `PackFormat`、`packFormatFor`、`packMcmeta`（Task 1–2）
- Produces: `PACK_FORMATS` 前 8 列為 `26.3`(97.1)、`26.2`(88.0)、`26.1.2`、`26.1.1`、`26.1`(84.0)、`1.21.11`(75.0)、`1.21.10`、`1.21.9`(69.0)；`TRACKED_MC_VERSIONS[0] === '26.3'`

- [ ] **Step 1: Write the failing core tests**

`packages/core/src/export/packFormats.test.ts` 的 `describe('PACK_FORMATS', …)` 最後加入

```ts
  it('lists every supported release newest first, 26.x before 1.21.x', () => {
    expect(PACK_FORMATS.map((f) => f.mcVersion)).toEqual([
      '26.3', '26.2', '26.1.2', '26.1.1', '26.1', '1.21.11', '1.21.10', '1.21.9',
      '1.21.8', '1.21.5', '1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2',
    ]);
  });

  it('records the 1.21.9+ formats from the spec', () => {
    expect(PACK_FORMATS.slice(0, 8).map((f) => [f.mcVersion, f.packFormat, f.packFormatMinor])).toEqual([
      ['26.3', 97, 1], ['26.2', 88, 0], ['26.1.2', 84, 0], ['26.1.1', 84, 0], ['26.1', 84, 0],
      ['1.21.11', 75, 0], ['1.21.10', 69, 0], ['1.21.9', 69, 0],
    ]);
  });

  it('never goes up in format from one row to the next', () => {
    const order = PACK_FORMATS.map((f) => f.packFormat * 1000 + f.packFormatMinor);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });
```

`packages/core/src/export/export.test.ts` 的 `describe('exportProjects', …)` 最後加入

```ts
  it.each([
    ['1.20.1', { pack_format: 15, description: '測試' }],
    ['1.21.8', { pack_format: 64, description: '測試' }],
    ['1.21.10', { description: '測試', min_format: [69, 0], max_format: [69, 0] }],
    ['26.3', { description: '測試', min_format: [97, 1], max_format: [97, 1] }],
  ])('writes the pack.mcmeta for %s', async (mcVersion, pack) => {
    const res = await exportProjects([project('a')], opts({ mcVersion }));
    expect(JSON.parse((await text(await unzip(res.blob), 'pack.mcmeta')) ?? '{}')).toEqual({ pack });
  });

  it('writes the new pack.mcmeta into every separate pack', async () => {
    const res = await exportProjects([project('a'), project('b')], opts({ kind: 'separate-packs', mcVersion: '26.2' }));
    const outer = await unzip(res.blob);
    for (const name of ['a-zh_tw.zip', 'b-zh_tw.zip']) {
      const inner = await JSZip.loadAsync((await outer.file(name)?.async('uint8array')) ?? new Uint8Array());
      expect(JSON.parse((await text(inner, 'pack.mcmeta')) ?? '{}')).toEqual({ pack: { description: '測試', min_format: [88, 0], max_format: [88, 0] } });
    }
  });
```

`packages/core/src/catalog/catalog.test.ts` 的 `describe('catalogModSchema', …)` 最後加入

```ts
  it('accepts 1.21.9+ and 26.x versions', () => {
    const input = with_({ mcVersions: ['26.3', '1.21.10'], sourceVersions: [{ ...valid.sourceVersions[0], mcVersion: '26.3' }] });
    expect(catalogModSchema.safeParse(input).success).toBe(true);
  });
```

`packages/core/src/modpack/schema.test.ts` 的 `describe('catalogModpackSchema', …)` 最後加入

```ts
  it('accepts 1.21.9+ and 26.x versions', () => {
    for (const mcVersion of ['1.21.9', '1.21.11', '26.1', '26.3']) {
      expect(messages({ ...VALID, source: { ...VALID.source, mcVersion } })).toEqual([]);
    }
  });
```

`packages/core/src/modpackImport/archive.test.ts`：在 `describe('parseMrpackIndex', …)` 最後加入

```ts
  it('reads 26.x and 1.21.10 modpacks', () => {
    expect(parseMrpackIndex({ ...INDEX, dependencies: { minecraft: '26.3', 'fabric-loader': '0.17.0' } })).toMatchObject({ mcVersion: '26.3', loader: 'fabric' });
    expect(parseMrpackIndex({ ...INDEX, dependencies: { minecraft: '1.21.10', neoforge: '21.10.1' } })).toMatchObject({ mcVersion: '1.21.10', loader: 'neoforge' });
  });
```

在 `describe('parseCurseManifest', …)` 最後加入

```ts
  it('reads 26.x modpacks', () => {
    const manifest = { ...MANIFEST, minecraft: { version: '26.1.2', modLoaders: [{ id: 'neoforge-26.1.2.1', primary: true }] } };
    expect(parseCurseManifest(manifest)).toMatchObject({ mcVersion: '26.1.2', loader: 'neoforge' });
  });
```

`packages/core/src/pipeline/addVersionPlan.test.ts` 的 `describe('validateAddVersionArgs (I2b)', …)` 最後加入

```ts
  it('accepts 1.21.9+ and 26.x versions', () => {
    for (const mc of ['1.21.9', '1.21.10', '1.21.11', '26.1', '26.3']) expect(validateAddVersionArgs(meta, mc)).toBeNull();
  });
```

`packages/core/src/pipeline/addSourceVersion.test.ts`：在 `describe('resolveSourceRef', …)` 最後加入

```ts
  it('knows 26.x versions and picks the newest of them', () => {
    expect(resolveSourceRef(mv({ game_versions: ['26.1', '26.1.1', '26.1.2'] }))?.mcVersion).toBe('26.1.2');
    expect(resolveSourceRef(mv({ game_versions: ['1.21.9', '1.21.10'] }))?.mcVersion).toBe('1.21.10');
  });
```

在 `describe('resolveSourceRef loader preference', …)` 最後加入

```ts
  it('prefers neoforge on 26.x', () => {
    expect(resolveSourceRef(mv({ game_versions: ['26.3'], loaders: ['forge', 'neoforge'] }))?.loader).toBe('neoforge');
  });
```

`packages/core/src/pipeline/pipeline.test.ts` 的 `describe('buildDraftMeta json versions', …)` 最後加入

```ts
  it('lists 1.21.9+ and 26.x versions newest first and ignores snapshots', () => {
    const newHit = { ...hit, versions: ['1.21.8', '1.21.10', '26.3', '26.3-snapshot-1'] };
    const meta = buildDraftMeta({ hit: newHit, modId: 'demo', source: { modVersion: '1', mcVersion: '1.21.10', loader: 'fabric' }, today: '2026-10-17' });
    expect(meta.mcVersions).toEqual(['26.3', '1.21.10', '1.21.8']);
  });
```

`packages/core/src/pipeline/trackPlan.test.ts`：`describe('TRACKED_MC_VERSIONS', …)` 的測試改為

```ts
  it('lists JSON-capable versions newest first', () => {
    expect(TRACKED_MC_VERSIONS[0]).toBe('26.3');
    expect(TRACKED_MC_VERSIONS).toEqual(expect.arrayContaining(['26.2', '26.1.2', '26.1.1', '26.1', '1.21.11', '1.21.10', '1.21.9', '1.21.8']));
    expect(TRACKED_MC_VERSIONS).not.toContain('1.12.2');
  });
```

並在 `describe('planTracking', …)` 最後加入

```ts
  it('adds a 26.3 build ahead of older combinations', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('d', '1.9', ['1.20.1'], ['forge'], '2025-12-01'),
      v('g', '4.0', ['26.3'], ['neoforge'], '2026-09-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['add:26.3:neoforge:4.0', 'add:1.20.1:forge:1.9']);
  });
```

- [ ] **Step 2: Write the failing site tests**

`apps/site/src/islands/pickVersion.test.ts` 的 `describe('versionRange', …)` 最後加入

```ts
  it('shows 26.x as the newest end of the range', () => {
    expect(versionRange(['26.3', '1.21.1', '1.21.10'])).toBe('1.21.1–26.3');
  });
```

`apps/site/src/islands/pack.test.tsx` 的 `describe('pickCommonVersion / sortVersions', …)` 最後加入

```ts
  it('puts 26.x before 1.21.x', () => {
    expect(sortVersions(['1.21.1', '26.1', '1.21.10', '26.3', '1.21.9'])).toEqual(['26.3', '26.1', '1.21.10', '1.21.9', '1.21.1']);
    expect(pickCommonVersion([['1.21.1', '26.3'], ['26.3', '1.21.10']])).toEqual({ version: '26.3', fallback: false });
  });
```

在 `describe('downloadPack', …)` 最後加入

```ts
  it('builds a 1.21.10 pack with min_format and max_format', async () => {
    const payloads = [await fetchModData('create', fakeFetch({ create: body('create', ['1.21.10']) }))] as ModPayload[];
    const result = await buildPack(payloads, '1.21.10');
    expect(result.fileName).toBe('create-zh_tw-1.21.10.zip');
    const meta = JSON.parse((await (await JSZip.loadAsync(await result.blob.arrayBuffer())).file('pack.mcmeta')?.async('string')) ?? '{}');
    expect(meta.pack).toMatchObject({ min_format: [69, 0], max_format: [69, 0] });
    expect(meta.pack).not.toHaveProperty('pack_format');
  });
```

`apps/site/src/islands/modpackDownload.test.tsx`：在 `follows the modpack Minecraft version` 之後加入

```ts
  it('writes min_format and max_format for a 26.3 modpack', async () => {
    const pack = await fetchModpackData('example-pack', fakeFetch(routes(packBody({ meta: packMeta('26.3') }))));
    const result = await buildModpackPack(pack, []);
    expect(result.fileName).toBe(modpackPackFileName('example-pack', '26.3'));
    const meta = await readJson(await zipInnerZip(await readZip(result.blob), RESOURCE_PACK), 'pack.mcmeta');
    expect(meta).toEqual({ pack: { description: expect.stringContaining('Example Pack'), min_format: [97, 1], max_format: [97, 1] } });
  });
```

`apps/site/src/translator/ui/ExportDialog.test.tsx` 的 `describe('ExportDialog', …)` 最後加入

```ts
  it('offers 26.x versions and passes the chosen one to the exporter', async () => {
    const { exportFn, onSave } = setup();
    const select = screen.getByLabelText('Minecraft 版本') as HTMLSelectElement;
    expect(Array.from(select.options).slice(0, 2).map((o) => o.value)).toEqual(['26.3', '26.2']);
    await userEvent.selectOptions(select, '26.3');
    await userEvent.click(screen.getByRole('button', { name: '下載' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(exportFn).toHaveBeenCalledWith([alpha, beta], expect.objectContaining({ kind: 'merged-pack', mcVersion: '26.3' }));
  });
```

- [ ] **Step 3: Write the failing E2E test** — `e2e/site.spec.ts`，在 `merged pack combines selected mods` 之後加入

```ts
test('merged pack for 26.3 writes min_format and max_format', async ({ page }) => {
  await gotoHydrated(page, '/mods/create/');
  await page.getByRole('button', { name: /加入合併資源包/ }).click();
  await gotoHydrated(page, '/pack/');
  await page.getByLabel('Minecraft 版本').selectOption('26.3');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載合併資源包（1 個模組）' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('create-zh_tw-26.3.zip');
  const zip = await unzipDownload(download);
  expect(zip.file('assets/create/lang/zh_tw.json')).not.toBeNull();
  const meta = JSON.parse((await zip.file('pack.mcmeta')?.async('string')) ?? '{}');
  expect(meta.pack).toMatchObject({ min_format: [97, 1], max_format: [97, 1] });
  expect(meta.pack).not.toHaveProperty('pack_format');
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -w @mlf/core`
Expected: FAIL — 版本表清單不符；`exportProjects(… '1.21.10')` 以「不支援的 Minecraft 版本：1.21.10」失敗；schema、manifest、`validateAddVersionArgs` 拒絕新版本；`resolveSourceRef` 回傳 null；`TRACKED_MC_VERSIONS[0]` 為 `'1.21.8'`。

Run: `npm test -w @mlf/site`
Expected: FAIL — `sortVersions` 把未知的 26.x 排到最後；`versionRange` 回傳 `1.21.10–1.21.1`；`fetchModpackData` 與 `fetchModData` 因 Minecraft 版本不支援而失敗；翻譯工具版本選單第一個選項是 `1.21.8`。

Run: `npm run build && E2E_PORT=8797 npx playwright test e2e/site.spec.ts -g "26.3"`
Expected: FAIL — 選單沒有 `26.3` 選項。

三段失敗訊息都記錄下來。

- [ ] **Step 5: Add the rows** — `packages/core/src/export/packFormats.ts` 的 `PACK_FORMATS` 開頭（`1.21.8` 之前）加入

```ts
  { mcVersion: '26.3', packFormat: 97, packFormatMinor: 1 },
  { mcVersion: '26.2', packFormat: 88, packFormatMinor: 0 },
  { mcVersion: '26.1.2', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '26.1.1', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '26.1', packFormat: 84, packFormatMinor: 0 },
  { mcVersion: '1.21.11', packFormat: 75, packFormatMinor: 0 },
  { mcVersion: '1.21.10', packFormat: 69, packFormatMinor: 0 },
  { mcVersion: '1.21.9', packFormat: 69, packFormatMinor: 0 },
```

- [ ] **Step 6: Clarify comments（行為不變）**

`packages/core/src/pipeline/modrinth.ts`：

```ts
/** JSON 語言檔自 1.13（pack_format 4）起才有效 */
export const JSON_LANG_MIN_PACK_FORMAT = 4;
```

改為

```ts
/** JSON 語言檔自 1.13（資源包格式主版本號 4）起才有效；比較 PackFormat.packFormat（主版本號） */
export const JSON_LANG_MIN_PACK_FORMAT = 4;
```

```ts
/** NeoForge 自 1.20.1 之後成為主流，同一 jar 同時標示 forge 與 neoforge 時依 MC 版本選擇 */
const LAST_FORGE_FIRST_PACK_FORMAT = 15;
```

改為

```ts
/** NeoForge 自 1.20.1 之後成為主流，同一 jar 同時標示 forge 與 neoforge 時依 MC 版本選擇（比較資源包格式主版本號） */
const LAST_FORGE_FIRST_PACK_FORMAT = 15;
```

`apps/site/src/islands/downloadModpack.ts`：

```ts
/** 已收錄模組（含手冊）＋ KubeJS 譯文合成一個資源包；pack_format 依整合包的 Minecraft 版本；沒有任何內容時為 null */
```

改為

```ts
/** 已收錄模組（含手冊）＋ KubeJS 譯文合成一個資源包；資源包格式（pack.mcmeta）依整合包的 Minecraft 版本；沒有任何內容時為 null */
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w @mlf/core && npm test -w @mlf/site && npm run typecheck -w @mlf/core && npm run typecheck -w @mlf/site && npm run lint && npm run validate:data`
Expected: PASS（既有的 `pack_format: 15`／`34` 斷言、`returns null for unknown mc versions or loaders`（`1.21.2`）不變；`validate:data` 無新 error）

Run: `npm run build && E2E_PORT=8797 npm run test:e2e`
Expected: PASS（含新的 `merged pack for 26.3 writes min_format and max_format`；`e2e/modpacks.spec.ts` 的 `pack_format` 15／34 不變）

- [ ] **Step 8: Commit**

```bash
git add packages/core/src apps/site/src e2e/site.spec.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat: support Minecraft 1.21.9 to 26.3 resource pack formats"
```

---

### Task 4: 最終驗證（integration）

**Files:** 無新增；只在驗證失敗時修正前面 task 的檔案。

- [ ] **Step 1: Check every numeric consumer is covered**

Run: `git grep -n -e packFormat -e PACK_FORMATS -- packages apps scripts e2e`
Expected: 只出現在 `packFormats.ts`、`buildResourcePack.ts`（經 `packFormatFor`）、`catalog/schema.ts`、`modpackImport/manifest.ts`、`pipeline/addSourceVersion.ts`、`pipeline/addVersionPlan.ts`、`pipeline/modrinth.ts`、`pipeline/trackPlan.ts`、`islands/pickVersion.ts`、`islands/PackPage.tsx`、`translator/ui/ExportDialog.tsx` 與測試；所有數字比較都讀 `packFormat`（主版本號），沒有地方讀 `packFormatMinor` 以外的次版本來源。若出現新的消費者，回到 Task 3 補測試。

- [ ] **Step 2: Full verification**

Run: `npm test -w @mlf/core && npm test -w @mlf/site && npm run lint && npm run typecheck -w @mlf/core && npm run typecheck -w @mlf/site && npm run validate:data && npm run test:coverage -w @mlf/core`
Expected: 全部 PASS；core 覆蓋率 ≥ 80%

Run: `npm run build && E2E_PORT=8797 npm run test:e2e`
Expected: PASS

- [ ] **Step 3: Confirm the branch only has LF files and no forbidden trailers**

Run: `git diff origin/main --stat` 與 `git diff origin/main --ignore-cr-at-eol --stat`
Expected: 輸出相同

Run: `git log origin/main..HEAD --format=%B`
Expected: 沒有 `Claude-Session`、`Co-Authored-By` 或 claude.ai 連結

- [ ] **Step 4: Manual in-game check（人工，不阻擋合併）**

在 26.3 用戶端載入網站下載的 26.3 合併資源包（`create-zh_tw-26.3.zip`），確認資源包清單沒有「不相容」標示、中文生效；結果寫在 PR 的「備註」。

PR：標題 `feat: 支援 Minecraft 1.21.9 以上與 26.x 的資源包`；說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。

---

## Spec Coverage

| Spec 項目 | Task |
|---|---|
| 背景表的資源包格式（69.0、75.0、84.0、88.0、97.1） | 3（`records the 1.21.9+ formats from the spec`） |
| 決策 1：加入 1.21.9 以上每個正式版，不補 1.21.9 以前的缺漏 | 3（完整清單斷言；`1.21.2` 仍為 null） |
| 決策 2：`{ mcVersion, packFormat, packFormatMinor }`、舊版次版本號 0、新到舊、26.x 在 1.21.x 前 | 1、3 |
| 決策 3：格式 < 65 用 `pack_format`；≥ 65 用 `min_format`／`max_format`（等於目標版本、不寫 `pack_format`、單一版本） | 2、3 |
| 決策 4：`packFormatFor` 未知版本丟出錯誤 | 1 |
| 決策 5：不改 `fetch:modrinth` 偏好版本、沿用每次最多 100 個 | 不改程式（`PREFERRED_MC_VERSIONS`、`track-versions.yml` 不動）；3 的 `TRACKED_MC_VERSIONS` 自動含新版本 |
| 影響範圍：`knownMcVersion`、`addSourceVersion` 排序、`add:version` 參數、`trackPlan`、網站選單與排序、整合包下載、翻譯工具版本選單 | 3 |
| 影響範圍：直接讀 `packFormat` 數字的地方（`JSON_LANG_MIN_PACK_FORMAT`、`loaderPreference`）改比主版本號 | 1（`packFormat` 定義為主版本號）、3（`prefers neoforge on 26.x`、`buildDraftMeta`、`validateAddVersionArgs` 測試；註解）、4（grep 檢查） |
| 網站文字：不需新文字 | 全部（不改 i18n） |
| 測試 core：1.20.1、1.21.8、1.21.10、26.3 的 `pack.mcmeta`；排序；未知版本錯誤；`knownMcVersion` 接受 26.3；追蹤版本含新版本 | 1、2、3 |
| 測試 site：版本選單 26.x 在 1.21.x 前；整合包 26.x 下載用 `min_format`／`max_format` | 3 |
| 測試 E2E：以範例資料下載 26.3 資源包並檢查 `pack.mcmeta` | 3（`/pack/` 用既有 `create` 選 26.3；不修改 `data/`——刻意不讓任何範例模組宣稱支援 26.3） |
| 遊戲內實測（人工） | 4 Step 4 |
| 不在範圍（缺漏舊版本、跨版本相容、主動抓新版本原文） | 未實作 |
