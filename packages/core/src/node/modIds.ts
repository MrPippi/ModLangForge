import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILTIN_DIR } from '../catalog/builtinSchema';
import { curseforgeSlug } from '../modpack/resolve';
import type { Platform } from '../pipeline/build';
import { modrinthSlug } from '../pipeline/modrinth';
import { trackingPlatform } from '../pipeline/platform';
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

interface MetaLinks {
  readonly modrinth?: string;
  readonly curseforge?: string;
}

async function readLinksFile(file: string): Promise<{ links?: MetaLinks }> {
  return JSON.parse(await readFile(file, 'utf8')) as { links?: MetaLinks };
}

/** 讀取模組的連結：先找 mods/<id>/mod.json，沒有再找 builtin-mods/<id>.json */
async function readLinksIn(dataDir: string, modId: string): Promise<MetaLinks> {
  let meta: { links?: MetaLinks };
  try {
    meta = await readLinksFile(join(dataDir, 'mods', modId, 'mod.json'));
  } catch (err) {
    if (!isMissing(err)) throw err;
    meta = await readLinksFile(join(dataDir, BUILTIN_DIR, `${modId}${JSON_EXT}`));
  }
  return meta.links ?? {};
}

/** 讀取模組的 Modrinth slug（mods 優先，再找內建條目）；沒有連結時回傳 null */
export async function readModrinthSlugIn(dataDir: string, modId: string): Promise<string | null> {
  return modrinthSlug((await readLinksIn(dataDir, modId)).modrinth);
}

/** 讀取模組追蹤所依據的平台與 slug（Modrinth 優先）；兩個平台都沒有可用連結時回傳 null */
export async function readTrackingSourceIn(dataDir: string, modId: string): Promise<{ readonly platform: Platform; readonly slug: string } | null> {
  const links = await readLinksIn(dataDir, modId);
  const platform = trackingPlatform(links);
  if (platform === 'modrinth') return { platform, slug: modrinthSlug(links.modrinth) as string };
  if (platform === 'curseforge') return { platform, slug: curseforgeSlug(links.curseforge) as string };
  return null;
}
