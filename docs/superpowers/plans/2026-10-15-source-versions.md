# 翻譯來源版本（sourceVersions）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `sourceVersions` 取代 `modVersion`，記錄翻譯實際抽取過的模組版本，提供工具把其他版本的 key 以聯集方式併入，並在網站顯示各版本涵蓋率。

**Architecture:** 純邏輯放在 `@mlf/core`：schema／驗證／涵蓋率在 `catalog/`，合併與 Modrinth 版本解析在 `pipeline/`。網路與檔案 I/O 只在 `scripts/`（共用 helper 抽到 `scripts/lib/modrinth.ts`）。網站只讀取 `versionCoverage` 結果來顯示。

**Tech Stack:** TypeScript 6、zod 4、vitest 5、tsx、Astro + React（apps/site）、Node ≥ 24。

**Spec:** `docs/superpowers/specs/2026-10-15-source-versions-design.md`

## Global Constraints

- Node `>=24`；zod `^4.6.7`；不新增任何依賴。
- 不可變：所有函式回傳新物件，不修改輸入（測試以 `Object.freeze` 驗證）。
- 使用者看得到的訊息（驗證錯誤、腳本輸出、網站文字）一律繁體中文。
- `mcVersions` 語意不變（模組支援版本）；資源包內容一律輸出 key 聯集，不依版本拆分。
- 單一檔案 < 800 行、函式 < 50 行。
- Commit 採 conventional commits（`feat:` / `refactor:` / `chore:` / `test:`）。

## Review Focus

1. **同一個 key 在新版本的格式碼不同**（例如 `%s` 改成 `%1$s %2$s`）→ 工具必須拒絕寫入、列出衝突。測試：Task 2 `flags format changes`。
2. **重複加入同一個來源版本** → 丟出錯誤，資料不變。測試：Task 2 `rejects a duplicate source version`。
3. **Modrinth 版本同時列多個 MC 版本／載入器**（如 `1.21`、`1.21.1`；`quilt`、`fabric`）→ 依偏好規則挑出唯一一組，不認得的版本回傳 null。測試：Task 2 `resolveSourceRef`。
4. **模組內建部分繁中**時加入新版本 → 內建已涵蓋的 key 不收錄，在新版本記為 `missingKeys`。測試：Task 3 `uncoveredKeys`。
5. **舊格式 `mod.json`**（仍是 `modVersion`、沒有 `sourceVersions`）在 Task 5 之後 → 驗證報出明確錯誤，而非靜默通過。測試：Task 5 `rejects legacy mod.json without sourceVersions`。

---

### Task 1: sourceVersions schema、驗證規則與涵蓋率

**Files:**
- Modify: `packages/core/src/catalog/schema.ts`
- Modify: `packages/core/src/catalog/validateMod.ts`
- Create: `packages/core/src/catalog/coverage.ts`
- Modify: `packages/core/src/catalog/index.ts`
- Test: `packages/core/src/catalog/catalog.test.ts`

**Interfaces:**
- Produces:
  - `sourceVersionSchema`、`type SourceVersion = { modVersion?: string; mcVersion: string; loader: Loader; missingKeys: string[] }`
  - `sourceVersionId(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string`
  - `CatalogMod.sourceVersions?: SourceVersion[]`（本 task 為選填，Task 5 改必填）
  - `versionCoverage(meta: Pick<CatalogMod, 'sourceVersions'>, en, zh): VersionCoverage[]`，`VersionCoverage = { source: SourceVersion; total: number; translated: number; percent: number }`

- [ ] **Step 1: 寫失敗測試**（附加到 `catalog.test.ts` 結尾，並把 import 改成含 `versionCoverage`）

```ts
import { catalogModSchema, catalogToProject, LICENSE_ALLOWLIST, validateModData, versionCoverage, type CatalogMod } from './index';
```

```ts
const sv = (patch: Record<string, unknown> = {}) => ({
  modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [], ...patch,
});

describe('sourceVersions schema', () => {
  it('accepts source versions and defaults missingKeys', () => {
    const parsed = catalogModSchema.parse(with_({ sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }] }));
    expect(parsed.sourceVersions).toEqual([{ mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }]);
  });

  it('allows the same mc version on different loaders', () => {
    const input = with_({ sourceVersions: [sv(), sv({ loader: 'fabric' })] });
    expect(catalogModSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['empty list', []],
    ['unknown mc version', [sv({ mcVersion: '0.1' })]],
    ['bad loader', [sv({ loader: 'rift' })]],
    ['duplicate version', [sv(), sv()]],
    ['empty missing key', [sv({ missingKeys: [''] })]],
  ])('rejects %s', (_label, list) => {
    expect(catalogModSchema.safeParse(with_({ sourceVersions: list })).success).toBe(false);
  });
});

describe('validateModData sourceVersions', () => {
  const en = { a: 'Apple %s', b: 'Banana' };

  it('accepts missingKeys that exist in en_us', () => {
    const meta = with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b'] })] });
    expect(validateModData('create', meta, en, {})).toEqual([]);
  });

  it('rejects missingKeys not in en_us', () => {
    const issues = validateModData('create', with_({ sourceVersions: [sv({ missingKeys: ['zzz'] })] }), en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', key: 'zzz' })]);
  });

  it('rejects duplicated missingKeys', () => {
    const meta = with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b', 'b'] })] });
    const issues = validateModData('create', meta, en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', key: 'b' })]);
  });

  it('rejects keys missing from every source version', () => {
    const issues = validateModData('create', with_({ sourceVersions: [sv({ missingKeys: ['b'] })] }), en, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'en_us.json', key: 'b' })]);
  });
});

describe('versionCoverage', () => {
  it("uses each version's own key set as the denominator", () => {
    const meta = catalogModSchema.parse(with_({ sourceVersions: [sv(), sv({ mcVersion: '1.20.1', missingKeys: ['b'] })] }));
    const result = versionCoverage(meta, { a: 'A', b: 'B' }, { a: '甲' });
    expect(result.map((r) => [r.source.mcVersion, r.translated, r.total, r.percent])).toEqual([
      ['1.21.1', 1, 2, 50],
      ['1.20.1', 1, 1, 100],
    ]);
  });

  it('treats empty translations as untranslated and handles zero keys', () => {
    const meta = catalogModSchema.parse(with_({ sourceVersions: [sv()] }));
    expect(versionCoverage(meta, { a: 'A' }, { a: '' })[0]).toMatchObject({ translated: 0, total: 1, percent: 0 });
    expect(versionCoverage(meta, {}, {})[0]).toMatchObject({ total: 0, percent: 0 });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w packages/core -- src/catalog/catalog.test.ts`
Expected: FAIL，`versionCoverage` 不存在／`sourceVersions` 被 zod 剝除。

