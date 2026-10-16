# 自動追蹤模組版本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每週自動偵測已收錄模組在 Modrinth 上的新版本與新組合，寫入資料後開（或更新）單一 PR。

**Architecture:** 偵測（`planTracking`、`selectTargets`）、套用（`applyVersion`，以注入的 IO 讀寫與擷取）、摘要（`renderTrackSummary`）都放在 `packages/core/src/pipeline/` 可單元測試；`scripts/lib/addVersion.ts` 提供真實 IO，`add:version` 與新的 `track:versions` 共用；排程 workflow 執行腳本、驗證資料，再以 shell 腳本推送固定分支並開 PR。

**Tech Stack:** TypeScript、Vitest（core: node）、tsx、GitHub Actions、`gh` CLI。

**Spec:** `docs/superpowers/specs/2026-10-17-track-versions-design.md`

## Global Constraints

- 候選 MC 版本：`PACK_FORMATS` 中 `packFormat >= JSON_LANG_MIN_PACK_FORMAT` 者，新到舊；候選載入器：`LOADERS` 順序。
- 適用模組：`format === 'json'` 且 `modrinthSlug(links.modrinth)` 非 null。
- 更新判定：同組合已有列，且沒有任何列的 `modVersion` 等於 Modrinth 最新 `version_number`。
- 排序：全部模組的「更新」在前，「新增」在後；新增內依 MC 版本新到舊、再依 `LOADERS`；同條件依 modId 字母序。
- 上限：預設 30（`--max-builds`），全部模組合計；必須是正整數，否則腳本以錯誤結束。
- 單一目標失敗只記錄，不中斷；同一模組多個目標依序套用、每次重新讀檔。
- 同一 Modrinth 版本＋modId 的英文擷取在單次執行內快取（forge/neoforge 共用 jar、多 MC 版本共用條目）。
- PR：分支 `auto/track-versions`（強制推送）、標題 `chore(data): 追蹤模組新版本（YYYY-MM-DD）`、說明繁中、**不附任何 session 連結**；只在 `data/` 有變動時開。
- workflow 權限 `contents: write`、`pull-requests: write`；有 `TRACKER_TOKEN` 時用它，否則 `GITHUB_TOKEN` 並加註 CI 不會自動執行。
- commit 訊息與程式碼不得含 `Claude-Session` 或 session 連結。

## Review Focus

1. Modrinth 單一模組查詢失敗（HTTP 錯誤、slug 不存在）→ 該模組記為略過並附原因，其他模組照常。（Task 4 實作；Task 3 摘要測試涵蓋「略過」段落）
2. `--max-builds` 傳入 `0`、負數、`abc` → 立即以錯誤結束，不呼叫 Modrinth。（Task 4 測試 `parseMaxBuilds`）
3. 同一模組兩個目標先後寫入 → 第二個讀到第一個寫入後的檔案，不互相覆蓋。（Task 2 測試）
4. workflow 的 `max_builds` 輸入含 shell 特殊字元 → 只透過環境變數傳入，再由 `parseMaxBuilds` 拒絕。（Task 5 實作）
5. 沒有任何變動 → 不 commit、不推送、不開 PR。（Task 5 shell 腳本）

---

### Task 1: 偵測與挑選目標

**Files:**
- Create: `packages/core/src/pipeline/trackPlan.ts`
- Create: `packages/core/src/pipeline/trackPlan.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `CatalogMod`、`LOADERS`（catalog）、`PACK_FORMATS`（export）、`JSON_LANG_MIN_PACK_FORMAT`、`modrinthSlug`、`pickVersionFor`、`ModrinthVersion`（pipeline/modrinth）
- Produces:
  - `type Loader = CatalogMod['loaders'][number]`
  - `interface TrackTarget { kind: 'update' | 'add'; mcVersion: string; loader: Loader; version: ModrinthVersion; previous?: string }`
  - `type TrackPlan = { kind: 'skip'; reason: string } | { kind: 'track'; targets: readonly TrackTarget[] }`
  - `TRACKED_MC_VERSIONS: readonly string[]`
  - `planTracking(meta: CatalogMod, versions: readonly ModrinthVersion[]): TrackPlan`
  - `interface ModTarget { modId: string; target: TrackTarget }`
  - `selectTargets(items: readonly ModTarget[], max: number): { chosen: ModTarget[]; deferred: number }`

- [ ] **Step 1: Write the failing test** — `packages/core/src/pipeline/trackPlan.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogModSchema, type CatalogMod } from '../catalog/schema';
import { type ModrinthVersion, planTracking, selectTargets, TRACKED_MC_VERSIONS, type TrackTarget } from './index';

const metaWith = (over: Partial<Record<string, unknown>> = {}): CatalogMod => catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
  ...over,
});

const v = (id: string, num: string, games: string[], loaders: string[], date: string): ModrinthVersion => ({
  id, version_number: num, game_versions: games, loaders, date_published: date,
  files: [{ url: `https://cdn/${id}.jar`, filename: `${id}.jar`, primary: true }],
});

const summarize = (targets: readonly TrackTarget[]) => targets.map((t) => `${t.kind}:${t.mcVersion}:${t.loader}:${t.version.version_number}`);

describe('TRACKED_MC_VERSIONS', () => {
  it('lists JSON-capable versions newest first', () => {
    expect(TRACKED_MC_VERSIONS[0]).toBe('1.21.8');
    expect(TRACKED_MC_VERSIONS).not.toContain('1.12.2');
  });
});

