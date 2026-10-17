# 整合包每週自動追蹤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `npm run track:modpacks` 與每週一 03:00 UTC 執行的 `.github/workflows/track-modpacks.yml`：逐一檢查 `data/modpacks/` 已收錄的整合包在 Modrinth／CurseForge 是否有新版本，有就沿用 `add:modpack` 的 `runAddModpack`（不帶版本＝最新版）更新資料，結果以單一 PR（分支 `auto/track-modpacks`）送出；`open-tracking-pr.sh` 改為可用環境變數指定分支與標題，模組追蹤行為不變。

**Architecture:** 選版規則抽成共用函式：`modpackImport/modrinth.ts` 匯出 `listModrinthPackVersions`／`latestModrinthPackVersion`，`modpackImport/curseforge.ts` 匯出 `listCurseforgeFiles`／`latestClientFile`／`fileMatches`，`add:modpack` 的 `pickVersion`／`pickFile` 改用它們（行為不變）。新的 `modpackImport/track.ts`（`trackModpacks`）純邏輯、注入 IO：讀既有 `modpack.json`（沿用 `readExisting` 的 zod 驗證）→ 略過範例／無金鑰 → 便宜的「最新版本」預檢 → 不同才呼叫 `runAddModpack`，並以包裝過的 `write` 防止寫到別的 id、或在平台版本其實相同時寫入。`modpackImport/trackSummary.ts` 產生台灣繁中 PR 摘要（風格同 `pipeline/trackSummary.ts`），`modpackImport/trackArgs.ts` 解析 `--summary`。`scripts/track-modpacks.ts` 只負責接線（全域 `fetch`、`readExisting`／`writeModpack`、金鑰）。

**Tech Stack:** TypeScript、zod 4、Vitest（core: node）、tsx（腳本）、GitHub Actions、bash、`yaml`（測試解析 workflow）。

**Spec:** docs/superpowers/specs/2026-10-17-track-modpacks-design.md

## Global Constraints

- 新增腳本 `npm run track:modpacks`：逐一檢查已收錄的整合包是否有新版本，有就沿用 `add:modpack` 的更新流程（`runAddModpack`，不指定版本＝最新版）寫入。
- 新增 workflow `.github/workflows/track-modpacks.yml`：每週一 03:00 UTC 執行（模組追蹤的一小時後），也可手動觸發；結果以單一 PR 送出，分支 `auto/track-modpacks`。
- `scripts/ci/open-tracking-pr.sh` 改為可參數化分支與標題（模組追蹤沿用原本的值，行為不變）。
- CurseForge 整合包需要 secret `CURSEFORGE_API_KEY`；未設定時略過 CurseForge 整合包並在摘要中註明，不失敗。
- 範例整合包（id 以 `example-` 開頭）不追蹤。
- 檢查流程：讀 `modpack.json`（zod 驗證）；id 以 `example-` 開頭 → 略過（「範例資料」）。Modrinth：`GET /v2/project/<projectId>/version`，取 `date_published` 最新者的 `version_number`。CurseForge：沿用 4b 的檔案清單（分頁讀完），取最新非伺服器檔；比對方式與 `add:modpack` 選檔一致。最新版本與 `source.version` 相同 →「已是最新」。不同 → 呼叫 `runAddModpack`（不帶 `--version`）：`written` → 記錄新版本、新增 key 數、原文不同的條目、提示；`conflict`（格式碼改變）→ 不寫入，列為「需要人工處理」；`error`（例如 Minecraft 版本不在版本表、CurseForge 不允許第三方下載）→ 不寫入，列為「需要人工處理」並附訊息（金鑰已遮蔽）。
- 單一整合包失敗不影響其他整合包；整合包數量少，不設寫入上限，但依序處理。
- 摘要（PR 內文，台灣繁中）：已更新（整合包名稱、舊版本 → 新版本、Minecraft 版本、模組數變化、KubeJS／FTB 任務新增的 key 數）；需要人工處理（原因與訊息）；略過（已是最新、範例資料、缺少 CurseForge 金鑰）。沒有任何變動時不開 PR（沿用 `open-tracking-pr.sh` 的判斷）。
- Workflow：觸發 `schedule: cron '0 3 * * 1'`、`workflow_dispatch`；權限 `contents: write`、`pull-requests: write`；concurrency group `track-modpacks`；步驟 checkout（`persist-credentials: false`）→ setup-node 24 → `npm ci` → `npm run track:modpacks -- --summary "$RUNNER_TEMP/summary.md"`（env `CURSEFORGE_API_KEY: ${{ secrets.CURSEFORGE_API_KEY }}`）→ 摘要寫入 `$GITHUB_STEP_SUMMARY` → `npm run validate:data` → `open-tracking-pr.sh`（分支 `auto/track-modpacks`、標題 `chore(data): 追蹤整合包新版本（<UTC 日期>）`）。
- 金鑰只以環境變數傳給腳本；不寫入檔案、不出現在摘要或 log（沿用 `redact`）。
- 不在範圍：自動收錄新的整合包；整合包更新時自動補收錄新出現的模組；舊版本的保留（`data/modpacks` 只記錄目前收錄的版本，沿用 4b）。
- 不重複 helper：沿用 `runAddModpack`、`redact`、`CURSEFORGE_KEY_ENV`（`modpackImport/run.ts`）、`readExisting`／`writeModpack`／`MODPACKS_DATA_DIR`（`scripts/lib/modpackFiles.ts`）、`fakeFetch`、`modpackFixtures`；選版規則只存在於 `latestModrinthPackVersion`／`latestClientFile`／`fileMatches`（`add:modpack` 與追蹤共用）。
- 不可變：函式回傳新物件／陣列，不修改輸入；外部資料（Modrinth／CurseForge 回應、`modpack.json`）一律以 zod 驗證（沿用 `parseOrThrow`、`catalogModpackSchema`）；檔案 200–400 行為主、最多 800 行。
- 輸出文字（摘要、錯誤訊息、文件）：台灣繁中、玩家用語（modpack＝整合包）。
- CurseForge 金鑰：絕不寫死、印出或提交；測試只用 `fakeFetch` 與假金鑰 `CF_FAKE_KEY`；任何步驟都不對網路執行真實的 `track:modpacks` 或 `add:modpack`；絕不讀取 `.env`。
- 金鑰載入：本分支的腳本照 `scripts/add-modpack.ts` 目前的做法（`process.loadEnvFile(.env)`＋`process.env.CURSEFORGE_API_KEY?.trim()`）。`feat/curseforge-links` 合併後（新增 `scripts/lib/curseforgeKey.ts`），rebase 時可改用該載入器；不依賴該分支或 `feat/new-pack-formats` 的任何 API。
- TDD：每個 task 先寫失敗的測試、執行並記錄 RED，再實作到 PASS。core 覆蓋率（`npm run test:coverage -w @mlf/core`）維持 ≥ 80%。
- 驗證指令：`npm test -w @mlf/core`、`npm run lint`、`npm run typecheck -w @mlf/core`、`npm run validate:data`、`npm run test:coverage -w @mlf/core`。
- Commit：英文 Conventional Commits；絕不加 `Claude-Session` trailer、`Co-Authored-By` 或任何 claude.ai 連結。PR 標題 `feat: <繁中>`，說明用台灣繁中，只寫「摘要」「變更內容」（「備註」選填），不列測試、不附 session 連結。
- 換行：repo 檔案一律 LF。每次 commit 前確認 `git diff --cached --stat` 與 `git diff --cached --ignore-cr-at-eol --stat` 輸出相同（不同代表寫入了 CRLF，先轉回 LF）。git 指令一律在 worktree 根目錄逐條執行（不用 `cd … &&` 串接、不用 `git -C`）。

## 決策（spec 未明寫的細節）

| 問題 | 決定 |
|---|---|
| CurseForge 的 `source.version` 可能來自 `manifest.version`（例如 `1.4.0`），檔案清單只有 `displayName`／`fileName`／`id`，預檢比對不到 | 預檢照 spec 用 `fileMatches`（＝`add:modpack --version` 的比對）；比對不到就呼叫 `runAddModpack`。若匯入後的 `imported.version` 等於既有 `source.version`，包裝的 `write` 不寫入、結果記為「已是最新」——不會每週產生無意義的 PR（代價是這類整合包每週多下載一次 zip） |
| 平台上的 slug 改名 → `runAddModpack` 會算出另一個 id 並建立新資料夾 | 包裝的 `write` 只允許寫回原本的 id，否則丟出 `ModpackImportError`，結果為「需要人工處理」 |
| 傳給 `runAddModpack` 的 `ref` | `source.projectId`（Modrinth `/project/<id>`、CurseForge 數字 `/mods/<id>` 都接受） |
| 更新後的模組數 | 寫入後再 `readExisting(id)` 一次取 `meta.mods.length`（不改 `runAddModpack` 的回傳型別，避免與 `feat/curseforge-links` 衝突） |
| `redact` | 改為 `export`（`feat/curseforge-links` 做相同的改動；rebase 時保留一份即可） |
| 腳本參數解析要能測試 | 純函式 `parseTrackModpacksArgs` 放在 core（同 `parseMaxBuilds` 的做法），不用 `node:util` |
| workflow 的測試 | core 的 Vitest 用 `yaml` 解析兩個 workflow 並斷言觸發、權限、步驟順序、金鑰只出現在追蹤步驟；`yaml@^2.9.1` 已在 lockfile（間接相依），改列為根目錄 devDependency |
| 有「需要人工處理」時腳本是否失敗 | 不失敗（exit 0），否則後面開 PR 的步驟不會執行；問題寫在摘要中 |
| `open-tracking-pr.sh` 會 force-push | `TRACK_BRANCH` 必須以 `auto/` 開頭，否則立即結束 |

