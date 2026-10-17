import { z } from 'zod';
import type { ModpackMod } from '../modpack/schema';
import { readCurseZip } from './archive';
import { ModpackImportError, parseOrThrow } from './errors';
import { chunk, type FetchInit, type FetchLike, fetchBytes, fetchJson } from './http';
import type { ImportedModpack } from './plan';

export const CURSEFORGE_API = 'https://api.curseforge.com/v1';
export const CURSEFORGE_GAME_ID = 432;
export const CURSEFORGE_MODPACK_CLASS = 4471;
export const CURSEFORGE_MOD_CLASS = 6;
const BATCH_SIZE = 100;
const FILE_PAGE_SIZE = 50;
const MAX_FILE_PAGES = 100;

const modSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  slug: z.string().min(1),
  classId: z.number().int().nullish(),
  authors: z.array(z.object({ name: z.string().min(1) })),
});
const oneModSchema = z.object({ data: modSchema });
const searchSchema = z.object({ data: z.array(modSchema) });
const paginationSchema = z.object({ index: z.number().int().min(0), totalCount: z.number().int().min(0) });
const filesSchema = z.object({
  pagination: paginationSchema,
  data: z.array(z.object({
    id: z.number().int(),
    displayName: z.string(),
    fileName: z.string(),
    fileDate: z.string(),
    downloadUrl: z.string().nullable(),
    isServerPack: z.boolean().nullish(),
  })),
});
const lookupSchema = z.object({ data: z.array(z.object({ id: z.number().int(), slug: z.string().min(1), classId: z.number().int().nullish() })) });

type CfMod = z.infer<typeof modSchema>;
type CfFile = z.infer<typeof filesSchema>['data'][number];
type CfLookup = z.infer<typeof lookupSchema>['data'][number];

/** 維護者以 --file 提供的整合包 zip */
export interface LocalFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface CurseforgeImportArgs {
  /** slug 或數字專案 ID */
  readonly ref: string;
  readonly apiKey: string;
  /** 檔案的 displayName、fileName 或 id；省略時取最新的非伺服器檔 */
  readonly version?: string;
  readonly localFile?: LocalFile;
}

/** 金鑰只放在送往 CURSEFORGE_API 的請求（且不跟隨轉址）；下載 CDN 不帶金鑰 */
function apiInit(apiKey: string, extra: Omit<FetchInit, 'headers' | 'redirect'> & { readonly headers?: Readonly<Record<string, string>> } = {}): FetchInit {
  const { headers, ...rest } = extra;
  return { ...rest, headers: { 'x-api-key': apiKey, Accept: 'application/json', ...headers }, redirect: 'error' };
}

export function noDownloadMessage(file: string): string {
  return `${file} 不允許第三方下載。請從 CurseForge 網站手動下載整合包 zip，再加上 --file <路徑> 重新執行。`;
}

async function findModpack(fetchImpl: FetchLike, ref: string, apiKey: string): Promise<CfMod> {
  const init = apiInit(apiKey);
  const mod = /^\d+$/.test(ref)
    ? parseOrThrow(oneModSchema, await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods/${ref}`, init), 'CurseForge 專案').data
    : parseOrThrow(
      searchSchema,
      await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods/search?gameId=${CURSEFORGE_GAME_ID}&classId=${CURSEFORGE_MODPACK_CLASS}&slug=${encodeURIComponent(ref)}`, init),
      'CurseForge 搜尋結果',
    ).data[0];
  if (!mod) throw new ModpackImportError(`CurseForge 上找不到整合包 ${ref}`);
  if (mod.classId !== CURSEFORGE_MODPACK_CLASS) throw new ModpackImportError(`${mod.slug} 不是整合包`);
  return mod;
}