- [ ] **Step 3: 實作 schema**（`schema.ts`，放在 `links` 定義之後、`catalogModSchema` 之前）

```ts
export const sourceVersionSchema = z.object({
  /** 抽取語言檔的 jar 版本；投稿者不清楚時可省略 */
  modVersion: z.string().min(1).optional(),
  mcVersion: knownMcVersion,
  loader: z.enum(LOADERS),
  /** en_us.json 中、此版本 jar 沒有（或模組內建繁中已涵蓋）的 key */
  missingKeys: z.array(z.string().min(1)).default([]),
});

export type SourceVersion = z.infer<typeof sourceVersionSchema>;

export function sourceVersionId(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string {
  return `${v.modVersion ?? ''}|${v.mcVersion}|${v.loader}`;
}

const sourceVersions = z
  .array(sourceVersionSchema)
  .min(1)
  .refine((list) => new Set(list.map(sourceVersionId)).size === list.length, { message: '來源版本不可重複' });
```

在 `catalogModSchema` 的 `modVersion` 那行下面加：

```ts
  sourceVersions: sourceVersions.optional(),
```

- [ ] **Step 4: 實作驗證**（`validateMod.ts`）

import 改為：

```ts
import { catalogModSchema, type CatalogMod } from './schema';
```

在 `crossIssues` 之前新增：

```ts
function sourceVersionIssues(meta: CatalogMod, en: Record<string, string>): ModIssue[] {
  const list = meta.sourceVersions ?? [];
  if (list.length === 0) return [];
  const perVersion = list.flatMap((v, i): ModIssue[] => {
    const prefix = `sourceVersions.${i}.missingKeys`;
    const unknown = v.missingKeys
      .filter((k) => !Object.hasOwn(en, k))
      .map((key): ModIssue => ({ level: 'error', file: 'mod.json', key, message: `${prefix}：en_us.json 中沒有此 key` }));
    const dupes = v.missingKeys
      .filter((k, j) => v.missingKeys.indexOf(k) !== j)
      .map((key): ModIssue => ({ level: 'error', file: 'mod.json', key, message: `${prefix}：key 重複` }));
    return [...unknown, ...dupes];
  });
  const missingSets = list.map((v) => new Set(v.missingKeys));
  const orphans = Object.keys(en)
    .filter((k) => missingSets.every((s) => s.has(k)))
    .map((key): ModIssue => ({ level: 'error', file: 'en_us.json', key, message: '所有來源版本都沒有此 key' }));
  return [...perVersion, ...orphans];
}
```

`validateModData` 結尾改為：

```ts
  if (base.some((i) => i.level === 'error')) return base;
  const enRecord = en as Record<string, string>;
  const meta = catalogModSchema.parse(metaRaw);
  return [...sourceVersionIssues(meta, enRecord), ...crossIssues(enRecord, zh as Record<string, string>)];
```

- [ ] **Step 5: 實作涵蓋率**（新檔 `coverage.ts`）

```ts
import type { CatalogMod, SourceVersion } from './schema';

export interface VersionCoverage {
  readonly source: SourceVersion;
  readonly total: number;
  readonly translated: number;
  readonly percent: number;
}

/** 計算每個來源版本的翻譯涵蓋率；分母為該版本實際擁有的 key */
export function versionCoverage(
  meta: Pick<CatalogMod, 'sourceVersions'>,
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
): VersionCoverage[] {
  return (meta.sourceVersions ?? []).map((source) => {
    const missing = new Set(source.missingKeys);
    const keys = Object.keys(en).filter((k) => !missing.has(k));
    const translated = keys.filter((k) => (zh[k] ?? '') !== '').length;
    const percent = keys.length === 0 ? 0 : Math.round((translated / keys.length) * 100);
    return { source, total: keys.length, translated, percent };
  });
}
```

`index.ts` 加一行：

```ts
export { versionCoverage, type VersionCoverage } from './coverage';
```

- [ ] **Step 6: 執行測試確認通過，並確認現有資料仍合法**

Run: `npm test -w packages/core -- src/catalog/catalog.test.ts && npm run validate:data`
Expected: 測試 PASS；`validate:data` 輸出 `0 個錯誤`（現有資料尚無 `sourceVersions`，不受影響）。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/catalog
git commit -m "feat: add sourceVersions schema, validation and per-version coverage"
```

---

### Task 2: 來源版本合併與 Modrinth 版本解析

**Files:**
- Create: `packages/core/src/pipeline/addSourceVersion.ts`
- Modify: `packages/core/src/pipeline/modrinth.ts`
- Modify: `packages/core/src/pipeline/index.ts`
- Test: `packages/core/src/pipeline/addSourceVersion.test.ts`

**Interfaces:**
- Consumes: `SourceVersion`、`sourceVersionId`、`LOADERS`、`CatalogMod`（Task 1）；`checkFormat`（`validate/formatCodes`）；`PACK_FORMATS`。
- Produces:
  - `type SourceRef = Omit<SourceVersion, 'missingKeys'>`
  - `interface VersionedSource { en: Readonly<Record<string,string>>; sourceVersions: readonly SourceVersion[] }`
  - `interface KeyConflict { key: string; existing: string; incoming: string; formatChanged: boolean }`
  - `addSourceVersion(current: VersionedSource, ref: SourceRef, incoming: Readonly<Record<string,string>>): AddVersionResult`（`AddVersionResult = VersionedSource & { addedKeys: readonly string[]; conflicts: readonly KeyConflict[] }`）；重複版本丟 `DuplicateSourceVersionError`
  - `withSourceVersions(meta: CatalogMod, sourceVersions: readonly SourceVersion[], today: string): CatalogMod`
  - `resolveSourceRef(v: ModrinthVersion): SourceRef | null`
  - `pickVersionFor(versions: readonly ModrinthVersion[], mcVersion: string, loader: string): ModrinthVersion | null`
  - `modrinthSlug(url: string | undefined): string | null`

- [ ] **Step 1: 寫失敗測試**（新檔 `addSourceVersion.test.ts`）

```ts
import { describe, expect, it } from 'vitest';
import { catalogModSchema, type SourceVersion } from '../catalog/schema';
import {
  addSourceVersion, DuplicateSourceVersionError, modrinthSlug, pickVersionFor, resolveSourceRef, withSourceVersions,
  type ModrinthVersion,
} from './index';

const v121: SourceVersion = { modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] };
const current = Object.freeze({
  en: Object.freeze({ a: 'Apple', b: 'Banana %s' }),
  sourceVersions: Object.freeze([Object.freeze(v121)]),
});
const ref120 = { modVersion: '1.5', mcVersion: '1.20.1', loader: 'forge' } as const;