## Review Focus

1. 金鑰外洩：預檢與匯入錯誤、摘要、寫入的檔案都不含金鑰；workflow 只在追蹤步驟把 `CURSEFORGE_API_KEY` 以環境變數傳入。（Task 2 `redacts the key from failures and never puts it in the report`；Task 4 `passes CURSEFORGE_API_KEY only to the track step, as an environment variable`）
2. CurseForge 版本字串不一致造成每週重複 PR：manifest 版本與既有版本相同時不寫入並記為「已是最新」。（Task 2 `treats a CurseForge pack whose manifest version equals the stored one as current without writing`）
3. slug 改名不可寫到新的 id：（Task 2 `refuses to write when the platform slug now maps to another id`）
4. `open-tracking-pr.sh` 的模組追蹤預設值不變、只會 force-push `auto/` 分支。（Task 4 `keeps track-versions on the default branch and title`、`only force-pushes auto/ branches`）
5. 單一失敗不影響其他、依序處理；範例與缺金鑰在任何網路請求前略過；選版規則與 `add:modpack` 相同。（Task 2 `keeps going after failures and lists them as manual work`、`skips example packs and CurseForge packs without a key before any request`；Task 1 `picks the newest date_published like add:modpack`、`picks the newest non-server file like add:modpack`）

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `packages/core/src/modpackImport/modrinth.ts`（修改） | 匯出 `ModrinthPackVersion`、`listModrinthPackVersions`、`latestModrinthPackVersion`；`pickVersion` 與 `importFromModrinth` 改用它們 |
| `packages/core/src/modpackImport/curseforge.ts`（修改） | 匯出 `CurseforgeFile`、`fileMatches`、`latestClientFile`、`listCurseforgeFiles`（原 `listFiles`）；`pickFile` 改用它們 |
| `packages/core/src/modpackImport/run.ts`（修改） | `redact` 改為 `export` |
| `packages/core/src/modpackImport/track.ts` | `trackModpacks`、`isCurrentVersion`、`TrackModpacksIO`、`ModpackUpdate`、`ModpackTrackEntry`、`ModpackTrackReport`、`EXAMPLE_ID_PREFIX`、`SKIP_*` |
| `packages/core/src/modpackImport/trackSummary.ts` | `renderModpackTrackSummary`、`NO_UPDATES_LINE` |
| `packages/core/src/modpackImport/trackArgs.ts` | `parseTrackModpacksArgs`、`TRACK_MODPACKS_USAGE`、`TrackModpacksArgs` |
| `packages/core/src/modpackImport/index.ts`（修改） | 匯出新模組 |
| `packages/core/src/modpackImport/track.test.ts`、`trackSummary.test.ts`、`trackArgs.test.ts`、`trackWorkflow.test.ts` | 測試（`trackWorkflow.test.ts` 讀 repo 根目錄的 workflow、shell 腳本與 `package.json`） |
| `scripts/ci/open-tracking-pr.sh`（修改） | `TRACK_BRANCH`／`TRACK_TITLE`（預設值＝模組追蹤） |
| `.github/workflows/track-modpacks.yml` | 每週整合包追蹤 |
| `scripts/track-modpacks.ts` | CLI 接線 |
| `package.json`（修改） | `track:modpacks` script、devDependency `yaml` |
| `docs/development.md`（修改） | 指令、workflow 與 `CURSEFORGE_API_KEY` secret 說明 |

---

### Task 1: 共用的「最新版本」選擇（pure core (full code given)）

**Files:**
- Modify: `packages/core/src/modpackImport/modrinth.ts`
- Modify: `packages/core/src/modpackImport/curseforge.ts`
- Modify: `packages/core/src/modpackImport/run.ts`
- Test: `packages/core/src/modpackImport/modrinth.test.ts`、`curseforge.test.ts`、`run.test.ts`（只新增 describe；既有測試不改，全部須維持 PASS＝`add:modpack` 行為不變）

**Interfaces:**
- Consumes: `versionsSchema`、`filesSchema`、`fetchJson`、`parseOrThrow`、`apiInit`（皆既有、檔案內部）
- Produces:
  - `type ModrinthPackVersion`；`listModrinthPackVersions(fetchImpl: FetchLike, projectId: string): Promise<ModrinthPackVersion[]>`；`latestModrinthPackVersion(versions: readonly ModrinthPackVersion[]): ModrinthPackVersion | undefined`
  - `type CurseforgeFile`；`fileMatches(file: CurseforgeFile, wanted: string): boolean`；`latestClientFile(files: readonly CurseforgeFile[]): CurseforgeFile | undefined`；`listCurseforgeFiles(fetchImpl: FetchLike, modId: number, apiKey: string): Promise<CurseforgeFile[]>`
  - `redact(message: string, secret: string | undefined): string`（改為匯出）

- [ ] **Step 1: Write the failing tests**

`packages/core/src/modpackImport/modrinth.test.ts`：import 改為

```ts
import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../test/fakeFetch';
import { KUBEJS_EN, MR_API, MR_INDEX_121, MR_OLD_PACK_URL, modrinthRoutes, mrpackBytes, QUEST_EN, QUEST_LANG_SNBT } from '../test/modpackFixtures';
import { importFromModrinth, latestModrinthPackVersion, listModrinthPackVersions, USER_AGENT } from './index';
```

檔案最後加入：

```ts
describe('listModrinthPackVersions / latestModrinthPackVersion', () => {
  it('picks the newest date_published like add:modpack', async () => {
    const versions = await listModrinthPackVersions(fakeFetch(await modrinthRoutes()), 'AbCd1234');
    expect(versions.map((v) => v.version_number)).toEqual(['1.3.0', '1.4.0']);
    expect(latestModrinthPackVersion(versions)?.version_number).toBe('1.4.0');
    expect(versions.map((v) => v.version_number)).toEqual(['1.3.0', '1.4.0']);
    expect(latestModrinthPackVersion([])).toBeUndefined();
  });

  it('encodes the project id and validates the payload', async () => {
    const f = fakeFetch({ [`${MR_API}/project/a%2Fb/version`]: [{ version_number: '' }] });
    await expect(listModrinthPackVersions(f, 'a/b')).rejects.toThrow('Modrinth 版本 格式不符');
  });
});
```

`packages/core/src/modpackImport/curseforge.test.ts`：import 的 `./index` 那行改為

```ts
import { fileMatches, importFromCurseforge, latestClientFile, listCurseforgeFiles, noDownloadMessage } from './index';
```

檔案最後加入：

```ts
describe('listCurseforgeFiles / latestClientFile / fileMatches', () => {
  it('picks the newest non-server file like add:modpack, sending the key only with redirect: error', async () => {
    const f = fakeFetch(await curseforgeRoutes());
    const files = await listCurseforgeFiles(f, 555, CF_FAKE_KEY);
    expect(files.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(latestClientFile(files)?.displayName).toBe('Example Pack 1.4.0');
    expect(files.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(latestClientFile(files.filter((x) => x.isServerPack === true))).toBeUndefined();
    expect(f.calls[0]).toMatchObject({ url: `${CF_API}/mods/555/files?pageSize=50&index=0`, init: { redirect: 'error', headers: { 'x-api-key': CF_FAKE_KEY } } });
  });

  it('matches a stored version by display name, file name or id, like --version', async () => {
    const [, file] = await listCurseforgeFiles(fakeFetch(await curseforgeRoutes()), 555, CF_FAKE_KEY);
    for (const v of ['Example Pack 1.4.0', 'example-1.4.0.zip', '2']) expect(fileMatches(file!, v)).toBe(true);
    expect(fileMatches(file!, '1.4.0')).toBe(false);
  });
});
```

`packages/core/src/modpackImport/run.test.ts`：`./index` 的 import 加入 `redact`，檔案最後加入：

```ts
describe('redact', () => {
  it('hides every occurrence of the secret and leaves text alone without one', () => {
    expect(redact(`a ${CF_FAKE_KEY} b ${CF_FAKE_KEY}`, CF_FAKE_KEY)).toBe('a [已隱藏] b [已隱藏]');
    expect(redact('plain', undefined)).toBe('plain');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- modpackImport/modrinth modpackImport/curseforge modpackImport/run`
Expected: FAIL — `TypeError: listModrinthPackVersions is not a function`、`listCurseforgeFiles is not a function`、`redact is not a function`（既有測試 PASS）。記錄 RED 輸出。

- [ ] **Step 3: Implement**

`packages/core/src/modpackImport/modrinth.ts`：把 `type MrVersion = z.infer<typeof versionsSchema>[number];` 換成

