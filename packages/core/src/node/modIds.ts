import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILTIN_DIR } from '../catalog/builtinSchema';
import { modrinthSlug } from '../pipeline/modrinth';
import { isMissing } from './fsErrors';

const JSON_EXT = '.json';

async function readDirOrEmpty(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

/** data/mods 資料夾與 data/builtin-mods/*.json 的所有 modId（排序、去重） */
export async function listModIdsIn(dataDir: string): Promise<readonly string[]> {
  const [mods, builtin] = await Promise.all([readDirOrEmpty(join(dataDir, 'mods')), readDirOrEmpty(join(dataDir, BUILTIN_DIR))]);
  const ids = [
    ...mods.filter((e) => e.isDirectory()).map((e) => e.name),
    ...builtin.filter((e) => e.isFile() && e.name.endsWith(JSON_EXT)).map((e) => e.name.slice(0, -JSON_EXT.length)),
  ];
  return [...new Set(ids)].sort();
}

async function readLinks(file: string): Promise<{ links?: { modrinth?: string } }> {
  return JSON.parse(await readFile(file, 'utf8')) as { links?: { modrinth?: string } };
}

/** 讀取模組的 Modrinth slug：先找 mods/<id>/mod.json，沒有再找 builtin-mods/<id>.json；沒有連結時回傳 null */
export async function readModrinthSlugIn(dataDir: string, modId: string): Promise<string | null> {
  let meta: { links?: { modrinth?: string } };
  try {
    meta = await readLinks(join(dataDir, 'mods', modId, 'mod.json'));
  } catch (err) {
    if (!isMissing(err)) throw err;
    meta = await readLinks(join(dataDir, BUILTIN_DIR, `${modId}${JSON_EXT}`));
  }
  return modrinthSlug(meta.links?.modrinth);
}