describe('addSourceVersion', () => {
  it('appends new keys and records missing keys in both directions', () => {
    const r = addSourceVersion(current, ref120, { b: 'Banana %s', c: 'Cherry' });
    expect(r.en).toEqual({ a: 'Apple', b: 'Banana %s', c: 'Cherry' });
    expect(Object.keys(r.en)).toEqual(['a', 'b', 'c']);
    expect(r.addedKeys).toEqual(['c']);
    expect(r.sourceVersions).toEqual([
      { ...v121, missingKeys: ['c'] },
      { ...ref120, missingKeys: ['a'] },
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it('keeps existing text and reports a plain text conflict', () => {
    const r = addSourceVersion(current, ref120, { a: 'Red Apple', b: 'Banana %s' });
    expect(r.en.a).toBe('Apple');
    expect(r.conflicts).toEqual([{ key: 'a', existing: 'Apple', incoming: 'Red Apple', formatChanged: false }]);
  });

  it('flags format changes', () => {
    const r = addSourceVersion(current, ref120, { a: 'Apple', b: 'Banana %s of %s' });
    expect(r.conflicts).toEqual([{ key: 'b', existing: 'Banana %s', incoming: 'Banana %s of %s', formatChanged: true }]);
  });

  it('rejects a duplicate source version', () => {
    const ref = { modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' } as const;
    expect(() => addSourceVersion(current, ref, { a: 'Apple' })).toThrow(DuplicateSourceVersionError);
  });
});

describe('withSourceVersions', () => {
  it('writes source versions and merges mc versions / loaders in canonical order', () => {
    const meta = catalogModSchema.parse({
      modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
      mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
      translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
      updatedAt: '2026-01-01', sourceVersions: [v121],
    });
    const next = withSourceVersions(meta, [v121, { ...ref120, missingKeys: [] }], '2026-10-15');
    expect(next).toMatchObject({ mcVersions: ['1.21.1', '1.20.1'], loaders: ['forge', 'neoforge'], updatedAt: '2026-10-15' });
    expect(next.sourceVersions).toHaveLength(2);
    expect(meta.sourceVersions).toHaveLength(1);
  });
});

const mv = (patch: Partial<ModrinthVersion>): ModrinthVersion => ({
  id: 'x', version_number: '1.0', game_versions: ['1.21.1'], loaders: ['fabric'], date_published: '2026-01-01',
  files: [{ url: 'https://cdn.modrinth.com/x.jar', filename: 'x.jar', primary: true }], ...patch,
});

describe('resolveSourceRef', () => {
  it('prefers PREFERRED_MC_VERSIONS and the first known loader', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.21', '1.21.1'], loaders: ['quilt', 'fabric'] })))
      .toEqual({ modVersion: '1.0', mcVersion: '1.21.1', loader: 'fabric' });
  });

  it('falls back to the newest known mc version', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.18.2', '1.19.2'] }))?.mcVersion).toBe('1.19.2');
  });

  it('returns null for unknown mc versions or loaders', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.21.2'] }))).toBeNull();
    expect(resolveSourceRef(mv({ loaders: ['rift'] }))).toBeNull();
  });
});

describe('pickVersionFor', () => {
  it('picks the newest matching version with files', () => {
    const versions = [
      mv({ id: 'old', date_published: '2025-01-01', loaders: ['forge'], game_versions: ['1.20.1'] }),
      mv({ id: 'new', date_published: '2026-01-01', loaders: ['forge'], game_versions: ['1.20.1'] }),
      mv({ id: 'nofile', date_published: '2027-01-01', loaders: ['forge'], game_versions: ['1.20.1'], files: [] }),
      mv({ id: 'fabric', date_published: '2027-01-01', loaders: ['fabric'], game_versions: ['1.20.1'] }),
    ];
    expect(pickVersionFor(versions, '1.20.1', 'forge')?.id).toBe('new');
    expect(pickVersionFor(versions, '1.21.1', 'forge')).toBeNull();
  });
});

describe('modrinthSlug', () => {
  it('extracts the slug from a Modrinth mod url', () => {
    expect(modrinthSlug('https://modrinth.com/mod/xaeros-minimap')).toBe('xaeros-minimap');
    expect(modrinthSlug('https://modrinth.com/mod/jei/')).toBe('jei');
    expect(modrinthSlug('https://www.curseforge.com/minecraft/mc-mods/jei')).toBeNull();
    expect(modrinthSlug(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w packages/core -- src/pipeline/addSourceVersion.test.ts`
Expected: FAIL，`addSourceVersion` 等匯出不存在。

- [ ] **Step 3: 實作合併**（新檔 `addSourceVersion.ts`）

```ts
import { type CatalogMod, LOADERS, type SourceVersion, sourceVersionId } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { checkFormat } from '../validate/formatCodes';

export type SourceRef = Omit<SourceVersion, 'missingKeys'>;

export interface VersionedSource {
  readonly en: Readonly<Record<string, string>>;
  readonly sourceVersions: readonly SourceVersion[];
}

export interface KeyConflict {
  readonly key: string;
  readonly existing: string;
  readonly incoming: string;
  /** 格式碼不同：沿用既有原文會讓某些版本的譯文參數錯位，需人工處理 */
  readonly formatChanged: boolean;
}

export interface AddVersionResult extends VersionedSource {
  readonly addedKeys: readonly string[];
  readonly conflicts: readonly KeyConflict[];
}

export class DuplicateSourceVersionError extends Error {}

function findConflicts(en: Readonly<Record<string, string>>, incoming: Readonly<Record<string, string>>): KeyConflict[] {
  return Object.entries(incoming)
    .filter(([key, text]) => Object.hasOwn(en, key) && en[key] !== text)
    .map(([key, text]) => {
      const existing = en[key] ?? '';
      return { key, existing, incoming: text, formatChanged: checkFormat(existing, text) !== null };
    });
}

/** 把新來源版本的 en_us 併入既有資料；既有原文優先，新 key 依序附加在最後 */
export function addSourceVersion(
  current: VersionedSource,
  ref: SourceRef,
  incoming: Readonly<Record<string, string>>,
): AddVersionResult {
  const id = sourceVersionId(ref);
  if (current.sourceVersions.some((v) => sourceVersionId(v) === id)) {
    throw new DuplicateSourceVersionError(`來源版本已存在：${id}`);
  }
  const addedKeys = Object.keys(incoming).filter((k) => !Object.hasOwn(current.en, k));
  const absent = Object.keys(current.en).filter((k) => !Object.hasOwn(incoming, k));
  return {
    en: { ...current.en, ...Object.fromEntries(addedKeys.map((k) => [k, incoming[k] ?? ''])) },
    sourceVersions: [
      ...current.sourceVersions.map((v) => ({ ...v, missingKeys: [...v.missingKeys, ...addedKeys] })),
      { ...ref, missingKeys: absent },
    ],
    addedKeys,
    conflicts: findConflicts(current.en, incoming),
  };
}

/** 依來源版本更新 mod.json：寫入 sourceVersions，並把 mcVersion／loader 併入支援清單 */
export function withSourceVersions(meta: CatalogMod, sourceVersions: readonly SourceVersion[], today: string): CatalogMod {
  const mc = new Set([...meta.mcVersions, ...sourceVersions.map((v) => v.mcVersion)]);
  const loaders = new Set([...meta.loaders, ...sourceVersions.map((v) => v.loader)]);
  return {
    ...meta,
    sourceVersions: [...sourceVersions],
    mcVersions: PACK_FORMATS.map((f) => f.mcVersion).filter((v) => mc.has(v)),
    loaders: LOADERS.filter((l) => loaders.has(l)),
    updatedAt: today,
  };
}
```

- [ ] **Step 4: 實作 Modrinth 版本解析**（`modrinth.ts`，加在 `primaryFile` 之後；並在檔頭加 `import type { SourceRef } from './addSourceVersion';`）

```ts
/** 由 Modrinth 版本推斷來源版本；列出多個 MC 版本時優先 PREFERRED_MC_VERSIONS，再取最新的已知版本 */
export function resolveSourceRef(v: ModrinthVersion): SourceRef | null {
  const candidates = [...PREFERRED_MC_VERSIONS, ...PACK_FORMATS.map((f) => f.mcVersion)];
  const mcVersion = candidates.find((mc) => v.game_versions.includes(mc));
  const loader = LOADERS.find((l) => v.loaders.includes(l));
  return mcVersion && loader ? { modVersion: v.version_number, mcVersion, loader } : null;
}

/** 挑選指定 MC 版本與載入器中最新發佈、且有檔案的版本 */
export function pickVersionFor(versions: readonly ModrinthVersion[], mcVersion: string, loader: string): ModrinthVersion | null {
  return (
    versions
      .filter((v) => v.game_versions.includes(mcVersion) && v.loaders.includes(loader) && v.files.length > 0)
      .sort((a, b) => b.date_published.localeCompare(a.date_published))[0] ?? null
  );
}

const MODRINTH_MOD_URL = /^https:\/\/modrinth\.com\/mod\/([^/?#]+)\/?$/;

export function modrinthSlug(url: string | undefined): string | null {
  return url?.match(MODRINTH_MOD_URL)?.[1] ?? null;
}
```

- [ ] **Step 5: 更新匯出**（`pipeline/index.ts` 整檔替換）

```ts
export { BUILTIN_COMPLETE_PERCENT, MAX_KEYS, MIN_KEYS, selectForTranslation, type Selection } from './select';
export {
  buildDraftMeta, MACHINE_SOURCE_NAME, modrinthSlug, PREFERRED_MC_VERSIONS, pickVersion, pickVersionFor, primaryFile,
  resolveSourceRef, SUMMARY_PLACEHOLDER, type ModrinthHit, type ModrinthVersion,
} from './modrinth';
export {
  addSourceVersion, DuplicateSourceVersionError, withSourceVersions,
  type AddVersionResult, type KeyConflict, type SourceRef, type VersionedSource,
} from './addSourceVersion';
```

- [ ] **Step 6: 執行測試與型別檢查**

Run: `npm test -w packages/core && npm run typecheck -w packages/core`
Expected: 全部 PASS，無型別錯誤。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/pipeline
git commit -m "feat: merge source versions as key union and resolve Modrinth versions"
```

---

### Task 3: fetch:modrinth 直接產生 sourceVersions

**Files:**
- Modify: `packages/core/src/pipeline/select.ts`
- Modify: `packages/core/src/pipeline/modrinth.ts`（`buildDraftMeta`）
- Modify: `packages/core/src/pipeline/index.ts`
- Create: `scripts/lib/modrinth.ts`
- Modify: `scripts/fetch-modrinth.ts`
- Test: `packages/core/src/pipeline/pipeline.test.ts`

**Interfaces:**
- Consumes: `SourceRef`、`resolveSourceRef`（Task 2）。
- Produces:
  - `uncoveredKeys(d: DetectedMod): { keys: readonly string[]; builtinPercent?: number }`
  - `sourceOf(d: DetectedMod, keys: readonly string[]): Record<string, string>`
  - `buildDraftMeta({ hit, modId, source: SourceRef, builtinPercent?, today })`（取代 `modVersion` 參數，輸出 `sourceVersions` 而非 `modVersion`）
  - `scripts/lib/modrinth.ts`：`API`、`USER_AGENT`、`MODS_DIR`、`getJson<T>(url)`、`downloadJar(v)`、`largestNamespace(mods)`、`toJson(value)`

- [ ] **Step 1: 改測試**（`pipeline.test.ts`）

import 改為：

```ts
import { buildDraftMeta, pickVersion, selectForTranslation, sourceOf, uncoveredKeys, type ModrinthHit, type ModrinthVersion } from './index';
```

在 `selectForTranslation` describe 之後新增：

```ts
describe('uncoveredKeys', () => {
  it('returns every key in order when there is no built-in zh_tw', () => {
    expect(uncoveredKeys(detected(3))).toEqual({ keys: ['k0', 'k1', 'k2'] });
  });

  it('drops keys covered by built-in zh_tw and treats empty strings as uncovered', () => {
    const d = detected(4, { k0: '甲', k2: '' });
    expect(uncoveredKeys(d)).toEqual({ keys: ['k1', 'k2', 'k3'], builtinPercent: 25 });
    expect(sourceOf(d, ['k1', 'k3'])).toEqual({ k1: 'Text k1', k3: 'Text k3' });
  });
});
```

把兩個 `buildDraftMeta` 測試的呼叫改成傳 `source`：

```ts
    const meta = buildDraftMeta({ hit: legacyHit, modId: 'demo', source: { modVersion: '1', mcVersion: '1.20.1', loader: 'fabric' }, today: '2026-10-15' });
```

```ts
    const meta = buildDraftMeta({
      hit, modId: 'demo', source: { modVersion: '2.0.0', mcVersion: '1.21.1', loader: 'fabric' }, builtinPercent: 40, today: '2026-10-15',
    });
    const parsed = catalogModSchema.parse(meta);
    expect(parsed).toMatchObject({
      modId: 'demo', name: 'Demo Mod', authors: ['someone'], links: { modrinth: 'https://modrinth.com/mod/demo-mod' },
      mcVersions: ['1.21.1', '1.20.1', '1.19.2'], loaders: ['forge', 'fabric'],
      sourceVersions: [{ modVersion: '2.0.0', mcVersion: '1.21.1', loader: 'fabric', missingKeys: [] }],
      translation: { status: 'machine', license: 'CC-BY-SA-4.0', builtinPercent: 40 },
    });
    expect(meta).not.toHaveProperty('modVersion');
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w packages/core -- src/pipeline/pipeline.test.ts`
Expected: FAIL，`uncoveredKeys` 不存在、`sourceVersions` 未定義。

- [ ] **Step 3: 重構 `select.ts`**（`selectForTranslation` 行為不變）

```ts
export interface BuiltinCoverage {
  readonly keys: readonly string[];
  readonly builtinPercent?: number;
}

/** 模組內建繁中未涵蓋的 key（保持原順序）與內建涵蓋率 */
export function uncoveredKeys(d: DetectedMod): BuiltinCoverage {
  const total = d.order.length;
  const covered = new Set(d.order.filter((k) => (d.zhTw?.[k] ?? '') !== ''));
  const builtinPercent = d.zhTw && total > 0 ? Math.round((covered.size / total) * 100) : undefined;
  const keys = d.order.filter((k) => !covered.has(k));
  return builtinPercent !== undefined ? { keys, builtinPercent } : { keys };
}

export function sourceOf(d: DetectedMod, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, d.source[k] ?? '']));
}

/**
 * 決定模組是否需要翻譯，以及要翻哪些 key。
 * 模組內建 zh_tw 時只保留內建缺少的 key（資源包會與內建語言檔逐條合併），且不收錄作者的譯文。
 */
export function selectForTranslation(d: DetectedMod): Selection {
  const { keys, builtinPercent } = uncoveredKeys(d);
  if (builtinPercent !== undefined && builtinPercent >= BUILTIN_COMPLETE_PERCENT) {
    return { action: 'skip', reason: 'builtin-complete' };
  }
  if (keys.length < MIN_KEYS) return { action: 'skip', reason: 'too-small' };
  if (keys.length > MAX_KEYS) return { action: 'skip', reason: 'too-large' };
  return { action: 'include', en: sourceOf(d, keys), ...(builtinPercent !== undefined ? { builtinPercent } : {}) };
}
```

- [ ] **Step 4: 改 `buildDraftMeta`**（`modrinth.ts`）

`DraftInput` 的 `readonly modVersion: string;` 改為 `readonly source: SourceRef;`；函式簽章改為 `buildDraftMeta({ hit, modId, source, builtinPercent, today }: DraftInput)`；回傳物件的 `modVersion,` 那行改為：

```ts
    sourceVersions: [{ ...source, missingKeys: [] }],
```

`pipeline/index.ts` 第一行改為：

```ts
export { BUILTIN_COMPLETE_PERCENT, MAX_KEYS, MIN_KEYS, selectForTranslation, sourceOf, uncoveredKeys, type BuiltinCoverage, type Selection } from './select';
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -w packages/core && npm run typecheck -w packages/core`
Expected: PASS。

- [ ] **Step 6: 抽出腳本共用 helper**（新檔 `scripts/lib/modrinth.ts`，內容從 `fetch-modrinth.ts` 原樣搬移）

```ts
import { resolve } from 'node:path';
import { MAX_JAR_BYTES } from '@mlf/core/jar';
import { type ModrinthVersion, primaryFile } from '@mlf/core/pipeline';
import type { DetectedMod } from '@mlf/core';

export const API = 'https://api.modrinth.com/v2';
export const USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';
export const MODS_DIR = resolve(import.meta.dirname, '..', '..', 'data', 'mods');

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function downloadJar(v: ModrinthVersion): Promise<Uint8Array | null> {
  const file = primaryFile(v);
  if (!file || !file.filename.endsWith('.jar')) return null;
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${file.url}`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_JAR_BYTES) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export function largestNamespace(mods: readonly DetectedMod[]): DetectedMod | undefined {
  return [...mods].filter((m) => m.format === 'json').sort((a, b) => b.order.length - a.order.length)[0];
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
```

注意 `MODS_DIR` 多一層 `'..'`，因為檔案位於 `scripts/lib/`。

- [ ] **Step 7: 改 `fetch-modrinth.ts`**

刪除檔內的 `API`、`USER_AGENT`、`MODS_DIR`、`getJson`、`downloadJar`、`largestNamespace` 定義與 `resolve` import，改為：

```ts
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readJar } from '@mlf/core/jar';
import {
  buildDraftMeta, type ModrinthHit, type ModrinthVersion, pickVersion, PREFERRED_MC_VERSIONS, primaryFile, resolveSourceRef,
  selectForTranslation,
} from '@mlf/core/pipeline';
import type { DetectedMod } from '@mlf/core';
import { API, downloadJar, getJson, largestNamespace, MODS_DIR, toJson } from './lib/modrinth';

const PAGE_SIZE = 100;
```

`writeMod` 內的區域 `json` 函式刪除，改用 `toJson`。`processHit` 在 `pickVersion` 之後加：

```ts
  const source = resolveSourceRef(version);
  if (!source) return 'skip: unknown mc version or loader';
```

並把 `buildDraftMeta` 呼叫改為：

```ts
  const meta = buildDraftMeta({ hit, modId: detected.modId, source, builtinPercent: selection.builtinPercent, today });
```

- [ ] **Step 8: 驗證腳本可載入**

Run: `npm run lint && npx tsx -e "import('./scripts/lib/modrinth.ts').then(() => console.log('ok'))"`
Expected: lint 無錯誤，輸出 `ok`。

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/pipeline scripts
git commit -m "refactor: fetch:modrinth emits sourceVersions and shares Modrinth helpers"
```

---

### Task 4: 遷移現有資料的 modVersion

**Files:**
- Create: `packages/core/src/pipeline/migrate.ts`
- Modify: `packages/core/src/pipeline/index.ts`
- Create: `scripts/migrate-source-versions.ts`
- Modify: `package.json`（scripts）
- Modify: `data/mods/*/mod.json`（執行結果）
- Test: `packages/core/src/pipeline/addSourceVersion.test.ts`

**Interfaces:**
- Consumes: `SourceRef`、`resolveSourceRef`、`modrinthSlug`（Task 2）；`scripts/lib/modrinth.ts`（Task 3）。
- Produces: `migrateMeta(raw: Readonly<Record<string, unknown>>, ref: SourceRef): Record<string, unknown>`

- [ ] **Step 1: 寫失敗測試**（附加到 `addSourceVersion.test.ts`，並在 import 加入 `migrateMeta`）

```ts
describe('migrateMeta', () => {
  const ref = { modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'neoforge' } as const;

  it('replaces modVersion in place with sourceVersions', () => {
    const raw = Object.freeze({ modId: 'create', modVersion: '6.0.6', mcVersions: ['1.21.1'] });
    const next = migrateMeta(raw, ref);
    expect(Object.keys(next)).toEqual(['modId', 'sourceVersions', 'mcVersions']);
    expect(next.sourceVersions).toEqual([{ ...ref, missingKeys: [] }]);
    expect(raw).toHaveProperty('modVersion');
  });

  it('appends sourceVersions when modVersion is absent', () => {
    const next = migrateMeta({ modId: 'x' }, { mcVersion: '1.12.2', loader: 'forge' });
    expect(next).toEqual({ modId: 'x', sourceVersions: [{ mcVersion: '1.12.2', loader: 'forge', missingKeys: [] }] });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w packages/core -- src/pipeline/addSourceVersion.test.ts`
Expected: FAIL，`migrateMeta` 不存在。

- [ ] **Step 3: 實作**（新檔 `migrate.ts`）

```ts
import type { SourceRef } from './addSourceVersion';

/** 以 sourceVersions 取代舊的 modVersion；保留其他欄位與順序 */
export function migrateMeta(raw: Readonly<Record<string, unknown>>, ref: SourceRef): Record<string, unknown> {
  const sourceVersions = [{ ...ref, missingKeys: [] }];
  if (!Object.hasOwn(raw, 'modVersion')) return { ...raw, sourceVersions };
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => (key === 'modVersion' ? ['sourceVersions', sourceVersions] : [key, value])),
  );
}
```

`pipeline/index.ts` 加一行：

```ts
export { migrateMeta } from './migrate';
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -w packages/core -- src/pipeline/addSourceVersion.test.ts`
Expected: PASS。

- [ ] **Step 5: 遷移腳本**（新檔 `scripts/migrate-source-versions.ts`）

```ts
/**
 * 一次性遷移：把 mod.json 的 modVersion 轉為 sourceVersions（查 Modrinth 判斷 MC 版本與載入器）。
 * 用法：npm run migrate:source-versions
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateMeta, modrinthSlug, type ModrinthVersion, resolveSourceRef, type SourceRef } from '@mlf/core/pipeline';
import { API, getJson, MODS_DIR, toJson } from './lib/modrinth';

async function lookupRef(raw: Readonly<Record<string, unknown>>): Promise<SourceRef | null> {
  const links = raw.links as { modrinth?: string } | undefined;
  const slug = modrinthSlug(links?.modrinth);
  if (typeof raw.modVersion !== 'string' || !slug) return null;
  const versions = await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`);
  const match = versions.find((v) => v.version_number === raw.modVersion);
  return match ? resolveSourceRef(match) : null;
}

async function migrateOne(modId: string): Promise<string> {
  const file = join(MODS_DIR, modId, 'mod.json');
  const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  if (Array.isArray(raw.sourceVersions)) return 'skip: 已遷移';
  const ref = await lookupRef(raw);
  if (!ref) return 'MANUAL: 無法從 Modrinth 判斷，請手動填寫 sourceVersions';
  await writeFile(file, toJson(migrateMeta(raw, ref)), 'utf8');
  return `ok: ${ref.mcVersion} ${ref.loader} ${ref.modVersion ?? ''}`;
}

async function main(): Promise<void> {
  const dirs = (await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const modId of dirs) {
    let outcome: string;
    try {
      outcome = await migrateOne(modId);
    } catch (err) {
      outcome = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`${modId.padEnd(28)} ${outcome}`);
  }
}

main().catch((err: unknown) => {
  console.error('migrate-source-versions 執行失敗', err);
  process.exitCode = 1;
});
```

`package.json` 的 `scripts` 加：

```json
    "migrate:source-versions": "tsx scripts/migrate-source-versions.ts",
```

- [ ] **Step 6: 執行遷移**

Run: `npm run migrate:source-versions`
Expected: 大多數模組 `ok: ...`；至少 `examplelegacy` 為 `MANUAL`（沒有 `modVersion`）。

- [ ] **Step 7: 手動補 MANUAL 項目**

- `data/mods/examplelegacy/mod.json`：在 `links` 之後加
  `"sourceVersions": [{ "mcVersion": "1.12.2", "loader": "forge", "missingKeys": [] }],`
- 其他 `MANUAL` 項目：開啟 `https://modrinth.com/mod/<slug>/versions`，找到與 `modVersion` 相符（或前綴相符）的版本，依其 Game versions／Loaders 填寫；
  `mcVersion` 取 `1.21.1` 或 `1.20.1`（有的話），否則取最新的已知版本；`loader` 依 `forge, neoforge, fabric, quilt` 順序取第一個。
  `modVersion` 填 Modrinth 上的 version number，並刪除舊的 `modVersion` 欄位。
  若真的找不到，用 `mcVersions[0]` 與 `loaders[0]`、保留原 `modVersion` 字串，並在 commit body 列出這些模組。

- [ ] **Step 8: 驗證資料**

Run: `npm run validate:data && grep -l '"modVersion"' data/mods/*/mod.json | xargs -r grep -L sourceVersions`
Expected: `0 個錯誤`；第二個指令無輸出（沒有只剩 `modVersion` 而沒有 `sourceVersions` 的模組）。

- [ ] **Step 9: Commit**

```bash
git add package.json scripts/migrate-source-versions.ts packages/core/src/pipeline data/mods
git commit -m "chore: migrate mod.json modVersion to sourceVersions"
```

---

### Task 5: sourceVersions 改為必填並移除 modVersion

**Files:**
- Modify: `packages/core/src/catalog/schema.ts`
- Modify: `packages/core/src/catalog/validateMod.ts`
- Modify: `packages/core/src/catalog/coverage.ts`
- Modify: `packages/core/src/catalog/toProject.ts`
- Modify: `apps/site/src/translator/ui/contribution.ts`
- Modify: `apps/site/src/pages/mods/[modId].astro`（只刪 modVersion 那一列）
- Test: `packages/core/src/catalog/catalog.test.ts`、`packages/core/src/node/loadData.test.ts`、`apps/site/src/islands/pack.test.tsx`、`apps/site/src/translator/ui/ExportDialog.test.tsx`

**Interfaces:**
- Consumes: Task 1 schema。
- Produces: `CatalogMod.sourceVersions: SourceVersion[]`（必填、至少一筆）；`CatalogMod` 不再有 `modVersion`。

- [ ] **Step 1: 改測試 fixture 與新增測試**

`catalog.test.ts` 的 `valid` 物件，把 `modVersion: '6.0.6',` 換成：

```ts
  sourceVersions: [{ modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'forge', missingKeys: [] }],
```

把 `it('uses unknown version when modVersion missing', ...)` 的第一行改為：

```ts
    const meta = catalogModSchema.parse(with_({ sourceVersions: [{ mcVersion: '1.21.1', loader: 'forge' }] }));
```

並把測試名稱改為 `'uses unknown version when the first source has no modVersion'`。新增：

```ts
  it('uses the first source modVersion as project version', () => {
    expect(catalogToProject(catalogModSchema.parse(valid), {}, {}).version).toBe('6.0.6');
  });

  it('rejects legacy mod.json without sourceVersions', () => {
    const issues = validateModData('create', with_({ sourceVersions: undefined, modVersion: '6.0.6' }), { a: 'A' }, {});
    expect(issues).toEqual([expect.objectContaining({ level: 'error', file: 'mod.json', message: expect.stringContaining('sourceVersions') })]);
  });
```

`loadData.test.ts` 的 mod.json fixture（含 `mcVersions: ['1.20.1'],` 那個物件）加：

```ts
  sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
```

`apps/site/src/islands/pack.test.tsx` 的 `meta` 函式回傳物件加：

```ts
  sourceVersions: [{ mcVersion: mcVersions[0], loader: 'forge' }],
```

`ExportDialog.test.tsx`：

```ts
    expect(meta).toMatchObject({
      modId: 'alpha', format: 'json', updatedAt: '2026-10-15',
      sourceVersions: [{ modVersion: '2.0', mcVersion: '1.20.1', loader: 'forge', missingKeys: [] }],
    });
    expect(meta).not.toHaveProperty('modVersion');
```

以及 `betaMeta` 斷言後加：

```ts
    expect(betaMeta.sourceVersions[0]).toMatchObject({ mcVersion: '1.12.2', loader: 'forge' });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w packages/core && npm test -w apps/site`
Expected: FAIL（legacy 測試仍通過驗證、contribution 仍輸出 modVersion）。

- [ ] **Step 3: 改 schema 與相依程式**

`schema.ts`：刪除 `modVersion: z.string().min(1).optional(),`，並把 `sourceVersions: sourceVersions.optional(),` 改為 `sourceVersions,`。

`validateMod.ts` 的 `sourceVersionIssues` 開頭兩行改為：

```ts
  const list = meta.sourceVersions;
```

（刪除 `if (list.length === 0) return [];`，因為 schema 已保證至少一筆。）

`coverage.ts`：`(meta.sourceVersions ?? []).map(` 改為 `meta.sourceVersions.map(`。

`toProject.ts`：

```ts
    version: meta.sourceVersions[0]?.modVersion ?? 'unknown',
```

`contribution.ts` 的 `draftModJson`：

```ts
function draftModJson(p: ModProject, today: string): Record<string, unknown> {
  const mcVersion = p.format === 'lang' ? LEGACY_MC_VERSION : DEFAULT_MC_VERSION;
  return {
    modId: p.modId,
    name: p.name,
    aliases: [],
    summary: '（請改成一句話的繁體中文簡介）',
    authors: ['（請填寫模組作者）'],
    links: { modrinth: `https://modrinth.com/mod/${p.modId}` },
    mcVersions: [mcVersion],
    loaders: ['forge'],
    sourceVersions: [{ ...(p.version !== 'unknown' ? { modVersion: p.version } : {}), mcVersion, loader: 'forge', missingKeys: [] }],
    format: p.format,
    translation: {
      status: 'partial',
      license: 'CC-BY-SA-4.0',
      source: { name: 'ModLangForge 貢獻者', url: null },
      contributors: [],
    },
    updatedAt: today,
  };
}
```

README 步驟 3 改為：`'3. 檢查 mod.json：簡介、作者、連結、支援版本、載入器、來源版本（sourceVersions）。',`

`[modId].astro`：刪除 `{meta.modVersion && (...)}` 那一列（Task 7 會補上來源版本顯示）。

- [ ] **Step 4: 確認沒有殘留**

Run: `grep -rn "modVersion" packages apps scripts --include=*.ts --include=*.tsx --include=*.astro | grep -v node_modules | grep -v "sourceVersions\|SourceRef\|ref\.\|version_number\|migrate"`
Expected: 只剩 `source.modVersion`／`v.modVersion` 這類 sourceVersion 欄位的用法，以及 `zh-TW.ts` 的 `modVersion` 標籤（Task 7 處理）。

- [ ] **Step 5: 執行全部測試與資料驗證**

Run: `npm test && npm run typecheck -w packages/core && npm run validate:data && npm run lint`
Expected: 全部 PASS、`0 個錯誤`。

- [ ] **Step 6: Commit**

```bash
git add packages apps
git commit -m "refactor: require sourceVersions and drop modVersion from mod.json"
```

---

### Task 6: add:version 腳本

**Files:**
- Create: `scripts/add-source-version.ts`
- Modify: `package.json`（scripts）

**Interfaces:**
- Consumes: `addSourceVersion`、`withSourceVersions`、`pickVersionFor`、`modrinthSlug`、`primaryFile`、`uncoveredKeys`、`sourceOf`（Task 2、3）；`scripts/lib/modrinth.ts`；`catalogModSchema`、`LOADERS`。
- Produces: CLI `npm run add:version -- --mod <modId> --mc <mcVersion> --loader <loader>`

- [ ] **Step 1: 實作**（新檔 `scripts/add-source-version.ts`）

```ts
/**
 * 把模組的另一個版本加入翻譯來源：下載 jar、以聯集合併 en_us、更新 mod.json 的 sourceVersions。
 * 格式碼衝突時不寫入任何檔案。
 * 用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogModSchema, LOADERS, type CatalogMod } from '@mlf/core/catalog';
import { readJar } from '@mlf/core/jar';
import {
  addSourceVersion, type AddVersionResult, modrinthSlug, type ModrinthVersion, pickVersionFor, primaryFile, sourceOf,
  uncoveredKeys, withSourceVersions,
} from '@mlf/core/pipeline';
import { API, downloadJar, getJson, largestNamespace, MODS_DIR, toJson } from './lib/modrinth';

const USAGE = '用法：npm run add:version -- --mod <modId> --mc <mcVersion> --loader <forge|neoforge|fabric|quilt>';

type Loader = CatalogMod['loaders'][number];

function isLoader(value: string): value is Loader {
  return (LOADERS as readonly string[]).includes(value);
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function fetchIncoming(meta: CatalogMod, mc: string, loader: Loader): Promise<{ version: ModrinthVersion; en: Record<string, string> }> {
  const slug = modrinthSlug(meta.links.modrinth);
  if (!slug) throw new Error(`${meta.modId} 的 mod.json 沒有 Modrinth 連結`);
  const version = pickVersionFor(await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`), mc, loader);
  if (!version) throw new Error(`Modrinth 上找不到 ${slug} 的 ${mc} ${loader} 版本`);
  const jar = await downloadJar(version);
  if (!jar) throw new Error(`${version.version_number} 沒有可用的 jar（或超過大小上限）`);
  const mods = await readJar(jar, primaryFile(version)?.filename ?? 'mod.jar');
  const detected = mods.find((m) => m.modId === meta.modId && m.format === 'json') ?? largestNamespace(mods);
  if (!detected) throw new Error('jar 內沒有 JSON 語言檔');
  return { version, en: sourceOf(detected, uncoveredKeys(detected).keys) };
}

function reportConflicts(result: AddVersionResult): void {
  for (const c of result.conflicts) {
    console.log(`${c.formatChanged ? '格式碼衝突' : '原文不同'}  ${c.key}\n  既有：${c.existing}\n  新版：${c.incoming}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { mod: { type: 'string' }, mc: { type: 'string' }, loader: { type: 'string' } } });
  const { mod, mc, loader } = values;
  if (!mod || !mc || !loader || !isLoader(loader)) throw new Error(USAGE);
  const dir = join(MODS_DIR, mod);
  const meta = catalogModSchema.parse(await readJsonFile<unknown>(join(dir, 'mod.json')));
  const en = await readJsonFile<Record<string, string>>(join(dir, 'en_us.json'));
  const incoming = await fetchIncoming(meta, mc, loader);
  const ref = { modVersion: incoming.version.version_number, mcVersion: mc, loader };
  const result = addSourceVersion({ en, sourceVersions: meta.sourceVersions }, ref, incoming.en);
  reportConflicts(result);
  if (result.conflicts.some((c) => c.formatChanged)) {
    console.error('有格式碼衝突，未寫入任何檔案；請人工決定是否拆分版本或改寫原文。');
    process.exitCode = 1;
    return;
  }
  const today = new Date().toLocaleDateString('sv-SE');
  const nextMeta = catalogModSchema.parse(withSourceVersions(meta, result.sourceVersions, today));
  await writeFile(join(dir, 'mod.json'), toJson(nextMeta), 'utf8');
  await writeFile(join(dir, 'en_us.json'), toJson(result.en), 'utf8');
  console.log(`已加入 ${ref.modVersion}（${mc} ${loader}）：新增 ${result.addedKeys.length} 個 key、${result.conflicts.length} 個原文差異`);
}

main().catch((err: unknown) => {
  console.error('add-source-version 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

`package.json` 的 `scripts` 加：

```json
    "add:version": "tsx scripts/add-source-version.ts",
```

- [ ] **Step 2: 錯誤輸入檢查**

Run: `npm run add:version -- --mod modmenu --mc 1.20.1 --loader rift; echo "exit=$?"`
Expected: 印出 `用法：...`，`exit=1`，`git status data/` 無變化。

Run: `npm run add:version -- --mod modmenu --mc 1.20.1 --loader fabric; echo "exit=$?"`（再跑一次同指令驗證重複）
Expected: 第一次 `已加入 ...`，exit 0；第二次印出 `來源版本已存在`，exit 1。

- [ ] **Step 3: 驗證寫入結果**

Run: `npm run validate:data && git diff --stat data/mods/modmenu`
Expected: `0 個錯誤`；`mod.json` 多一筆 `sourceVersions`（`mcVersion: "1.20.1"`、`loader: "fabric"`），`en_us.json` 只在結尾新增 key。

- [ ] **Step 4: 還原試跑資料**（此 task 只交付工具；要不要實際補版本由維護者決定）

Run: `git checkout -- data/mods/modmenu`

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/add-source-version.ts
git commit -m "feat: add add:version script to merge another mod version's keys"
```

---

### Task 7: 網站顯示翻譯來源版本與各版本涵蓋率

**Files:**
- Modify: `apps/site/src/lib/format.ts`
- Modify: `apps/site/src/i18n/zh-TW.ts`
- Modify: `apps/site/src/pages/mods/[modId].astro`
- Modify: `README.md`
- Test: `apps/site/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `versionCoverage`、`SourceVersion`（Task 1／5）。
- Produces: `formatSourceVersion(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string`

- [ ] **Step 1: 寫失敗測試**（附加到 `format.test.ts`，import 加 `formatSourceVersion`）

```ts
describe('formatSourceVersion', () => {
  it('joins mc version, loader label and mod version', () => {
    expect(formatSourceVersion({ modVersion: '21.1.0.14', mcVersion: '1.21.1', loader: 'neoforge' })).toBe('1.21.1 · NeoForge · 21.1.0.14');
  });

  it('omits a missing mod version', () => {
    expect(formatSourceVersion({ mcVersion: '1.12.2', loader: 'forge' })).toBe('1.12.2 · Forge');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -w apps/site -- src/lib/format.test.ts`
Expected: FAIL，`formatSourceVersion` 不存在。

- [ ] **Step 3: 實作**

`format.ts` import 改為 `import type { CatalogMod, SourceVersion, TranslationStatus } from '@mlf/core/catalog';`，並新增：

```ts
export function formatSourceVersion(v: Pick<SourceVersion, 'modVersion' | 'mcVersion' | 'loader'>): string {
  return [v.mcVersion, LOADER_LABELS[v.loader], v.modVersion].filter((part) => part !== undefined).join(' · ');
}
```

`zh-TW.ts` 的 `modPage`：`mcVersions: '支援版本'` 改為 `mcVersions: '模組支援版本'`；刪除 `modVersion: '對應模組版本',`；新增 `sourceVersions: '翻譯來源版本',`。

`[modId].astro` frontmatter：

```ts
import { versionCoverage } from '@mlf/core/catalog';
import { displayName, formatDate, formatPercent, formatSourceVersion, LOADER_LABELS, modPageDescription, modPageTitle } from '../../lib/format';
```

並在 `const preview = ...` 下一行加 `const coverage = versionCoverage(meta, mod.en, mod.zh);`。在 aside `<dl>` 中 `loaders` 那列之後加：

```astro
          <dt class="text-slate-500">{t.modPage.sourceVersions}</dt>
          <dd>
            <ul class="space-y-1">
              {coverage.map((c) => (
                <li>{formatSourceVersion(c.source)} <span class="text-slate-500">· {formatPercent(c.percent)}</span></li>
              ))}
            </ul>
          </dd>
```

`README.md` 的指令區塊加兩行（放在 `fetch:modrinth` 之後）：

```
npm run add:version -- --mod <modId> --mc 1.20.1 --loader forge   # 把另一個模組版本的 key 併入翻譯
npm run migrate:source-versions                                    # 舊 mod.json 的 modVersion → sourceVersions
```

- [ ] **Step 4: 執行測試與建置**

Run: `npm test && npm run lint && npm run build`
Expected: 全部 PASS，建置成功。

- [ ] **Step 5: 確認頁面輸出**

Run: `grep -rl "翻譯來源版本" apps/site/dist/mods | head -3; grep -o "1.21.1 · NeoForge[^<]*" apps/site/dist/mods/biomesoplenty/index.html`
Expected: 有模組頁含「翻譯來源版本」；biomesoplenty 顯示其來源版本與百分比（實際字串依遷移結果）。若 dist 位置不同，改搜 `dist/`。

- [ ] **Step 6: Commit**

```bash
git add apps/site README.md
git commit -m "feat: show translation source versions and per-version coverage on mod page"
```