```ts
export type ModrinthPackVersion = z.infer<typeof versionsSchema>[number];
type MrVersion = ModrinthPackVersion;
```

在 `pickVersion` 之前加入：

```ts
/** 最新發佈的版本（date_published 最大者）；add:modpack 的預設版本與每週追蹤共用此規則 */
export function latestModrinthPackVersion(versions: readonly MrVersion[]): MrVersion | undefined {
  return [...versions].sort((a, b) => b.date_published.localeCompare(a.date_published))[0];
}

/** GET /project/<id>/version（zod 驗證） */
export async function listModrinthPackVersions(fetchImpl: FetchLike, projectId: string): Promise<MrVersion[]> {
  const raw = await fetchJson(fetchImpl, `${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version`);
  return parseOrThrow(versionsSchema, raw, 'Modrinth 版本');
}
```

`pickVersion` 的最後三行改為：

```ts
  const latest = latestModrinthPackVersion(versions);
  if (!latest) throw new ModpackImportError('Modrinth 上沒有任何版本');
  return latest;
```

`importFromModrinth` 的 `Promise.all` 第二項改為 `listModrinthPackVersions(fetchImpl, project.id),`（`project.id` 為英數字，網址與原本相同）。

`packages/core/src/modpackImport/curseforge.ts`：把 `type CfFile = z.infer<typeof filesSchema>['data'][number];` 換成

```ts
export type CurseforgeFile = z.infer<typeof filesSchema>['data'][number];
type CfFile = CurseforgeFile;
```

`pickFile` 換成：

```ts
/** --version 與已收錄版本共用的比對方式：displayName、fileName 或檔案 id */
export function fileMatches(file: CfFile, wanted: string): boolean {
  return file.displayName === wanted || file.fileName === wanted || String(file.id) === wanted;
}

/** 最新的非伺服器檔（fileDate 最大者）；add:modpack 的預設檔案與每週追蹤共用此規則 */
export function latestClientFile(files: readonly CfFile[]): CfFile | undefined {
  return files.filter((f) => f.isServerPack !== true).sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
}

function pickFile(files: readonly CfFile[], wanted: string | undefined): CfFile {
  if (wanted !== undefined) {
    const found = files.find((f) => f.isServerPack !== true && fileMatches(f, wanted));
    if (!found) throw new ModpackImportError(`CurseForge 上找不到檔案 ${wanted}`);
    return found;
  }
  const latest = latestClientFile(files);
  if (!latest) throw new ModpackImportError('CurseForge 上沒有可用的整合包檔案');
  return latest;
}
```

`async function listFiles(` 改名為 `export async function listCurseforgeFiles(`（函式內容不變），`packFile` 內的呼叫改為 `await listCurseforgeFiles(fetchImpl, modId, args.apiKey)`。

`packages/core/src/modpackImport/run.ts`：`function redact(` 改為 `export function redact(`，上方加註解 `/** 從訊息中移除金鑰（每週追蹤也沿用） */`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- modpackImport`
Expected: PASS（新測試與既有 `importFromModrinth`／`importFromCurseforge`／`runAddModpack` 測試全部通過）

Run: `npm run typecheck -w @mlf/core`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modpackImport/modrinth.ts packages/core/src/modpackImport/curseforge.ts packages/core/src/modpackImport/run.ts packages/core/src/modpackImport/modrinth.test.ts packages/core/src/modpackImport/curseforge.test.ts packages/core/src/modpackImport/run.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "refactor: share modpack latest-version selection with tracking"
```

---

### Task 2: `trackModpacks` 核心流程（pure core (full code given)）

**Files:**
- Create: `packages/core/src/modpackImport/track.ts`
- Modify: `packages/core/src/modpackImport/index.ts`
- Test: `packages/core/src/modpackImport/track.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `listModrinthPackVersions`、`latestModrinthPackVersion`、`listCurseforgeFiles`、`latestClientFile`、`fileMatches`、`redact`；既有 `runAddModpack`、`AddModpackIO`、`AddModpackResult`、`ImportedSummary`、`CURSEFORGE_KEY_ENV`、`NamespacedConflict`、`QUEST_CONFLICT_LABEL`、`ModpackImportError`、`CatalogModpack`、`ModpackSource`
- Produces:
  - `EXAMPLE_ID_PREFIX = 'example-'`、`SKIP_UP_TO_DATE = '已是最新'`、`SKIP_EXAMPLE = '範例資料'`、`SKIP_NO_KEY = '缺少 CurseForge 金鑰（未設定 CURSEFORGE_API_KEY）'`
  - `type TrackModpacksIO = Omit<AddModpackIO, 'readLocalFile'>`
  - `interface ModpackUpdate { kind: 'updated'; id; name; from: ModpackSource; to: ImportedSummary; modsBefore; modsAfter; kubejsAddedKeys; questAddedKeys; differing: readonly string[]; notes: readonly string[] }`
  - `type ModpackTrackEntry = ModpackUpdate | { kind: 'manual'; id; reason } | { kind: 'skipped'; id; reason }`、`interface ModpackTrackReport { entries: readonly ModpackTrackEntry[] }`
  - `isCurrentVersion(fetchImpl: FetchLike, source: ModpackSource, apiKey: string): Promise<boolean>`
  - `trackModpacks(io: TrackModpacksIO, ids: readonly string[], today: string): Promise<ModpackTrackReport>`

- [ ] **Step 1: Write the failing test** — `packages/core/src/modpackImport/track.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { catalogModpackSchema, type ModpackPlatform } from '../modpack';
import { fakeFetch } from '../test/fakeFetch';
import {
  CF_API, CF_DOWNLOAD, CF_FAKE_KEY, CF_MANIFEST, curseforgeRoutes, curseZipBytes, MR_API, MR_INDEX_121, modrinthRoutes, mrpackBytes, QUEST_LANG_SNBT,
} from '../test/modpackFixtures';
import {
  type ExistingModpack, type FetchLike, type ModpackFiles, SKIP_EXAMPLE, SKIP_NO_KEY, SKIP_UP_TO_DATE, trackModpacks, type TrackModpacksIO,
} from './index';

const TODAY = '2026-10-17';
const MR_PROJECT = { id: 'AbCd1234', slug: 'tracked-pack', title: 'Tracked Pack', project_type: 'modpack' };
const CF_PROJECT = { data: { id: 555, name: 'Tracked Pack', slug: 'tracked-pack', classId: 4471, authors: [{ name: 'someone' }] } };

/** fixture 的 slug 是 example-pack（會被當成範例略過），改成 tracked-pack；追蹤以專案 ID 查詢 */
async function mrRoutes(bytes?: Uint8Array): Promise<Record<string, unknown>> {
  return { ...(await modrinthRoutes(bytes)), [`${MR_API}/project/AbCd1234`]: MR_PROJECT };
}

async function cfRoutes(bytes?: Uint8Array): Promise<Record<string, unknown>> {
  return { ...(await curseforgeRoutes(bytes)), [`${CF_API}/mods/555`]: CF_PROJECT };
}

function pack(
  id: string, platform: ModpackPlatform, projectId: string, version: string,
  opts: { mods?: number; kubejs?: ExistingModpack['kubejsEn'] } = {},
): ExistingModpack {
  const meta = catalogModpackSchema.parse({
    id, name: 'Tracked Pack', summary: '手寫簡介', authors: ['someone'],
    links: { [platform]: `https://example.com/${id}` },
    source: { platform, projectId, version, mcVersion: '1.20.1', loader: 'forge' },
    mods: Array.from({ length: opts.mods ?? 0 }, (_, i) => ({ platform, projectId: `p${i}`, slug: `m${i}` })),
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null } }, updatedAt: '2026-10-01',
  });
  return { meta, kubejsEn: opts.kubejs ?? { kubejs: { 'item.kubejs.gear': 'Gear' } } };
}

interface Store {
  readonly io: TrackModpacksIO;
  readonly writes: { id: string; files: ModpackFiles }[];
}

/** 記憶體中的 data/modpacks；寫入後 readExisting 會讀到新內容 */
function store(fetchImpl: FetchLike, packs: readonly ExistingModpack[], apiKey?: string): Store {
  const data = new Map(packs.map((p) => [p.meta.id, p]));
  const writes: { id: string; files: ModpackFiles }[] = [];
  const io: TrackModpacksIO = {
    fetch: fetchImpl,
    apiKey,
    readExisting: async (id) => data.get(id) ?? null,
    write: async (id, files) => {
      writes.push({ id, files });
      data.set(id, { meta: files.meta, kubejsEn: { ...data.get(id)?.kubejsEn, ...files.kubejsEn } });
    },
  };
  return { io, writes };
}