function pickFile(files: readonly CfFile[], wanted: string | undefined): CfFile {
  const clientFiles = files.filter((f) => f.isServerPack !== true);
  if (wanted !== undefined) {
    const found = clientFiles.find((f) => f.displayName === wanted || f.fileName === wanted || String(f.id) === wanted);
    if (!found) throw new ModpackImportError(`CurseForge 上找不到檔案 ${wanted}`);
    return found;
  }
  const latest = [...clientFiles].sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0];
  if (!latest) throw new ModpackImportError('CurseForge 上沒有可用的整合包檔案');
  return latest;
}

interface PackFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly displayName?: string;
}

/** 依 index 逐頁取得所有檔案，直到 pagination.totalCount；空頁或超過頁數上限即停止 */
async function listFiles(fetchImpl: FetchLike, modId: number, apiKey: string): Promise<CfFile[]> {
  const files: CfFile[] = [];
  for (let page = 0; page < MAX_FILE_PAGES; page += 1) {
    const url = `${CURSEFORGE_API}/mods/${modId}/files?pageSize=${FILE_PAGE_SIZE}&index=${files.length}`;
    const body = parseOrThrow(filesSchema, await fetchJson(fetchImpl, url, apiInit(apiKey)), 'CurseForge 檔案清單');
    files.push(...body.data);
    if (body.data.length === 0 || files.length >= body.pagination.totalCount) break;
  }
  return files;
}

async function packFile(fetchImpl: FetchLike, modId: number, args: CurseforgeImportArgs): Promise<PackFile> {
  if (args.localFile) return { name: args.localFile.name, bytes: args.localFile.bytes };
  const files = await listFiles(fetchImpl, modId, args.apiKey);
  const file = pickFile(files, args.version);
  if (!file.downloadUrl) throw new ModpackImportError(noDownloadMessage(file.displayName));
  return { name: file.fileName, bytes: await fetchBytes(fetchImpl, file.downloadUrl), displayName: file.displayName };
}

async function lookupMods(fetchImpl: FetchLike, ids: readonly string[], apiKey: string): Promise<ReadonlyMap<string, CfLookup>> {
  const init = apiInit(apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  const batches = await Promise.all(chunk(ids, BATCH_SIZE).map(async (batch) => {
    const body = JSON.stringify({ modIds: batch.map(Number) });
    const raw = await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods`, { ...init, body });
    return parseOrThrow(lookupSchema, raw, 'CurseForge 模組清單').data;
  }));
  return new Map(batches.flat().map((m) => [String(m.id), m]));
}

/** 只有 classId 6（模組）列入 mods；資源包等其他專案與查不到的專案寫入 notes */
function describeMods(ids: readonly string[], found: ReadonlyMap<string, CfLookup>): { mods: ModpackMod[]; notes: string[] } {
  const mods = ids.flatMap((id) => {
    const m = found.get(id);
    return m && m.classId === CURSEFORGE_MOD_CLASS ? [{ platform: 'curseforge' as const, projectId: id, slug: m.slug }] : [];
  });
  const notes = ids.flatMap((id) => {
    const m = found.get(id);
    if (!m) return [`CurseForge 查不到專案 ${id}，未列入模組清單`];
    return m.classId === CURSEFORGE_MOD_CLASS ? [] : [`略過非模組專案 ${m.slug}`];
  });
  return { mods, notes };
}

export async function importFromCurseforge(fetchImpl: FetchLike, args: CurseforgeImportArgs): Promise<ImportedModpack> {
  const pack = await findModpack(fetchImpl, args.ref, args.apiKey);
  const file = await packFile(fetchImpl, pack.id, args);
  const { manifest, kubejs } = await readCurseZip(file.bytes, file.name);
  const { mods, notes } = describeMods(manifest.projectIds, await lookupMods(fetchImpl, manifest.projectIds, args.apiKey));
  return {
    platform: 'curseforge',
    projectId: String(pack.id),
    slug: pack.slug,
    name: pack.name,
    authors: [...new Set(pack.authors.map((a) => a.name))],
    version: manifest.version ?? file.displayName ?? file.name,
    mcVersion: manifest.mcVersion,
    loader: manifest.loader,
    mods,
    kubejs,
    notes,
  };
}