describe('planTracking', () => {
  it('reports nothing when the tracked build is current and no other builds exist', () => {
    const plan = planTracking(metaWith(), [v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01')]);
    expect(plan).toEqual({ kind: 'track', targets: [] });
  });

  it('updates a tracked combination with a newer release', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('b', '2.1', ['1.21.1'], ['neoforge'], '2026-02-01'),
    ]);
    expect(plan.kind === 'track' && plan.targets).toEqual([
      expect.objectContaining({ kind: 'update', mcVersion: '1.21.1', loader: 'neoforge', previous: '2.0' }),
    ]);
  });

  it('updates a tracked row that has no recorded mod version', () => {
    const meta = metaWith({ sourceVersions: [{ mcVersion: '1.21.1', loader: 'neoforge' }] });
    const plan = planTracking(meta, [v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01')]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['update:1.21.1:neoforge:2.0']);
  });

  it('adds every untracked supported combination, newest MC first then loader order', () => {
    const plan = planTracking(metaWith(), [
      v('a', '2.0', ['1.21.1'], ['neoforge'], '2026-01-01'),
      v('c', '3.0', ['1.21.4'], ['fabric', 'quilt'], '2026-03-01'),
      v('d', '1.9', ['1.20.1'], ['forge'], '2025-12-01'),
      v('e', '0.1', ['1.12.2'], ['forge'], '2020-01-01'),
      v('f', '9.9', ['24w01a'], ['fabric'], '2026-04-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual([
      'add:1.21.4:fabric:3.0', 'add:1.21.4:quilt:3.0', 'add:1.20.1:forge:1.9',
    ]);
  });

  it('lists updates before additions', () => {
    const plan = planTracking(metaWith(), [
      v('b', '2.1', ['1.21.1'], ['neoforge'], '2026-02-01'),
      v('c', '3.0', ['1.21.4'], ['neoforge'], '2026-03-01'),
    ]);
    expect(plan.kind === 'track' && summarize(plan.targets)).toEqual(['update:1.21.1:neoforge:2.1', 'add:1.21.4:neoforge:3.0']);
  });

  it('skips .lang mods and mods without a Modrinth link', () => {
    expect(planTracking(metaWith({ format: 'lang' }), []).kind).toBe('skip');
    expect(planTracking(metaWith({ links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/demo' } }), []).kind).toBe('skip');
  });
});

describe('selectTargets', () => {
  const t = (kind: TrackTarget['kind'], mcVersion: string): TrackTarget => ({
    kind, mcVersion, loader: 'fabric', version: v(mcVersion, '1', [mcVersion], ['fabric'], '2026-01-01'),
  });

  it('takes updates across all mods first, then additions, up to the limit', () => {
    const items = [
      { modId: 'b', target: t('add', '1.21.4') },
      { modId: 'a', target: t('add', '1.20.1') },
      { modId: 'b', target: t('update', '1.21.1') },
      { modId: 'a', target: t('update', '1.21.1') },
    ];
    const { chosen, deferred } = selectTargets(items, 3);
    expect(chosen.map((c) => `${c.modId}:${c.target.kind}:${c.target.mcVersion}`)).toEqual(['a:update:1.21.1', 'b:update:1.21.1', 'b:add:1.21.4']);
    expect(deferred).toBe(1);
  });

  it('does not mutate its input', () => {
    const items = [{ modId: 'b', target: t('add', '1.21.4') }, { modId: 'a', target: t('update', '1.21.1') }];
    selectTargets(items, 1);
    expect(items.map((i) => i.modId)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- trackPlan`
Expected: FAIL（`planTracking` 等未匯出）

- [ ] **Step 3: Create `packages/core/src/pipeline/trackPlan.ts`**

```ts
import { type CatalogMod, LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { JSON_LANG_MIN_PACK_FORMAT, type ModrinthVersion, modrinthSlug, pickVersionFor } from './modrinth';

export type Loader = CatalogMod['loaders'][number];

export interface TrackTarget {
  readonly kind: 'update' | 'add';
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: ModrinthVersion;
  /** 更新時，原本記錄的版本號（未記錄時省略） */
  readonly previous?: string;
}

export type TrackPlan = { readonly kind: 'skip'; readonly reason: string } | { readonly kind: 'track'; readonly targets: readonly TrackTarget[] };

/** 可用 JSON 語言檔的 MC 版本，新到舊 */
export const TRACKED_MC_VERSIONS: readonly string[] = PACK_FORMATS.filter((f) => f.packFormat >= JSON_LANG_MIN_PACK_FORMAT).map((f) => f.mcVersion);

function targetFor(meta: CatalogMod, versions: readonly ModrinthVersion[], mcVersion: string, loader: Loader): TrackTarget | null {
  const latest = pickVersionFor(versions, mcVersion, loader);
  if (!latest) return null;
  const rows = meta.sourceVersions.filter((r) => r.mcVersion === mcVersion && r.loader === loader);
  if (rows.length === 0) return { kind: 'add', mcVersion, loader, version: latest };
  if (rows.some((r) => r.modVersion === latest.version_number)) return null;
  const previous = rows.map((r) => r.modVersion).filter((m): m is string => m !== undefined).at(-1);
  return previous === undefined
    ? { kind: 'update', mcVersion, loader, version: latest }
    : { kind: 'update', mcVersion, loader, version: latest, previous };
}

/** 找出已收錄組合的新版本，以及 Modrinth 上有、尚未收錄的支援組合；更新在前，新增依 MC 新到舊、再依載入器順序 */
export function planTracking(meta: CatalogMod, versions: readonly ModrinthVersion[]): TrackPlan {
  if (meta.format !== 'json') return { kind: 'skip', reason: '使用 .lang 語言檔，不支援自動追蹤' };
  if (!modrinthSlug(meta.links.modrinth)) return { kind: 'skip', reason: 'mod.json 沒有 Modrinth 連結' };
  const targets = TRACKED_MC_VERSIONS.flatMap((mc) => LOADERS.map((loader) => targetFor(meta, versions, mc, loader)))
    .filter((t): t is TrackTarget => t !== null);
  return { kind: 'track', targets: [...targets.filter((t) => t.kind === 'update'), ...targets.filter((t) => t.kind === 'add')] };
}

export interface ModTarget {
  readonly modId: string;
  readonly target: TrackTarget;
}

const mcRank = (mc: string): number => TRACKED_MC_VERSIONS.indexOf(mc);
const loaderRank = (loader: Loader): number => LOADERS.indexOf(loader);

function compareTargets(a: ModTarget, b: ModTarget): number {
  const kind = (a.target.kind === 'update' ? 0 : 1) - (b.target.kind === 'update' ? 0 : 1);
  return kind
    || mcRank(a.target.mcVersion) - mcRank(b.target.mcVersion)
    || loaderRank(a.target.loader) - loaderRank(b.target.loader)
    || a.modId.localeCompare(b.modId);
}

/** 全部模組合計取前 max 個目標；回傳新陣列，不修改輸入 */
export function selectTargets(items: readonly ModTarget[], max: number): { chosen: ModTarget[]; deferred: number } {
  const sorted = [...items].sort(compareTargets);
  return { chosen: sorted.slice(0, max), deferred: Math.max(0, sorted.length - max) };
}
```

- [ ] **Step 4: Export from `packages/core/src/pipeline/index.ts`** — 檔尾加入：

```ts
export { planTracking, selectTargets, TRACKED_MC_VERSIONS, type Loader, type ModTarget, type TrackPlan, type TrackTarget } from './trackPlan';
```

並在 `modrinth` 的 export 區塊中加入 `JSON_LANG_MIN_PACK_FORMAT`（若尚未匯出）。

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mlf/core -- trackPlan && npm run typecheck -w @mlf/core`
Expected: PASS（9 tests），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pipeline
git commit -m "feat(core): plan which mod versions to track"
```

---

### Task 2: 以注入 IO 套用版本，`add:version` 改用共用模組

**Files:**
- Create: `packages/core/src/pipeline/applyVersion.ts`
- Create: `packages/core/src/pipeline/applyVersion.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`
- Create: `scripts/lib/addVersion.ts`
- Modify: `scripts/add-source-version.ts`

**Interfaces:**
- Consumes: `planAddVersion`、`validateAddVersionArgs`、`KeyConflict`、`SourceVersion`、`Loader`（Task 1）、`ModrinthVersion`
- Produces:
  - `interface ModFiles { meta: CatalogMod; en: Readonly<Record<string, string>> }`
  - `interface ApplyVersionIO { readMod(modId): Promise<ModFiles>; writeMod(modId, files: ModFiles): Promise<void>; extractEn(version: ModrinthVersion, modId: string): Promise<Readonly<Record<string, string>>> }`
  - `interface ApplyTarget { mcVersion: string; loader: Loader; version: ModrinthVersion }`
  - `type ApplyResult = { kind: 'written'; addedKeys: number; conflicts: readonly KeyConflict[]; replaced: readonly SourceVersion[] } | { kind: 'conflict'; conflicts: readonly KeyConflict[] } | { kind: 'error'; message: string }`
  - `applyVersion(io: ApplyVersionIO, modId: string, target: ApplyTarget, today: string): Promise<ApplyResult>`
  - `scripts/lib/addVersion.ts`：`fileIO: ApplyVersionIO`、`cachedExtract(io: ApplyVersionIO): ApplyVersionIO`

- [ ] **Step 1: Write the failing test** — `packages/core/src/pipeline/applyVersion.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import { applyVersion, type ApplyVersionIO, type ModFiles, type ModrinthVersion } from './index';

const baseMeta = catalogModSchema.parse({
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01', sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' }],
});

const version = (num: string): ModrinthVersion => ({
  id: `id-${num}`, version_number: num, game_versions: ['1.21.1', '1.21.4'], loaders: ['neoforge'], date_published: '2026-02-01',
  files: [{ url: 'https://cdn/x.jar', filename: 'x.jar', primary: true }],
});

function memoryIO(start: ModFiles, incoming: Record<string, Record<string, string>>): ApplyVersionIO & { files: () => ModFiles } {
  let files = start;
  return {
    files: () => files,
    readMod: async () => files,
    writeMod: async (_id, next) => { files = next; },
    extractEn: async (v) => {
      const en = incoming[v.version_number];
      if (!en) throw new Error(`no jar for ${v.version_number}`);
      return en;
    },
  };
}

describe('applyVersion', () => {
  it('writes merged files and reports added keys', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', b: 'Banana' } });
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toMatchObject({ kind: 'written', addedKeys: 1 });
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana' });
    expect(io.files().meta.sourceVersions.map((s) => s.modVersion)).toContain('2.1');
  });

  it('does not write when a format code changed', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple %s' } }, { '2.1': { a: 'Apple %s %s' } });
    const writeMod = vi.spyOn(io, 'writeMod');
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result.kind).toBe('conflict');
    expect(writeMod).not.toHaveBeenCalled();
  });

  it('reports extraction failures as errors', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, {});
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result).toEqual({ kind: 'error', message: 'no jar for 2.1' });
  });

  it('reports unsupported targets as errors without extracting', async () => {
    const io = memoryIO({ meta: { ...baseMeta, format: 'lang' }, en: {} }, {});
    const extract = vi.spyOn(io, 'extractEn');
    const result = await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    expect(result.kind).toBe('error');
    expect(extract).not.toHaveBeenCalled();
  });

  it('applies consecutive targets on top of each other', async () => {
    const io = memoryIO({ meta: baseMeta, en: { a: 'Apple' } }, { '2.1': { a: 'Apple', b: 'Banana' }, '3.0': { a: 'Apple', c: 'Cherry' } });
    await applyVersion(io, 'demo', { mcVersion: '1.21.1', loader: 'neoforge', version: version('2.1') }, '2026-10-17');
    await applyVersion(io, 'demo', { mcVersion: '1.21.4', loader: 'neoforge', version: version('3.0') }, '2026-10-17');
    expect(io.files().en).toEqual({ a: 'Apple', b: 'Banana', c: 'Cherry' });
    expect(io.files().meta.sourceVersions.map((s) => `${s.mcVersion}:${s.modVersion}`)).toEqual(expect.arrayContaining(['1.21.1:2.1', '1.21.4:3.0']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- applyVersion`
Expected: FAIL（`applyVersion` 未匯出）

- [ ] **Step 3: Create `packages/core/src/pipeline/applyVersion.ts`**

```ts
import type { CatalogMod, SourceVersion } from '../catalog/schema';
import type { KeyConflict } from './addSourceVersion';
import { planAddVersion, validateAddVersionArgs } from './addVersionPlan';
import type { ModrinthVersion } from './modrinth';
import type { Loader } from './trackPlan';

export interface ModFiles {
  readonly meta: CatalogMod;
  readonly en: Readonly<Record<string, string>>;
}

/** 讀寫模組資料與擷取 jar 英文語言檔；腳本提供真實實作，測試注入假實作 */
export interface ApplyVersionIO {
  readonly readMod: (modId: string) => Promise<ModFiles>;
  readonly writeMod: (modId: string, files: ModFiles) => Promise<void>;
  readonly extractEn: (version: ModrinthVersion, modId: string) => Promise<Readonly<Record<string, string>>>;
}

export interface ApplyTarget {
  readonly mcVersion: string;
  readonly loader: Loader;
  readonly version: ModrinthVersion;
}

export type ApplyResult =
  | { readonly kind: 'written'; readonly addedKeys: number; readonly conflicts: readonly KeyConflict[]; readonly replaced: readonly SourceVersion[] }
  | { readonly kind: 'conflict'; readonly conflicts: readonly KeyConflict[] }
  | { readonly kind: 'error'; readonly message: string };

/** 把一個 Modrinth 版本併入模組資料；格式碼衝突時不寫入；任何例外轉為 error 結果 */
export async function applyVersion(io: ApplyVersionIO, modId: string, target: ApplyTarget, today: string): Promise<ApplyResult> {
  try {
    const { meta, en } = await io.readMod(modId);
    const argError = validateAddVersionArgs(meta, target.mcVersion);
    if (argError) return { kind: 'error', message: argError };
    const incoming = await io.extractEn(target.version, modId);
    const ref = { modVersion: target.version.version_number, mcVersion: target.mcVersion, loader: target.loader };
    const plan = planAddVersion(meta, en, ref, incoming, today);
    if (plan.kind === 'refused') return { kind: 'conflict', conflicts: plan.conflicts };
    await io.writeMod(modId, { meta: plan.meta, en: plan.en });
    return { kind: 'written', addedKeys: plan.addedKeys.length, conflicts: plan.conflicts, replaced: plan.replaced };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Export** — `packages/core/src/pipeline/index.ts` 檔尾加入：

```ts
export { applyVersion, type ApplyResult, type ApplyTarget, type ApplyVersionIO, type ModFiles } from './applyVersion';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mlf/core -- applyVersion && npm run typecheck -w @mlf/core`
Expected: PASS（5 tests），typecheck 無錯誤

- [ ] **Step 6: Create `scripts/lib/addVersion.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogModSchema } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import { writeFilesTogether } from '@mlf/core/node';
import { type ApplyVersionIO, type ModrinthVersion, primaryFile, selectNamespace, sourceOf, uncoveredKeys } from '@mlf/core/pipeline';
import { downloadJar, MODS_DIR, toJson } from './modrinth';

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function extractEn(version: ModrinthVersion, modId: string): Promise<Readonly<Record<string, string>>> {
  const jar = await downloadJar(version);
  if (!jar) throw new Error(`${version.version_number} 沒有可用的 jar（或超過大小上限）`);
  const detected = selectNamespace(await readJar(jar, primaryFile(version)?.filename ?? 'mod.jar'), modId);
  if (!detected) throw new Error(`jar 內沒有命名空間為 ${modId} 的 JSON 語言檔`);
  return sourceOf(detected, uncoveredKeys(detected).keys);
}

/** 讀寫 data/mods/<modId> 並從 Modrinth 下載 jar */
export const fileIO: ApplyVersionIO = {
  readMod: async (modId) => {
    const dir = join(MODS_DIR, modId);
    return {
      meta: catalogModSchema.parse(await readJsonFile(join(dir, 'mod.json'))),
      en: (await readJsonFile(join(dir, 'en_us.json'))) as Record<string, string>,
    };
  },
  writeMod: async (modId, { meta, en }) => {
    const dir = join(MODS_DIR, modId);
    await writeFilesTogether([
      { path: join(dir, 'mod.json'), content: toJson(catalogModSchema.parse(meta)) },
      { path: join(dir, 'en_us.json'), content: toJson(en) },
    ]);
  },
  extractEn,
};

/** 同一 Modrinth 版本＋modId 在單次執行內只下載、擷取一次 */
export function cachedExtract(io: ApplyVersionIO): ApplyVersionIO {
  const cache = new Map<string, Promise<Readonly<Record<string, string>>>>();
  return {
    ...io,
    extractEn: (version, modId) => {
      const key = `${version.id}\u0000${modId}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const pending = io.extractEn(version, modId);
      cache.set(key, pending);
      return pending;
    },
  };
}
```

- [ ] **Step 7: Rewrite `scripts/add-source-version.ts` to use it**

```ts
/**
 * 把模組的另一個版本加入翻譯來源：下載 jar、以聯集合併 en_us、更新 mod.json 的 sourceVersions。
 * 格式碼衝突時不寫入任何檔案。
 * 用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>
 */
import { parseArgs } from 'node:util';
import { LOADERS } from '@mlf/core/catalog';
import { applyVersion, type KeyConflict, type Loader, modrinthSlug, type ModrinthVersion, pickVersionFor, validateAddVersionArgs } from '@mlf/core/pipeline';
import { fileIO } from './lib/addVersion';
import { API, getJson } from './lib/modrinth';

const USAGE = '用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>';

function isLoader(value: string): value is Loader {
  return (LOADERS as readonly string[]).includes(value);
}

function reportConflicts(conflicts: readonly KeyConflict[]): void {
  for (const c of conflicts) {
    console.log(`${c.formatChanged ? '格式碼衝突' : '原文不同'}  ${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { mod: { type: 'string' }, mc: { type: 'string' }, loader: { type: 'string' } } });
  const { mod, mc, loader } = values;
  if (!mod || !mc || !loader || !isLoader(loader)) throw new Error(USAGE);
  const { meta } = await fileIO.readMod(mod);
  const argError = validateAddVersionArgs(meta, mc);
  if (argError) throw new Error(argError);
  const slug = modrinthSlug(meta.links.modrinth);
  if (!slug) throw new Error(`${meta.modId} 的 mod.json 沒有 Modrinth 連結`);
  const version = pickVersionFor(await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`), mc, loader);
  if (!version) throw new Error(`Modrinth 上找不到 ${slug} 的 ${mc} ${loader} 版本`);
  const result = await applyVersion(fileIO, mod, { mcVersion: mc, loader, version }, new Date().toLocaleDateString('sv-SE'));
  if (result.kind === 'error') throw new Error(result.message);
  reportConflicts(result.conflicts);
  if (result.kind === 'conflict') {
    console.error('有格式碼衝突，未寫入任何檔案；請人工決定是否拆分版本或改寫原文。');
    process.exitCode = 1;
    return;
  }
  for (const old of result.replaced) console.log(`已取代舊建置 ${old.modVersion ?? '（未記錄版本）'}（${old.mcVersion} ${old.loader}）`);
  console.log(`已加入 ${version.version_number}（${mc} ${loader}）：新增 ${result.addedKeys} 個 key、${result.conflicts.length} 個原文差異`);
}

main().catch((err: unknown) => {
  console.error('add-source-version 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Verify**

Run: `npm test -w @mlf/core && npm run lint && npx tsc --noEmit -p packages/core && npm run add:version -- --mod nonexistent --mc 1.21.1 --loader forge; echo "exit $?"`
Expected: 測試與 lint 通過；`add:version` 以「add-source-version 執行失敗」結束、exit 1（確認腳本可載入、錯誤處理正常）。

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/pipeline scripts/lib/addVersion.ts scripts/add-source-version.ts
git commit -m "refactor: share version application between add:version and tracking"
```

---

### Task 3: 追蹤摘要

**Files:**
- Create: `packages/core/src/pipeline/trackSummary.ts`
- Create: `packages/core/src/pipeline/trackSummary.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`

**Interfaces:**
- Consumes: `TrackTarget`（Task 1）、`ApplyResult`（Task 2）
- Produces:
  - `interface TrackReport { entries: readonly { modId: string; target: TrackTarget; result: ApplyResult }[]; skipped: readonly { modId: string; reason: string }[]; deferred: number }`
  - `renderTrackSummary(report: TrackReport): string`
  - `hasWrites(report: TrackReport): boolean`

- [ ] **Step 1: Write the failing test** — `packages/core/src/pipeline/trackSummary.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { hasWrites, type ModrinthVersion, renderTrackSummary, type TrackReport } from './index';

const ver = (num: string): ModrinthVersion => ({ id: num, version_number: num, game_versions: [], loaders: [], date_published: '', files: [] });

const report: TrackReport = {
  entries: [
    { modId: 'create', target: { kind: 'update', mcVersion: '1.21.1', loader: 'neoforge', version: ver('6.0.7'), previous: '6.0.6' },
      result: { kind: 'written', addedKeys: 12, conflicts: [], replaced: [] } },
    { modId: 'jei', target: { kind: 'add', mcVersion: '1.21.4', loader: 'fabric', version: ver('19.0') },
      result: { kind: 'written', addedKeys: 0, conflicts: [], replaced: [] } },
    { modId: 'balm', target: { kind: 'add', mcVersion: '1.21.4', loader: 'forge', version: ver('21.0') },
      result: { kind: 'conflict', conflicts: [{ key: 'a.b', existing: '%s', incoming: '%d', formatChanged: true }] } },
    { modId: 'moonlight', target: { kind: 'add', mcVersion: '1.20.1', loader: 'forge', version: ver('2.0') },
      result: { kind: 'error', message: 'HTTP 503' } },
  ],
  skipped: [{ modId: 'examplelegacy', reason: '使用 .lang 語言檔，不支援自動追蹤' }],
  deferred: 7,
};

describe('renderTrackSummary', () => {
  const md = renderTrackSummary(report);

  it('summarises counts', () => {
    expect(md).toContain('- 更新已收錄組合：1 組');
    expect(md).toContain('- 新增組合：1 組');
    expect(md).toContain('- 新增英文 key：12 個');
    expect(md).toContain('- 衝突未寫入：1 組');
    expect(md).toContain('- 錯誤：1 組');
    expect(md).toContain('- 超過上限、留到下次：7 組');
  });

  it('lists written, conflicting, failed and skipped items', () => {
    expect(md).toContain('| create | 1.21.1 NeoForge | 6.0.6 → 6.0.7 | 12 |');
    expect(md).toContain('| jei | 1.21.4 Fabric | 19.0（新增） | 0 |');
    expect(md).toContain('- balm 1.21.4 Forge 21.0：`a.b`');
    expect(md).toContain('- moonlight 1.20.1 Forge 2.0：HTTP 503');
    expect(md).toContain('- examplelegacy：使用 .lang 語言檔，不支援自動追蹤');
  });

  it('never contains session links', () => {
    expect(md).not.toMatch(/claude\.ai|Claude-Session/);
  });
});

describe('hasWrites', () => {
  it('is true only when something was written', () => {
    expect(hasWrites(report)).toBe(true);
    expect(hasWrites({ ...report, entries: report.entries.filter((e) => e.result.kind !== 'written') })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- trackSummary`
Expected: FAIL（`renderTrackSummary` 未匯出）

- [ ] **Step 3: Create `packages/core/src/pipeline/trackSummary.ts`**

```ts
import type { ApplyResult } from './applyVersion';
import type { Loader, TrackTarget } from './trackPlan';

export interface TrackEntry {
  readonly modId: string;
  readonly target: TrackTarget;
  readonly result: ApplyResult;
}

export interface TrackReport {
  readonly entries: readonly TrackEntry[];
  readonly skipped: readonly { readonly modId: string; readonly reason: string }[];
  readonly deferred: number;
}

const LOADER_NAMES: Readonly<Record<Loader, string>> = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', quilt: 'Quilt' };

const combo = (t: TrackTarget): string => `${t.mcVersion} ${LOADER_NAMES[t.loader]}`;
const versionCell = (t: TrackTarget): string =>
  t.kind === 'update' ? `${t.previous ?? '（未記錄）'} → ${t.version.version_number}` : `${t.version.version_number}（新增）`;

export function hasWrites(report: TrackReport): boolean {
  return report.entries.some((e) => e.result.kind === 'written');
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`## ${title}`, '', ...lines, ''];
}

export function renderTrackSummary(report: TrackReport): string {
  const written = report.entries.flatMap((e) => (e.result.kind === 'written' ? [{ ...e, added: e.result.addedKeys }] : []));
  const conflicts = report.entries.flatMap((e) => (e.result.kind === 'conflict' ? [{ ...e, keys: e.result.conflicts.filter((c) => c.formatChanged).map((c) => c.key) }] : []));
  const errors = report.entries.flatMap((e) => (e.result.kind === 'error' ? [{ ...e, message: e.result.message }] : []));
  const counts = [
    `- 更新已收錄組合：${written.filter((w) => w.target.kind === 'update').length} 組`,
    `- 新增組合：${written.filter((w) => w.target.kind === 'add').length} 組`,
    `- 新增英文 key：${written.reduce((sum, w) => sum + w.added, 0)} 個`,
    `- 衝突未寫入：${conflicts.length} 組`,
    `- 錯誤：${errors.length} 組`,
    `- 超過上限、留到下次：${report.deferred} 組`,
  ];
  return [
    '## 摘要', '', ...counts, '',
    ...section('已寫入', written.length === 0 ? [] : ['| 模組 | 組合 | 版本 | 新增 key |', '|---|---|---|---|',
      ...written.map((w) => `| ${w.modId} | ${combo(w.target)} | ${versionCell(w.target)} | ${w.added} |`)]),
    ...section('衝突（未寫入，需人工處理）', conflicts.map((c) => `- ${c.modId} ${combo(c.target)} ${c.target.version.version_number}：${c.keys.map((k) => `\`${k}\``).join('、')}`)),
    ...section('錯誤', errors.map((e) => `- ${e.modId} ${combo(e.target)} ${e.target.version.version_number}：${e.message}`)),
    ...section('略過的模組', report.skipped.map((s) => `- ${s.modId}：${s.reason}`)),
  ].join('\n');
}
```

- [ ] **Step 4: Export** — `packages/core/src/pipeline/index.ts` 檔尾加入：

```ts
export { hasWrites, renderTrackSummary, type TrackEntry, type TrackReport } from './trackSummary';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mlf/core -- trackSummary && npm run typecheck -w @mlf/core`
Expected: PASS（4 tests），typecheck 無錯誤

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pipeline
git commit -m "feat(core): render tracking summary"
```

---

### Task 4: `track:versions` 腳本

**Files:**
- Create: `packages/core/src/pipeline/parseMaxBuilds.ts`
- Create: `packages/core/src/pipeline/parseMaxBuilds.test.ts`
- Modify: `packages/core/src/pipeline/index.ts`
- Create: `scripts/track-versions.ts`
- Modify: `package.json`（scripts 加入 `"track:versions": "tsx scripts/track-versions.ts"`）

**Interfaces:**
- Consumes: `planTracking`、`selectTargets`、`ModTarget`（Task 1）、`applyVersion`（Task 2）、`renderTrackSummary`、`TrackReport`（Task 3）、`fileIO`、`cachedExtract`（Task 2）、`API`、`getJson`、`MODS_DIR`（scripts/lib/modrinth）
- Produces:
  - `DEFAULT_MAX_BUILDS = 30`、`parseMaxBuilds(raw: string | undefined): number`（不合法時拋出 Error）
  - CLI：`npm run track:versions -- [--max-builds <n>] [--summary <path>]`

- [ ] **Step 1: Write the failing test** — `packages/core/src/pipeline/parseMaxBuilds.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUILDS, parseMaxBuilds } from './index';

describe('parseMaxBuilds', () => {
  it('defaults when omitted or empty', () => {
    expect(parseMaxBuilds(undefined)).toBe(DEFAULT_MAX_BUILDS);
    expect(parseMaxBuilds('')).toBe(DEFAULT_MAX_BUILDS);
  });

  it('accepts positive integers', () => {
    expect(parseMaxBuilds('5')).toBe(5);
  });

  it.each(['0', '-3', 'abc', '2.5', '10; rm -rf /', '1e3'])('rejects %s', (raw) => {
    expect(() => parseMaxBuilds(raw)).toThrow('--max-builds');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- parseMaxBuilds`
Expected: FAIL（`parseMaxBuilds` 未匯出）

- [ ] **Step 3: Create `packages/core/src/pipeline/parseMaxBuilds.ts`**

```ts
export const DEFAULT_MAX_BUILDS = 30;

/** 解析 --max-builds；只接受正整數字串，未提供時使用預設值 */
export function parseMaxBuilds(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_MAX_BUILDS;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`--max-builds 必須是正整數：${raw}`);
  return Number(raw);
}
```

並在 `index.ts` 檔尾加入：

```ts
export { DEFAULT_MAX_BUILDS, parseMaxBuilds } from './parseMaxBuilds';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @mlf/core -- parseMaxBuilds`
Expected: PASS（8 tests）

- [ ] **Step 5: Create `scripts/track-versions.ts`**

```ts
/**
 * 偵測已收錄模組在 Modrinth 上的新版本與新組合並寫入資料。
 * 用法：npm run track:versions -- [--max-builds 30] [--summary <path>]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogModSchema } from '@mlf/core/catalog';
import {
  applyVersion, modrinthSlug, type ModrinthVersion, type ModTarget, parseMaxBuilds, planTracking, renderTrackSummary, selectTargets,
  type TrackEntry, type TrackReport,
} from '@mlf/core/pipeline';
import { cachedExtract, fileIO } from './lib/addVersion';
import { API, getJson, MODS_DIR } from './lib/modrinth';

type Skipped = TrackReport['skipped'][number];

async function planMod(modId: string): Promise<{ targets: ModTarget[]; skipped?: Skipped }> {
  try {
    const meta = catalogModSchema.parse(JSON.parse(await readFile(join(MODS_DIR, modId, 'mod.json'), 'utf8')));
    const slug = modrinthSlug(meta.links.modrinth);
    const versions = slug ? await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`) : [];
    const plan = planTracking(meta, versions);
    if (plan.kind === 'skip') return { targets: [], skipped: { modId, reason: plan.reason } };
    return { targets: plan.targets.map((target) => ({ modId, target })) };
  } catch (err) {
    return { targets: [], skipped: { modId, reason: `查詢失敗：${err instanceof Error ? err.message : String(err)}` } };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'max-builds': { type: 'string' }, summary: { type: 'string' } } });
  const max = parseMaxBuilds(values['max-builds']);
  const entries = await readdir(MODS_DIR, { withFileTypes: true });
  const modIds = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const plans = [];
  for (const modId of modIds) plans.push(await planMod(modId));
  const { chosen, deferred } = selectTargets(plans.flatMap((p) => p.targets), max);
  const io = cachedExtract(fileIO);
  const today = new Date().toLocaleDateString('sv-SE');
  const results: TrackEntry[] = [];
  for (const { modId, target } of chosen) {
    results.push({ modId, target, result: await applyVersion(io, modId, target, today) });
  }
  const report: TrackReport = { entries: results, skipped: plans.flatMap((p) => (p.skipped ? [p.skipped] : [])), deferred };
  const summary = renderTrackSummary(report);
  console.log(summary);
  if (values.summary) await writeFile(values.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  console.error('track-versions 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

並在根目錄 `package.json` 的 `scripts` 中 `"add:version"` 之後加入 `"track:versions": "tsx scripts/track-versions.ts",`。

- [ ] **Step 6: Verify input validation and a small real run**

Run: `npm run track:versions -- --max-builds 0; echo "exit $?"`
Expected: 「track-versions 執行失敗： --max-builds 必須是正整數：0」、exit 1。

Run: `npm run track:versions -- --max-builds 2 --summary /tmp/track-summary.md; echo "exit $?"; git status --short data | head; npm run validate:data | tail -1`
Expected: exit 0；摘要含「## 摘要」；若有寫入，`validate:data` 仍為 0 個錯誤。把摘要前幾行與寫入的模組記入 ledger，然後還原資料：`git checkout -- data`（真實資料更新由 workflow 的 PR 負責，不放進這個分支）。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/pipeline scripts/track-versions.ts package.json
git commit -m "feat: add track:versions script"
```

---

### Task 5: 排程 workflow、開 PR 腳本與文件

**Files:**
- Create: `.github/workflows/track-versions.yml`
- Create: `scripts/ci/open-tracking-pr.sh`
- Modify: `README.md`（「開發」指令區塊加入 `track:versions`；新增「自動追蹤版本」說明）
- Modify: `CONTRIBUTING.md`（說明自動 PR 的處理方式）

**Interfaces:**
- Consumes: `npm run track:versions -- --max-builds <n> --summary <path>`（Task 4）、`npm run validate:data`

- [ ] **Step 1: Create `scripts/ci/open-tracking-pr.sh`**

```bash
#!/usr/bin/env bash
# 把 data/ 的變動推到 auto/track-versions，開或更新單一 PR。需要 GH_TOKEN；沒有變動時什麼都不做。
set -euo pipefail

SUMMARY="${1:?用法：open-tracking-pr.sh <summary.md>}"
BRANCH="auto/track-versions"
BASE="${BASE_BRANCH:-main}"

if [ -z "$(git status --porcelain -- data)" ]; then
  echo "沒有資料變動，不開 PR。"
  exit 0
fi

TITLE="chore(data): 追蹤模組新版本（$(date -u +%F)）"
BODY="$(mktemp)"
cp "$SUMMARY" "$BODY"
if [ "${HAS_TRACKER_TOKEN:-false}" != "true" ]; then
  printf '\n> 此 PR 由 GITHUB_TOKEN 建立，CI 不會自動執行；請關閉再重新開啟 PR 以觸發 CI。\n' >> "$BODY"
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git checkout -B "$BRANCH"
git add data
git commit -m "$TITLE"
git push --force origin "$BRANCH"

EXISTING="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING" ]; then
  gh pr edit "$EXISTING" --title "$TITLE" --body-file "$BODY"
else
  gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$BODY"
fi
```

- [ ] **Step 2: Check the script**

Run: `bash -n scripts/ci/open-tracking-pr.sh && echo syntax-ok`
Expected: `syntax-ok`

Run（在暫存 repo 驗證「沒有變動」路徑）:
```bash
TMP=$(mktemp -d) && git -C "$TMP" init -q && mkdir -p "$TMP/data" && touch "$TMP/data/x" && git -C "$TMP" add -A && git -C "$TMP" -c user.name=t -c user.email=t@t commit -qm init && (cd "$TMP" && bash "$OLDPWD/scripts/ci/open-tracking-pr.sh" /dev/null); rm -rf "$TMP"
```
Expected: 印出「沒有資料變動，不開 PR。」且 exit 0（不會呼叫 git push 或 gh）。

- [ ] **Step 3: Create `.github/workflows/track-versions.yml`**

```yaml
name: Track mod versions

on:
  schedule:
    - cron: '0 2 * * 1'
  workflow_dispatch:
    inputs:
      max_builds:
        description: 本次最多處理的組合數
        required: false
        default: '30'

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: track-versions
  cancel-in-progress: false

jobs:
  track:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
        with:
          token: ${{ secrets.TRACKER_TOKEN || github.token }}
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Track versions
        env:
          MAX_BUILDS: ${{ inputs.max_builds || '30' }}
        run: npm run track:versions -- --max-builds "$MAX_BUILDS" --summary "$RUNNER_TEMP/summary.md"
      - name: Validate translation data
        run: npm run validate:data
      - name: Open or update pull request
        env:
          GH_TOKEN: ${{ secrets.TRACKER_TOKEN || github.token }}
          HAS_TRACKER_TOKEN: ${{ secrets.TRACKER_TOKEN != '' }}
          BASE_BRANCH: ${{ github.event.repository.default_branch }}
        run: bash scripts/ci/open-tracking-pr.sh "$RUNNER_TEMP/summary.md"
```

- [ ] **Step 4: Validate the workflow file**

Run: `node -e "require('fs').readFileSync('.github/workflows/track-versions.yml','utf8')" && grep -nE 'run:.*\$\{\{' .github/workflows/track-versions.yml; echo "exit $?"`
Expected: grep 沒有輸出、`exit 1`（`${{ }}` 只出現在 `env:`／`with:`，不直接插入 `run:` 指令）

- [ ] **Step 5: Document** — `README.md`「開發」指令區塊中 `npm run add:version …` 那一行之後加入：

```
npm run track:versions -- --max-builds 30   # 偵測已收錄模組的新版本與新組合並寫入（排程 workflow 每週執行）
```

並在 `## 部署` 之前加入：

```markdown
## 自動追蹤版本

`.github/workflows/track-versions.yml` 每週一 02:00（UTC）執行 `track:versions`，有變動時開（或更新）一個 `auto/track-versions` 的 PR；也可在 Actions 頁面手動執行並指定本次上限。

- 需在 repo 設定開啟「Settings → Actions → General → Allow GitHub Actions to create and approve pull requests」。
- 預設以 `GITHUB_TOKEN` 開 PR，此時 CI 不會自動執行（GitHub 的限制），workflow 已先跑過 `validate:data`；設定 `TRACKER_TOKEN` secret（具 contents、pull requests 寫入權限的 token）後，自動 PR 會照常觸發 CI。
```

`CONTRIBUTING.md` 的「## 新增模組」段落之後加入：

```markdown
## 自動追蹤版本的 PR

每週會出現 `chore(data): 追蹤模組新版本` 的 PR，內容是已收錄模組新版本的英文 key 與新支援的版本組合。審核時看說明中的「衝突」「錯誤」段落：衝突的組合沒有寫入，需要人工用 `npm run add:version` 處理或改寫原文。
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run validate:data && npm run test:coverage -w @mlf/core`
Expected: 全部 PASS；core 覆蓋率 ≥ 80%；`validate:data` 0 個錯誤

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/track-versions.yml scripts/ci/open-tracking-pr.sh README.md CONTRIBUTING.md
git commit -m "ci: track mod versions weekly and open a pull request"
```