describe('trackModpacks', () => {
  it('updates a Modrinth pack whose latest version is newer and reports the change', async () => {
    const { io, writes } = store(fakeFetch(await mrRoutes()), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { mods: 5 })]);
    const report = await trackModpacks(io, ['tracked-pack'], TODAY);
    expect(report.entries).toEqual([{
      kind: 'updated', id: 'tracked-pack', name: 'Tracked Pack',
      from: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.3.0', mcVersion: '1.20.1', loader: 'forge' },
      to: { version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' },
      modsBefore: 5, modsAfter: 1, kubejsAddedKeys: 1, questAddedKeys: 0, differing: [],
      notes: expect.arrayContaining(['略過非 Modrinth 來源的檔案：mods/private.jar']),
    }]);
    expect(writes.map((w) => [w.id, w.files.meta.source.version])).toEqual([['tracked-pack', '1.4.0']]);
  });

  it('skips packs already at the latest version after listing versions only', async () => {
    const f = fakeFetch(await mrRoutes());
    const { io, writes } = store(f, [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.4.0')]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries).toEqual([{ kind: 'skipped', id: 'tracked-pack', reason: SKIP_UP_TO_DATE }]);
    expect(f.calls.map((c) => c.url)).toEqual([`${MR_API}/project/AbCd1234/version`]);
    expect(writes).toEqual([]);
  });

  it('skips example packs and CurseForge packs without a key before any request', async () => {
    const f = fakeFetch(await cfRoutes());
    const { io } = store(f, [pack('example-pack', 'modrinth', 'ExAmPlE0', '1.0.0'), pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')]);
    expect((await trackModpacks(io, ['example-pack', 'tracked-pack'], TODAY)).entries).toEqual([
      { kind: 'skipped', id: 'example-pack', reason: SKIP_EXAMPLE },
      { kind: 'skipped', id: 'tracked-pack', reason: SKIP_NO_KEY },
    ]);
    expect(f.calls).toEqual([]);
  });

  it('updates a CurseForge pack when the newest client file does not match the stored version', async () => {
    const { io, writes } = store(fakeFetch(await cfRoutes()), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'updated', from: { version: 'Example Pack 1.3.0' }, to: { version: '1.4.0' }, modsAfter: 1,
    });
    expect(writes).toHaveLength(1);
  });

  it('treats a CurseForge pack whose manifest version equals the stored one as current without writing', async () => {
    const byManifest = fakeFetch(await cfRoutes());
    const a = store(byManifest, [pack('tracked-pack', 'curseforge', '555', '1.4.0')], CF_FAKE_KEY);
    expect((await trackModpacks(a.io, ['tracked-pack'], TODAY)).entries).toEqual([{ kind: 'skipped', id: 'tracked-pack', reason: SKIP_UP_TO_DATE }]);
    expect(a.writes).toEqual([]);
    const byFileName = fakeFetch(await cfRoutes());
    const b = store(byFileName, [pack('tracked-pack', 'curseforge', '555', 'example-1.4.0.zip')], CF_FAKE_KEY);
    expect((await trackModpacks(b.io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({ kind: 'skipped', reason: SKIP_UP_TO_DATE });
    expect(byFileName.calls.map((c) => c.url)).not.toContain(CF_DOWNLOAD);
  });

  it('reports differing English, new quest keys and a Minecraft version change', async () => {
    const bytes = await mrpackBytes({ 'overrides/config/ftbquests/quests/lang/en_us.snbt': QUEST_LANG_SNBT }, MR_INDEX_121);
    const { io } = store(fakeFetch(await mrRoutes(bytes)), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { kubejs: { kubejs: { 'item.kubejs.gear': 'Old gear' } } })]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'updated', to: { version: '1.4.0', mcVersion: '1.21.1', loader: 'neoforge' },
      kubejsAddedKeys: 1, questAddedKeys: 3, differing: ['kubejs:item.kubejs.gear'],
    });
  });

  it('refuses to write when the platform slug now maps to another id', async () => {
    const routes = { ...(await mrRoutes()), [`${MR_API}/project/AbCd1234`]: { ...MR_PROJECT, slug: 'renamed-pack' } };
    const { io, writes } = store(fakeFetch(routes), [pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0')]);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries).toEqual([
      { kind: 'manual', id: 'tracked-pack', reason: '平台上的 slug 對應到 renamed-pack，與既有的 tracked-pack 不同，請人工確認' },
    ]);
    expect(writes).toEqual([]);
  });

  it('keeps going after failures and lists them as manual work', async () => {
    const routes = { ...(await mrRoutes()), [`${MR_API}/project/Empty000/version`]: [] };
    const { io, writes } = store(fakeFetch(routes), [
      pack('broken-pack', 'modrinth', 'Missing0', '1.0.0'),
      pack('empty-pack', 'modrinth', 'Empty000', '1.0.0'),
      pack('cf-pack', 'curseforge', 'abc', '1.0.0'),
      pack('tracked-pack', 'modrinth', 'AbCd1234', '1.3.0', { kubejs: { kubejs: { 'item.kubejs.casing': 'Casing' } } }),
      pack('next-pack', 'modrinth', 'AbCd1234', '1.4.0'),
    ], CF_FAKE_KEY);
    const report = await trackModpacks(io, ['broken-pack', 'ghost', 'empty-pack', 'cf-pack', 'tracked-pack', 'next-pack'], TODAY);
    expect(report.entries).toEqual([
      { kind: 'manual', id: 'broken-pack', reason: `處理失敗：HTTP 404 ${MR_API}/project/Missing0/version` },
      { kind: 'manual', id: 'ghost', reason: '找不到 data/modpacks/ghost/modpack.json' },
      { kind: 'manual', id: 'empty-pack', reason: '處理失敗：Modrinth 上沒有任何版本' },
      { kind: 'manual', id: 'cf-pack', reason: '處理失敗：CurseForge 專案 ID「abc」不是數字' },
      { kind: 'manual', id: 'tracked-pack', reason: '格式碼改變，未寫入：kubejs:item.kubejs.casing' },
      { kind: 'skipped', id: 'next-pack', reason: SKIP_UP_TO_DATE },
    ]);
    expect(writes).toEqual([]);
  });

  it('passes runAddModpack errors through, such as an unsupported Minecraft version', async () => {
    const zip = await curseZipBytes({ ...CF_MANIFEST, minecraft: { version: '1.7.10', modLoaders: [{ id: 'forge-10.13.4', primary: true }] } });
    const { io, writes } = store(fakeFetch(await cfRoutes(zip)), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    expect((await trackModpacks(io, ['tracked-pack'], TODAY)).entries[0]).toMatchObject({
      kind: 'manual', reason: expect.stringContaining('不支援的 Minecraft 版本：1.7.10'),
    });
    expect(writes).toEqual([]);
  });

  it('redacts the key from failures and never puts it in the report', async () => {
    const leaky: FetchLike = async () => {
      throw new Error(`connect failed with key ${CF_FAKE_KEY}`);
    };
    const { io } = store(leaky, [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    const report = await trackModpacks(io, ['tracked-pack'], TODAY);
    expect(report.entries).toEqual([{ kind: 'manual', id: 'tracked-pack', reason: '處理失敗：connect failed with key [已隱藏]' }]);
    const ok = store(fakeFetch(await cfRoutes()), [pack('tracked-pack', 'curseforge', '555', 'Example Pack 1.3.0')], CF_FAKE_KEY);
    const written = await trackModpacks(ok.io, ['tracked-pack'], TODAY);
    expect(JSON.stringify([report, written, ok.writes])).not.toContain(CF_FAKE_KEY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- modpackImport/track.test`
Expected: FAIL — `TypeError: trackModpacks is not a function`（`SKIP_*` 為 undefined）。記錄 RED 輸出。

- [ ] **Step 3: Implement** — `packages/core/src/modpackImport/track.ts`

```ts
import type { CatalogModpack, ModpackSource } from '../modpack/schema';
import { fileMatches, latestClientFile, listCurseforgeFiles } from './curseforge';
import { ModpackImportError } from './errors';
import type { FetchLike } from './http';
import { latestModrinthPackVersion, listModrinthPackVersions } from './modrinth';
import type { NamespacedConflict } from './plan';
import { QUEST_CONFLICT_LABEL } from './questPlan';
import { type AddModpackIO, type AddModpackResult, CURSEFORGE_KEY_ENV, type ImportedSummary, redact, runAddModpack } from './run';

export const EXAMPLE_ID_PREFIX = 'example-';
export const SKIP_UP_TO_DATE = '已是最新';
export const SKIP_EXAMPLE = '範例資料';
export const SKIP_NO_KEY = `缺少 CurseForge 金鑰（未設定 ${CURSEFORGE_KEY_ENV}）`;

/** 追蹤不使用 --file；其餘與 add:modpack 相同 */
export type TrackModpacksIO = Omit<AddModpackIO, 'readLocalFile'>;

export interface ModpackUpdate {
  readonly kind: 'updated';
  readonly id: string;
  readonly name: string;
  readonly from: ModpackSource;
  readonly to: ImportedSummary;
  readonly modsBefore: number;
  readonly modsAfter: number;
  readonly kubejsAddedKeys: number;
  readonly questAddedKeys: number;
  /** 原文不同、保留既有原文的條目（`<命名空間>:<key>`） */
  readonly differing: readonly string[];
  readonly notes: readonly string[];
}

export type ModpackTrackEntry =
  | ModpackUpdate
  | { readonly kind: 'manual'; readonly id: string; readonly reason: string }
  | { readonly kind: 'skipped'; readonly id: string; readonly reason: string };

export interface ModpackTrackReport {
  readonly entries: readonly ModpackTrackEntry[];
}

type Written = Extract<AddModpackResult, { kind: 'written' }>;

/** 平台上的最新版本是否就是已收錄的版本；選版與比對規則同 add:modpack 不帶 --version */
export async function isCurrentVersion(fetchImpl: FetchLike, source: ModpackSource, apiKey: string): Promise<boolean> {
  if (source.platform === 'modrinth') {
    const latest = latestModrinthPackVersion(await listModrinthPackVersions(fetchImpl, source.projectId));
    if (!latest) throw new ModpackImportError('Modrinth 上沒有任何版本');
    return latest.version_number === source.version;
  }
  if (!/^\d+$/.test(source.projectId)) throw new ModpackImportError(`CurseForge 專案 ID「${source.projectId}」不是數字`);
  const latest = latestClientFile(await listCurseforgeFiles(fetchImpl, Number(source.projectId), apiKey));
  if (!latest) throw new ModpackImportError('CurseForge 上沒有可用的整合包檔案');
  return fileMatches(latest, source.version);
}

const noLocalFile = async (): Promise<Uint8Array> => {
  throw new ModpackImportError('每週追蹤不使用 --file');
};

/**
 * 只允許寫回原本的 id（slug 改名時交給維護者）；
 * 匯入的版本與既有相同時不寫入（CurseForge 的版本可能取自 manifest，檔案清單比對不到）
 */
function guardedIO(io: TrackModpacksIO, id: string, previousVersion: string): AddModpackIO {
  return {
    ...io,
    readLocalFile: noLocalFile,
    write: async (target, files) => {
      if (target !== id) throw new ModpackImportError(`平台上的 slug 對應到 ${target}，與既有的 ${id} 不同，請人工確認`);
      if (files.meta.source.version === previousVersion) return;
      await io.write(target, files);
    },
  };
}

const conflictLabel = (c: NamespacedConflict): string => `${c.ns}:${c.key}`;

function differingKeys(result: Written): string[] {
  return [
    ...result.changes.flatMap((change) => change.conflicts.map((c) => `${change.ns}:${c.key}`)),
    ...(result.questChange?.conflicts ?? []).map((c) => `${QUEST_CONFLICT_LABEL}:${c.key}`),
  ];
}

async function toEntry(io: TrackModpacksIO, before: CatalogModpack, result: AddModpackResult): Promise<ModpackTrackEntry> {
  const { id } = before;
  if (result.kind === 'error') return { kind: 'manual', id, reason: result.message };
  if (result.kind === 'conflict') return { kind: 'manual', id, reason: `格式碼改變，未寫入：${result.conflicts.map(conflictLabel).join('、')}` };
  if (result.imported.version === before.source.version) return { kind: 'skipped', id, reason: SKIP_UP_TO_DATE };
  const after = await io.readExisting(id);
  return {
    kind: 'updated', id, name: before.name, from: before.source, to: result.imported,
    modsBefore: before.mods.length, modsAfter: after?.meta.mods.length ?? before.mods.length,
    kubejsAddedKeys: result.changes.reduce((sum, c) => sum + c.addedKeys.length, 0),
    questAddedKeys: result.questChange?.addedKeys.length ?? 0,
    differing: differingKeys(result),
    notes: [...result.notes, ...(result.questChange?.note ? [result.questChange.note] : [])],
  };
}

async function trackOne(io: TrackModpacksIO, id: string, today: string): Promise<ModpackTrackEntry> {
  const existing = await io.readExisting(id);
  if (!existing) return { kind: 'manual', id, reason: `找不到 data/modpacks/${id}/modpack.json` };
  const { meta } = existing;
  if (meta.id.startsWith(EXAMPLE_ID_PREFIX)) return { kind: 'skipped', id, reason: SKIP_EXAMPLE };
  const apiKey = io.apiKey ?? '';
  if (meta.source.platform === 'curseforge' && apiKey === '') return { kind: 'skipped', id, reason: SKIP_NO_KEY };
  if (await isCurrentVersion(io.fetch, meta.source, apiKey)) return { kind: 'skipped', id, reason: SKIP_UP_TO_DATE };
  const args = { platform: meta.source.platform, ref: meta.source.projectId };
  return toEntry(io, meta, await runAddModpack(guardedIO(io, id, meta.source.version), args, today));
}

/** 依序處理每個整合包；單一整合包失敗只記為「需要人工處理」，不影響其他整合包 */
export async function trackModpacks(io: TrackModpacksIO, ids: readonly string[], today: string): Promise<ModpackTrackReport> {
  const entries = await ids.reduce<Promise<readonly ModpackTrackEntry[]>>(async (previous, id) => {
    const done = await previous;
    const entry = await trackOne(io, id, today).catch((err: unknown): ModpackTrackEntry => ({
      kind: 'manual', id, reason: `處理失敗：${redact(err instanceof Error ? err.message : String(err), io.apiKey)}`,
    }));
    return [...done, entry];
  }, Promise.resolve([]));
  return { entries };
}
```

`packages/core/src/modpackImport/index.ts` 最後加入 `export * from './track';`。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- modpackImport`
Expected: PASS

Run: `npm run typecheck -w @mlf/core`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modpackImport/track.ts packages/core/src/modpackImport/track.test.ts packages/core/src/modpackImport/index.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat: check tracked modpacks for new versions and update them"
```

---

### Task 3: 追蹤摘要與參數解析（pure core (full code given)）

**Files:**
- Create: `packages/core/src/modpackImport/trackSummary.ts`
- Create: `packages/core/src/modpackImport/trackArgs.ts`
- Modify: `packages/core/src/modpackImport/index.ts`
- Test: `packages/core/src/modpackImport/trackSummary.test.ts`、`packages/core/src/modpackImport/trackArgs.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ModpackTrackReport`、`ModpackUpdate`、`SKIP_EXAMPLE`、`SKIP_NO_KEY`；`ModpackImportError`
- Produces:
  - `NO_UPDATES_LINE = '沒有整合包需要更新。'`、`renderModpackTrackSummary(report: ModpackTrackReport): string`
  - `TRACK_MODPACKS_USAGE`、`interface TrackModpacksArgs { readonly summary?: string }`、`parseTrackModpacksArgs(argv: readonly string[]): TrackModpacksArgs`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/modpackImport/trackSummary.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { type ModpackTrackReport, NO_UPDATES_LINE, renderModpackTrackSummary, SKIP_EXAMPLE, SKIP_NO_KEY } from './index';

const source = (version: string) => ({ platform: 'modrinth', projectId: 'AbCd1234', version, mcVersion: '1.20.1', loader: 'forge' }) as const;

const report: ModpackTrackReport = {
  entries: [
    {
      kind: 'updated', id: 'tracked-pack', name: 'Tracked | Pack', from: source('1.3.0'), to: { version: '1.4.0', mcVersion: '1.21.1', loader: 'neoforge' },
      modsBefore: 5, modsAfter: 7, kubejsAddedKeys: 2, questAddedKeys: 3, differing: ['kubejs:item.kubejs.gear'], notes: ['略過非 Modrinth 來源的檔案：mods/private.jar'],
    },
    {
      kind: 'updated', id: 'steady-pack', name: 'Steady', from: source('2.0'), to: { version: '2.1', mcVersion: '1.20.1', loader: 'forge' },
      modsBefore: 4, modsAfter: 4, kubejsAddedKeys: 0, questAddedKeys: 0, differing: [], notes: [],
    },
    { kind: 'manual', id: 'broken-pack', reason: '格式碼改變，未寫入：kubejs:item.kubejs.casing' },
    { kind: 'manual', id: 'multi-line', reason: '第一行\n  第二行' },
    { kind: 'skipped', id: 'example-pack', reason: SKIP_EXAMPLE },
    { kind: 'skipped', id: 'cf-pack', reason: SKIP_NO_KEY },
  ],
};

describe('renderModpackTrackSummary', () => {
  const md = renderModpackTrackSummary(report);

  it('summarises counts', () => {
    expect(md).toContain('- 已更新：2 個整合包');
    expect(md).toContain('- 需要人工處理：2 個');
    expect(md).toContain('- 略過：2 個');
    expect(md).not.toContain(NO_UPDATES_LINE);
  });

  it('lists name, versions, Minecraft version, mod count change and new keys', () => {
    expect(md).toContain('| 整合包 | 版本 | Minecraft | 模組數 | KubeJS 新增 key | FTB 任務新增 key |');
    expect(md).toContain('| Tracked \\| Pack（tracked-pack） | 1.3.0 → 1.4.0 | 1.20.1 → 1.21.1 | 5 → 7 | 2 | 3 |');
    expect(md).toContain('| Steady（steady-pack） | 2.0 → 2.1 | 1.20.1 | 4 | 0 | 0 |');
  });

  it('lists differing English, notes, manual work and skipped packs', () => {
    expect(md).toContain('## 原文不同（保留既有原文，請確認）');
    expect(md).toContain('- tracked-pack：`kubejs:item.kubejs.gear`');
    expect(md).toContain('- tracked-pack：略過非 Modrinth 來源的檔案：mods/private.jar');
    expect(md).toContain('- broken-pack：格式碼改變，未寫入：kubejs:item.kubejs.casing');
    expect(md).toContain('- multi-line：第一行 第二行');
    expect(md).toContain('- example-pack：範例資料');
    expect(md).toContain(`- cf-pack：${SKIP_NO_KEY}`);
  });

  it('says so when nothing was updated and omits empty sections', () => {
    const text = renderModpackTrackSummary({ entries: [{ kind: 'skipped', id: 'a', reason: '已是最新' }] });
    expect(text).toContain(NO_UPDATES_LINE);
    expect(text).toContain('- 已更新：0 個整合包');
    expect(text).not.toContain('## 已更新');
    expect(text).not.toContain('## 需要人工處理');
    expect(renderModpackTrackSummary({ entries: [] })).toContain(NO_UPDATES_LINE);
  });

  it('never contains session links', () => {
    expect(md).not.toMatch(/claude\.ai|Claude-Session/);
  });
});
```

`packages/core/src/modpackImport/trackArgs.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseTrackModpacksArgs, TRACK_MODPACKS_USAGE } from './index';

describe('parseTrackModpacksArgs', () => {
  it('accepts no arguments or a single --summary path', () => {
    expect(parseTrackModpacksArgs([])).toEqual({});
    expect(parseTrackModpacksArgs(['--summary', '/tmp/summary.md'])).toEqual({ summary: '/tmp/summary.md' });
    expect(parseTrackModpacksArgs(['--summary=/tmp/summary.md'])).toEqual({ summary: '/tmp/summary.md' });
  });

  it.each([
    [['--summary']], [['--summary', '']], [['--summary', '--other']], [['--summary=']],
    [['--max-builds', '3']], [['--summary', 'a.md', 'b.md']], [['summary.md']],
  ])('rejects %j with the usage line', (argv) => {
    expect(() => parseTrackModpacksArgs(argv)).toThrow(TRACK_MODPACKS_USAGE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @mlf/core -- modpackImport/trackSummary modpackImport/trackArgs`
Expected: FAIL — `TypeError: renderModpackTrackSummary is not a function`、`parseTrackModpacksArgs is not a function`。記錄 RED 輸出。

- [ ] **Step 3: Implement**

`packages/core/src/modpackImport/trackSummary.ts`：

```ts
import type { ModpackTrackReport, ModpackUpdate } from './track';

export const NO_UPDATES_LINE = '沒有整合包需要更新。';

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`## ${title}`, '', ...lines, ''];
}

/** 表格儲存格不可含 |；清單項目不可換行 */
const cell = (text: string): string => text.replaceAll('|', '\\|');
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ');
const change = (before: string | number, after: string | number): string => (before === after ? `${after}` : `${before} → ${after}`);

function updateRow(u: ModpackUpdate): string {
  return [
    `${cell(u.name)}（${u.id}）`, `${cell(u.from.version)} → ${cell(u.to.version)}`, change(u.from.mcVersion, u.to.mcVersion),
    change(u.modsBefore, u.modsAfter), `${u.kubejsAddedKeys}`, `${u.questAddedKeys}`,
  ].reduce((row, c) => `${row} ${c} |`, '|');
}

export function renderModpackTrackSummary(report: ModpackTrackReport): string {
  const updated = report.entries.flatMap((e) => (e.kind === 'updated' ? [e] : []));
  const manual = report.entries.flatMap((e) => (e.kind === 'manual' ? [e] : []));
  const skipped = report.entries.flatMap((e) => (e.kind === 'skipped' ? [e] : []));
  const counts = [`- 已更新：${updated.length} 個整合包`, `- 需要人工處理：${manual.length} 個`, `- 略過：${skipped.length} 個`];
  return [
    '## 摘要', '', ...counts, '', ...(updated.length === 0 ? [NO_UPDATES_LINE, ''] : []),
    ...section('已更新', updated.length === 0 ? [] : [
      '| 整合包 | 版本 | Minecraft | 模組數 | KubeJS 新增 key | FTB 任務新增 key |', '|---|---|---|---|---|---|', ...updated.map(updateRow),
    ]),
    ...section('原文不同（保留既有原文，請確認）', updated.flatMap((u) => u.differing.map((k) => `- ${u.id}：\`${k}\``))),
    ...section('提示', updated.flatMap((u) => u.notes.map((n) => `- ${u.id}：${oneLine(n)}`))),
    ...section('需要人工處理', manual.map((m) => `- ${m.id}：${oneLine(m.reason)}`)),
    ...section('略過', skipped.map((s) => `- ${s.id}：${s.reason}`)),
  ].join('\n');
}
```

`packages/core/src/modpackImport/trackArgs.ts`：

```ts
import { ModpackImportError } from './errors';

export const TRACK_MODPACKS_USAGE = '用法：npm run track:modpacks -- [--summary <摘要檔路徑>]';
const SUMMARY_FLAG = '--summary';

export interface TrackModpacksArgs {
  readonly summary?: string;
}

function withPath(path: string): TrackModpacksArgs {
  if (path.trim() === '' || path.startsWith('--')) throw new ModpackImportError(TRACK_MODPACKS_USAGE);
  return { summary: path };
}

/** 只接受沒有參數，或一個 --summary <路徑>／--summary=<路徑> */
export function parseTrackModpacksArgs(argv: readonly string[]): TrackModpacksArgs {
  if (argv.length === 0) return {};
  const [flag = '', value, ...rest] = argv;
  if (argv.length === 1 && flag.startsWith(`${SUMMARY_FLAG}=`)) return withPath(flag.slice(SUMMARY_FLAG.length + 1));
  if (flag === SUMMARY_FLAG && value !== undefined && rest.length === 0) return withPath(value);
  throw new ModpackImportError(TRACK_MODPACKS_USAGE);
}
```

`packages/core/src/modpackImport/index.ts` 最後加入：

```ts
export * from './trackSummary';
export * from './trackArgs';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- modpackImport`
Expected: PASS

Run: `npm run typecheck -w @mlf/core`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/modpackImport/trackSummary.ts packages/core/src/modpackImport/trackSummary.test.ts packages/core/src/modpackImport/trackArgs.ts packages/core/src/modpackImport/trackArgs.test.ts packages/core/src/modpackImport/index.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat: render the weekly modpack tracking summary"
```

---

### Task 4: 參數化 `open-tracking-pr.sh` 與 `track-modpacks.yml`（integration）

**Files:**
- Modify: `scripts/ci/open-tracking-pr.sh`
- Create: `.github/workflows/track-modpacks.yml`
- Modify: `package.json`、`package-lock.json`（devDependency `yaml`）
- Test: `packages/core/src/modpackImport/trackWorkflow.test.ts`

**Interfaces:**
- Consumes: `track-versions.yml`（不改）、Task 5 才加入的 `npm run track:modpacks`（此 task 只檢查 workflow 內容）
- Produces:
  - `open-tracking-pr.sh` 環境變數：`TRACK_BRANCH`（預設 `auto/track-versions`，必須以 `auto/` 開頭）、`TRACK_TITLE`（預設 `chore(data): 追蹤模組新版本`；實際標題＝`<TRACK_TITLE>（<UTC 日期>）`）
  - workflow `Track modpack versions`

- [ ] **Step 1: Add the YAML parser and write the failing test**

Run: `npm install -D yaml@^2.9.1`
Expected: `package.json` 的 devDependencies 多一行 `"yaml": "^2.9.1"`；lockfile 只改根目錄的 devDependencies（`node_modules/yaml` 已存在）

`packages/core/src/modpackImport/trackWorkflow.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const REPO = resolve(import.meta.dirname, '..', '..', '..', '..');
const text = (path: string): string => readFileSync(resolve(REPO, path), 'utf8');

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly with?: Readonly<Record<string, unknown>>;
}

interface Workflow {
  readonly on: Readonly<Record<string, unknown>>;
  readonly permissions: Readonly<Record<string, string>>;
  readonly concurrency: Readonly<Record<string, unknown>>;
  readonly env?: unknown;
  readonly jobs: Readonly<Record<string, { readonly env?: unknown; readonly steps: readonly Step[] }>>;
}

const workflow = (path: string): Workflow => parse(text(path)) as Workflow;
const steps = (wf: Workflow): readonly Step[] => wf.jobs.track?.steps ?? [];
const indexOf = (list: readonly Step[], run: string): number => list.findIndex((s) => s.run?.includes(run) === true);
const PR_RUN = 'bash scripts/ci/open-tracking-pr.sh "$RUNNER_TEMP/summary.md"';

describe('track-modpacks.yml', () => {
  const wf = workflow('.github/workflows/track-modpacks.yml');
  const list = steps(wf);

  it('runs every Monday 03:00 UTC and on demand', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 3 * * 1' }]);
    expect(Object.keys(wf.on)).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('only writes contents and pull requests, one run at a time', () => {
    expect(wf.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
    expect(wf.concurrency).toEqual({ group: 'track-modpacks', 'cancel-in-progress': false });
  });

  it('checks out the default branch without persisted credentials and installs on Node 24', () => {
    expect(list[0]).toMatchObject({ uses: 'actions/checkout@v7', with: { ref: '${{ github.event.repository.default_branch }}', 'persist-credentials': false } });
    expect(list[1]).toMatchObject({ uses: 'actions/setup-node@v7', with: { 'node-version': 24 } });
    expect(list[2]?.run).toBe('npm ci');
  });

  it('tracks, shows the summary, validates and then opens the PR on auto/track-modpacks', () => {
    const order = ['npm run track:modpacks', '$GITHUB_STEP_SUMMARY', 'npm run validate:data', PR_RUN].map((run) => indexOf(list, run));
    expect(order.every((i, n) => i > (n === 0 ? 2 : order[n - 1]!))).toBe(true);
    expect(list[order[0]!]?.run).toBe('npm run track:modpacks -- --summary "$RUNNER_TEMP/summary.md"');
    expect(list[order[1]!]?.if).toBe('always()');
    expect(list[order[3]!]?.env).toEqual({
      GH_TOKEN: '${{ secrets.TRACKER_TOKEN || github.token }}',
      HAS_TRACKER_TOKEN: "${{ secrets.TRACKER_TOKEN != '' }}",
      BASE_BRANCH: '${{ github.event.repository.default_branch }}',
      TRACK_BRANCH: 'auto/track-modpacks',
      TRACK_TITLE: 'chore(data): 追蹤整合包新版本',
    });
  });

  it('passes CURSEFORGE_API_KEY only to the track step, as an environment variable', () => {
    expect(list[indexOf(list, 'npm run track:modpacks')]?.env).toEqual({ CURSEFORGE_API_KEY: '${{ secrets.CURSEFORGE_API_KEY }}' });
    expect(list.filter((s) => JSON.stringify(s).includes('CURSEFORGE_API_KEY'))).toHaveLength(1);
    expect(wf.env).toBeUndefined();
    expect(wf.jobs.track?.env).toBeUndefined();
  });
});

describe('open-tracking-pr.sh', () => {
  const sh = text('scripts/ci/open-tracking-pr.sh');

  it('keeps track-versions on the default branch and title', () => {
    expect(sh).toContain('BRANCH="${TRACK_BRANCH:-auto/track-versions}"');
    expect(sh).toContain('TITLE_PREFIX="${TRACK_TITLE:-chore(data): 追蹤模組新版本}"');
    expect(sh).toContain('TITLE="${TITLE_PREFIX}（$(date -u +%F)）"');
    const versions = workflow('.github/workflows/track-versions.yml');
    expect(versions.on.schedule).toEqual([{ cron: '0 2 * * 1' }]);
    const pr = steps(versions).find((s) => s.run === PR_RUN);
    expect(Object.keys(pr?.env ?? {}).sort()).toEqual(['BASE_BRANCH', 'GH_TOKEN', 'HAS_TRACKER_TOKEN']);
  });

  it('only force-pushes auto/ branches', () => {
    expect(sh).toMatch(/case "\$BRANCH" in\s+auto\/\*\) ;;\s+\*\) echo "TRACK_BRANCH 必須以 auto\/ 開頭/);
    expect(sh.indexOf('case "$BRANCH" in')).toBeLessThan(sh.indexOf('git checkout -B'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- modpackImport/trackWorkflow`
Expected: FAIL — `ENOENT: no such file or directory, open '…/.github/workflows/track-modpacks.yml'`（`open-tracking-pr.sh` 兩個測試也 FAIL：找不到 `BRANCH="${TRACK_BRANCH:-auto/track-versions}"`）。記錄 RED 輸出。

- [ ] **Step 3: Implement**

`scripts/ci/open-tracking-pr.sh` 全檔換成（只改開頭說明、`BRANCH`／`TITLE` 兩處與新增分支檢查；其餘指令與原本相同）：

```bash
#!/usr/bin/env bash
# 把 data/ 的變動推到自動分支，開或更新單一 PR。需要 GH_TOKEN；沒有變動時什麼都不做。
# 可用環境變數指定：TRACK_BRANCH（預設 auto/track-versions，必須以 auto/ 開頭）、TRACK_TITLE（預設「chore(data): 追蹤模組新版本」）。
set -euo pipefail

SUMMARY="${1:?用法：open-tracking-pr.sh <summary.md>}"
BRANCH="${TRACK_BRANCH:-auto/track-versions}"
TITLE_PREFIX="${TRACK_TITLE:-chore(data): 追蹤模組新版本}"
BASE="${BASE_BRANCH:-main}"

# 會 force-push，只允許自動分支
case "$BRANCH" in
  auto/*) ;;
  *) echo "TRACK_BRANCH 必須以 auto/ 開頭：$BRANCH" >&2; exit 1 ;;
esac

if [ -z "$(git status --porcelain -- data)" ]; then
  echo "沒有資料變動，不開 PR。"
  exit 0
fi

TITLE="${TITLE_PREFIX}（$(date -u +%F)）"
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
# checkout 未保存憑證；只在這個指令帶入 token
AUTH="$(printf 'x-access-token:%s' "${GH_TOKEN:?需要 GH_TOKEN}" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $AUTH" push --force origin "$BRANCH"

EXISTING="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING" ]; then
  gh pr edit "$EXISTING" --title "$TITLE" --body-file "$BODY"
else
  gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$BODY"
fi
```

`.github/workflows/track-modpacks.yml`：

```yaml
name: Track modpack versions

on:
  schedule:
    - cron: '0 3 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: track-modpacks
  cancel-in-progress: false

jobs:
  track:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      # 同 track-versions.yml：只取預設分支、不保存憑證
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.repository.default_branch }}
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      # 金鑰只在這個步驟以環境變數傳入；腳本不寫入檔案、不印出（錯誤訊息以 redact 遮蔽）；未設定時略過 CurseForge 整合包
      - name: Track modpacks
        env:
          CURSEFORGE_API_KEY: ${{ secrets.CURSEFORGE_API_KEY }}
        run: npm run track:modpacks -- --summary "$RUNNER_TEMP/summary.md"
      - name: Show summary on the run page
        if: always()
        run: if [ -f "$RUNNER_TEMP/summary.md" ]; then cat "$RUNNER_TEMP/summary.md" >> "$GITHUB_STEP_SUMMARY"; fi
      - name: Validate translation data
        run: npm run validate:data
      - name: Open or update pull request
        env:
          GH_TOKEN: ${{ secrets.TRACKER_TOKEN || github.token }}
          HAS_TRACKER_TOKEN: ${{ secrets.TRACKER_TOKEN != '' }}
          BASE_BRANCH: ${{ github.event.repository.default_branch }}
          TRACK_BRANCH: auto/track-modpacks
          TRACK_TITLE: 'chore(data): 追蹤整合包新版本'
        run: bash scripts/ci/open-tracking-pr.sh "$RUNNER_TEMP/summary.md"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @mlf/core -- modpackImport/trackWorkflow`
Expected: PASS（7 個測試）

Run: `bash -n scripts/ci/open-tracking-pr.sh`
Expected: 無輸出（語法正確；不實際執行，避免推送）

Run: `npm run lint`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/open-tracking-pr.sh .github/workflows/track-modpacks.yml packages/core/src/modpackImport/trackWorkflow.test.ts package.json package-lock.json
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "ci: track modpack versions weekly with a parametrised PR script"
```

---

### Task 5: `track:modpacks` 腳本、文件與完整驗證（integration）

**Files:**
- Create: `scripts/track-modpacks.ts`
- Modify: `package.json`（`track:modpacks` script）
- Modify: `docs/development.md`
- Test: `packages/core/src/modpackImport/trackWorkflow.test.ts`（新增 describe）

**Interfaces:**
- Consumes: `trackModpacks`、`renderModpackTrackSummary`、`parseTrackModpacksArgs`（Task 2、3）、`CURSEFORGE_KEY_ENV`、`readExisting`／`writeModpack`／`MODPACKS_DATA_DIR`（`scripts/lib/modpackFiles.ts`）
- Produces: `npm run track:modpacks -- [--summary <path>]`：摘要印到 stdout 並寫入 `--summary`；有「需要人工處理」也以 0 結束；參數錯誤以 1 結束

- [ ] **Step 1: Write the failing test** — `packages/core/src/modpackImport/trackWorkflow.test.ts` 最後加入（並把第一行改為 `import { existsSync, readFileSync } from 'node:fs';`）

```ts
describe('npm run track:modpacks', () => {
  it('runs scripts/track-modpacks.ts with tsx', () => {
    const pkg = JSON.parse(text('package.json')) as { readonly scripts: Readonly<Record<string, string>> };
    expect(pkg.scripts['track:modpacks']).toBe('tsx scripts/track-modpacks.ts');
    expect(existsSync(resolve(REPO, 'scripts/track-modpacks.ts'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mlf/core -- modpackImport/trackWorkflow`
Expected: FAIL — `expected undefined to be 'tsx scripts/track-modpacks.ts'`。記錄 RED 輸出。

- [ ] **Step 3: Implement**

`scripts/track-modpacks.ts`：

```ts
/**
 * 每週追蹤：檢查已收錄的整合包是否有新版本，有就沿用 add:modpack 的流程更新 data/modpacks/<id>/。
 * 用法：npm run track:modpacks -- [--summary <path>]
 * CurseForge 整合包需要 CURSEFORGE_API_KEY（環境變數或專案根目錄 .env）；未設定時略過並在摘要註明。金鑰不會寫入檔案，也不會印出。
 */
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CURSEFORGE_KEY_ENV, parseTrackModpacksArgs, renderModpackTrackSummary, trackModpacks } from '@mlf/core/modpackImport';
import { MODPACKS_DATA_DIR, readExisting, writeModpack } from './lib/modpackFiles';

// 與 add-modpack.ts 相同；feat/curseforge-links 合併後可改用 scripts/lib/curseforgeKey.ts
const ENV_FILE = resolve(import.meta.dirname, '..', '.env');

function loadApiKey(): string | undefined {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return process.env[CURSEFORGE_KEY_ENV]?.trim() || undefined;
}

async function modpackIds(): Promise<string[]> {
  const entries = await readdir(MODPACKS_DATA_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function main(): Promise<void> {
  const args = parseTrackModpacksArgs(process.argv.slice(2));
  const io = { fetch, apiKey: loadApiKey(), readExisting, write: writeModpack };
  const report = await trackModpacks(io, await modpackIds(), new Date().toLocaleDateString('sv-SE'));
  const summary = renderModpackTrackSummary(report);
  console.log(summary);
  if (args.summary) await writeFile(args.summary, summary, 'utf8');
}

main().catch((err: unknown) => {
  console.error('track-modpacks 執行失敗：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

`package.json` 的 scripts：在 `"track:versions": "tsx scripts/track-versions.ts",` 之後加入 `"track:modpacks": "tsx scripts/track-modpacks.ts",`。

`docs/development.md`：在指令區塊的 `npm run track:versions -- --max-builds 100  # …` 之後加入一行

```bash
npm run track:modpacks                    # 檢查已收錄整合包的新版本並更新 data/modpacks（CurseForge 整合包需要 CurseForge API Key）
```

在「### 自動追蹤模組新版本」一節（含兩個項目）之後、「## 專案架構」之前加入：

```markdown
### 自動追蹤整合包新版本

`.github/workflows/track-modpacks.yml` 會在每週一 03:00（UTC，模組追蹤的一小時後）執行 `track:modpacks`，逐一檢查已收錄的整合包在 Modrinth／CurseForge 上是否有新版本；有新版本時沿用 `add:modpack` 的流程更新 `data/modpacks/<id>/`（`modpack.json` 的來源版本與模組清單、KubeJS 與 FTB 任務的英文原文；不會動到譯文），並開立或更新 `auto/track-modpacks` 分支的 Pull Request。也可以在 GitHub 的 Actions 頁面手動執行。範例整合包（id 以 `example-` 開頭）不會被追蹤。

- Pull Request 的摘要會列出已更新的整合包（版本、Minecraft 版本、模組數變化、新增的 key 數）、需要人工處理的整合包（例如格式碼改變、Minecraft 版本還不在版本表、CurseForge 不允許第三方下載）與略過的整合包。需要人工處理的整合包請在本機用 `add:modpack` 更新（CurseForge 不允許下載時加上 `--file`）。
- CurseForge 整合包需要在 repo 設定 secret `CURSEFORGE_API_KEY`：到「Settings → Secrets and variables → Actions → New repository secret」，名稱填 `CURSEFORGE_API_KEY`、值填你的 CurseForge API Key。沒有設定時會略過 CurseForge 整合包並在摘要中註明，不會失敗。金鑰只以環境變數傳給追蹤腳本，不會寫入檔案，也不會出現在摘要或執行紀錄中。請不要把金鑰貼到 issue、Pull Request 或聊天訊息裡。
- `TRACKER_TOKEN` 的設定與上一節相同。
```

- [ ] **Step 4: Run tests and the full verification**

Run: `npm test -w @mlf/core -- modpackImport/trackWorkflow`
Expected: PASS

Run: `npm run track:modpacks -- --unknown`
Expected: 印出 `track-modpacks 執行失敗： 用法：npm run track:modpacks -- [--summary <摘要檔路徑>]`、exit code 1（參數在任何網路請求前就被拒絕；**不要**不帶錯誤參數執行此腳本，以免對網路發出真實請求）

Run: `npm run lint`
Expected: 無錯誤

Run: `npm run typecheck -w @mlf/core`
Expected: 無錯誤

Run: `npm test -w @mlf/core`
Expected: 全部 PASS

Run: `npm run test:coverage -w @mlf/core`
Expected: lines／functions／branches／statements 皆 ≥ 80%

Run: `npm run validate:data`
Expected: 0 個錯誤（資料未變動）

Run: `git ls-files .env`
Expected: 沒有輸出（`.env` 從未被追蹤）

- [ ] **Step 5: Commit**

```bash
git add scripts/track-modpacks.ts package.json docs/development.md packages/core/src/modpackImport/trackWorkflow.test.ts
git diff --cached --stat
git diff --cached --ignore-cr-at-eol --stat
git commit -m "feat: add track:modpacks script and document the weekly workflow"
```

PR：標題 `feat: 整合包每週自動追蹤`；說明用台灣繁中，只寫「摘要」「變更內容」（「備註」可註明合併後需設定 secret `CURSEFORGE_API_KEY`，以及與 `feat/curseforge-links` 的 `redact` 匯出重疊、rebase 時保留一份），不列測試、不附 session 連結。

---

## Self-Review

- 名稱與簽章已對照現有程式碼：`runAddModpack(io, args, today)`、`AddModpackIO`（`fetch`／`apiKey`／`readLocalFile`／`readExisting`／`write`）、`AddModpackResult` 的 `written.changes[].addedKeys`／`conflicts`、`questChange.addedKeys`／`conflicts`／`note`、`imported`；`NamespacedConflict.ns`、`QUEST_CONFLICT_LABEL = 'FTB 任務'`；fixtures `modrinthRoutes(bytes?)`、`curseforgeRoutes(bytes?)`、`mrpackBytes(extra, index)`、`curseZipBytes(manifest)`、`CF_FAKE_KEY`、`CF_DOWNLOAD`、`MR_INDEX_121`、`QUEST_LANG_SNBT`；`scripts/lib/modpackFiles.ts` 的 `MODPACKS_DATA_DIR`／`readExisting`／`writeModpack`。
- 新匯出名稱不與 `@mlf/core/modpackImport` 既有名稱衝突（`pipeline` 的 `pickVersion`／`renderTrackSummary` 在不同 barrel）。
- 沒有任何步驟對網路執行真實腳本；Task 5 的冒煙測試用錯誤參數，在發出請求前結束。
- 與進行中分支的接觸面：`run.ts` 的 `export function redact`（與 `feat/curseforge-links` 相同改動）、`curseforge.ts` 的 `pickFile`／`listFiles` 區塊（該分支改 `apiInit` 與新增搜尋，rebase 時可能有文字衝突，保留雙方改動即可）；`PACK_FORMATS` 不受影響。

## Spec Coverage

| Spec 項目 | Task |
|---|---|
| 決策 1：`npm run track:modpacks`，沿用 `runAddModpack`（不指定版本） | 2、5 |
| 決策 2：`track-modpacks.yml` 每週一 03:00 UTC、手動觸發、單一 PR、分支 `auto/track-modpacks` | 4 |
| 決策 3：`open-tracking-pr.sh` 參數化，模組追蹤行為不變 | 4 |
| 決策 4：`CURSEFORGE_API_KEY` secret；未設定時略過 CurseForge 整合包並註明、不失敗 | 2、3、4、5 |
| 決策 5：`example-` 整合包不追蹤 | 2 |
| 檢查流程 1：讀 `modpack.json`（zod 驗證，沿用 `readExisting` 的 `catalogModpackSchema.parse`）、範例略過 | 2 |
| 檢查流程 2：Modrinth `date_published` 最新的 `version_number`；CurseForge 分頁檔案清單、最新非伺服器檔、比對方式同 `add:modpack`（共用函式） | 1、2 |
| 檢查流程 3：相同 →「已是最新」（含 CurseForge manifest 版本相同的情況） | 2 |
| 檢查流程 4：`written`／`conflict`／`error` 的處理、金鑰遮蔽 | 2 |
| 檢查流程 5：單一失敗不影響其他、依序處理、不設上限 | 2 |
| 摘要：已更新（名稱、版本、Minecraft、模組數、KubeJS／FTB 任務 key）、需要人工處理、略過；無變動不開 PR（沿用腳本判斷） | 3、4 |
| Workflow 觸發、權限、concurrency、步驟順序、金鑰只在追蹤步驟、標題 `chore(data): 追蹤整合包新版本（<UTC 日期>）` | 4 |
| 測試：core（最新版本判斷、已是最新、範例、無金鑰、written／conflict／error、單一失敗、摘要；假 fetch＋假金鑰） | 1、2、3 |
| 測試：腳本（`--summary` 參數解析、無變動時的輸出 `NO_UPDATES_LINE`） | 3、5 |
| 測試：`open-tracking-pr.sh` 模組追蹤的預設分支與標題不變 | 4 |
| 文件：`docs/development.md` 的 `track:modpacks`、workflow、`CURSEFORGE_API_KEY` secret 設定（不要貼到 issue、PR 或聊天） | 5 |
| 不在範圍（自動收錄新整合包、補收錄新模組、保留舊版本） | 未實作；slug 改名時不建立新資料夾（2） |
