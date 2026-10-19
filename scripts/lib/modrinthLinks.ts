import { listCurseforgeSlugsIn, listModIdsIn, readModrinthSlugIn, readTrackingSourceIn } from '@mlf/core/node';
import type { Platform } from '@mlf/core/pipeline';
import { DATA_DIR } from './modrinth';

export interface TrackingSource {
  readonly platform: Platform;
  readonly slug: string;
}

/** 讀取模組的 Modrinth slug（含內建繁中條目）；沒有連結時回傳 null */
export function readModrinthSlug(modId: string): Promise<string | null> {
  return readModrinthSlugIn(DATA_DIR, modId);
}

/** data/mods 與 data/builtin-mods 底下所有模組 ID（排序、去重） */
export function listModIds(): Promise<readonly string[]> {
  return listModIdsIn(DATA_DIR);
}

/** 目前有追蹤平台（Modrinth 優先，其次 CurseForge）的模組 ID 對應平台與 slug（保持傳入順序） */
export async function trackingSources(modIds: readonly string[]): Promise<ReadonlyMap<string, TrackingSource>> {
  const pairs = await Promise.all(modIds.map(async (id) => [id, await readTrackingSourceIn(DATA_DIR, id)] as const));
  return new Map(pairs.flatMap(([id, source]) => (source ? [[id, source] as const] : [])));
}

/** data/mods 與 data/builtin-mods 所有條目已有的 CurseForge slug */
export function listCurseforgeSlugs(): Promise<ReadonlySet<string>> {
  return listCurseforgeSlugsIn(DATA_DIR);
}
