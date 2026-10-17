import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { modrinthSlug } from '@mlf/core/pipeline';
import { MODS_DIR } from './modrinth';

/** 讀取模組的 Modrinth slug；沒有連結時回傳 null */
export async function readModrinthSlug(modId: string): Promise<string | null> {
  const meta = JSON.parse(await readFile(join(MODS_DIR, modId, 'mod.json'), 'utf8')) as { links?: { modrinth?: string } };
  return modrinthSlug(meta.links?.modrinth);
}

/** data/mods 底下所有模組 ID（排序） */
export async function listModIds(): Promise<readonly string[]> {
  const entries = await readdir(MODS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** 目前有 Modrinth 連結的模組 ID 對應 slug（保持傳入順序） */
export async function modrinthSlugs(modIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const pairs = await Promise.all(modIds.map(async (id) => [id, await readModrinthSlug(id)] as const));
  return new Map(pairs.flatMap(([id, slug]) => (slug ? [[id, slug] as const] : [])));
}
