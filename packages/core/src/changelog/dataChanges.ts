import type { TranslationDay } from './schema';

export type FileStatus = 'A' | 'M' | 'D';

/** main 上一個 commit（合併 commit 以第一個 parent 計算差異）對翻譯資料的變動 */
export interface DataCommit {
  readonly hash: string;
  /** 第一個 parent；第一個 commit 沒有 */
  readonly parent: string | null;
  /** 台灣時間的日期 YYYY-MM-DD */
  readonly date: string;
  readonly files: readonly { readonly status: FileStatus; readonly path: string }[];
}

/** 同一天的檔案變動，依模組歸類 */
export interface DayFiles {
  readonly date: string;
  /** 當天第一個 commit 之前的版本 */
  readonly before: string | null;
  /** 當天最後一個 commit */
  readonly after: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly translated: readonly string[];
  /** mod.json 有修改、要比對版本的模組 */
  readonly metaChanged: readonly string[];
}

const MOD_FILE = /^data\/mods\/([^/]+)\/(.+)$/;
const BUILTIN_FILE = /^data\/builtin-mods\/([^/]+)\.json$/;

/** 把 ISO 時間轉成台灣時間的日期 */
export function taipeiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

interface DayDraft {
  readonly added: Set<string>;
  readonly removed: Set<string>;
  readonly translated: Set<string>;
  readonly metaChanged: Set<string>;
}

function classify(draft: DayDraft, status: FileStatus, path: string): void {
  const builtin = BUILTIN_FILE.exec(path);
  if (builtin?.[1]) {
    if (status === 'A') draft.added.add(builtin[1]);
    if (status === 'D') draft.removed.add(builtin[1]);
    return;
  }
  const mod = MOD_FILE.exec(path);
  if (!mod?.[1] || !mod[2]) return;
  const [, modId, file] = mod;
  if (file === 'mod.json') {
    if (status === 'A') draft.added.add(modId);
    else if (status === 'D') draft.removed.add(modId);
    else draft.metaChanged.add(modId);
  } else if (file.includes('zh_tw') && status !== 'D') {
    draft.translated.add(modId);
  }
}

const sorted = (ids: Iterable<string>): string[] => [...ids].sort();

function finishDay(date: string, commits: readonly DataCommit[], draft: DayDraft): DayFiles {
  // 同一天移除又收錄（例如改為內建繁中條目）不算新增或移除
  const moved = new Set([...draft.added].filter((id) => draft.removed.has(id)));
  const added = sorted([...draft.added].filter((id) => !moved.has(id)));
  const isNew = new Set(added);
  return {
    date,
    before: commits[0]?.parent ?? null,
    after: commits.at(-1)?.hash ?? '',
    added,
    removed: sorted([...draft.removed].filter((id) => !moved.has(id))),
    translated: sorted([...draft.translated].filter((id) => !isNew.has(id) && !draft.removed.has(id))),
    metaChanged: sorted([...draft.metaChanged].filter((id) => !isNew.has(id) && !draft.removed.has(id))),
  };
}

/** 依日期歸類 commit（輸入由舊到新），回傳由新到舊 */
export function groupByDay(commits: readonly DataCommit[]): DayFiles[] {
  const byDate = new Map<string, DataCommit[]>();
  for (const c of commits) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
  return [...byDate.entries()]
    .map(([date, dayCommits]) => {
      const draft: DayDraft = { added: new Set(), removed: new Set(), translated: new Set(), metaChanged: new Set() };
      for (const c of dayCommits) for (const f of c.files) classify(draft, f.status, f.path);
      return finishDay(date, dayCommits, draft);
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** mod.json 中比對版本需要的欄位 */
export interface VersionInfo {
  readonly mcVersions: readonly string[];
  readonly sourceVersions: readonly { readonly modVersion?: string; readonly mcVersion: string }[];
}

/** 比對一天前後的版本：新增的 Minecraft 版本，以及是否跟進了模組新版本 */
export function versionChanges(before: VersionInfo, after: VersionInfo): { readonly newMc: readonly string[]; readonly updated: boolean } {
  const known = new Set(before.mcVersions);
  const newMc = after.mcVersions.filter((v) => !known.has(v));
  const rowKey = (r: VersionInfo['sourceVersions'][number]) => `${r.mcVersion}\u0000${r.modVersion ?? ''}`;
  const oldRows = new Set(before.sourceVersions.map(rowKey));
  return { newMc, updated: after.sourceVersions.some((r) => !oldRows.has(rowKey(r))) };
}

/** 組成一天的更新紀錄；完全沒有可列出的變動時回傳 null */
export function toTranslationDay(
  day: DayFiles,
  versions: ReadonlyMap<string, { readonly before: VersionInfo; readonly after: VersionInfo }>,
): TranslationDay | null {
  const newMc: { modId: string; mcVersions: string[] }[] = [];
  const updated: string[] = [];
  for (const modId of day.metaChanged) {
    const pair = versions.get(modId);
    if (!pair) continue;
    const change = versionChanges(pair.before, pair.after);
    if (change.newMc.length > 0) newMc.push({ modId, mcVersions: [...change.newMc] });
    else if (change.updated) updated.push(modId);
  }
  const result: TranslationDay = { date: day.date, added: [...day.added], removed: [...day.removed], translated: [...day.translated], newMc, updated };
  const empty = [result.added, result.removed, result.translated, result.newMc, result.updated].every((list) => list.length === 0);
  return empty ? null : result;
}
