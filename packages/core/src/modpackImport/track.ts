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
