import { listModIdsIn, readModrinthSlugIn } from '@mlf/core/node';
import { DATA_DIR } from './modrinth';

/** 讀取模組的 Modrinth slug（含內建繁中條目）；沒有連結時回傳 null */
export function readModrinthSlug(modId: string): Promise<string | null> {
  return readModrinthSlugIn(DATA_DIR, modId);
}

/** data/mods 與 data/builtin-mods 底下所有模組 ID（排序、去重） */
export function listModIds(): Promise<readonly string[]> {
  return listModIdsIn(DATA_DIR);
}

/** 目前有 Modrinth 連結的模組 ID 對應 slug（保持傳入順序） */
export async function modrinthSlugs(modIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const pairs = await Promise.all(modIds.map(async (id) => [id, await readModrinthSlug(id)] as const));
  return new Map(pairs.flatMap(([id, slug]) => (slug ? [[id, slug] as const] : [])));
}
