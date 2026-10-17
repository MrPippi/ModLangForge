import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILTIN_DIR } from '@mlf/core/catalog';
import { parseJsonText } from '@mlf/core/node';
import { DATA_DIR, MODS_DIR, toJson } from './modrinth';

const MOD_FILE = 'mod.json';
const JSON_EXT = '.json';
const BUILTIN_PATH = join(DATA_DIR, BUILTIN_DIR);

async function listBuiltinIds(): Promise<string[]> {
  const entries = await readdir(BUILTIN_PATH, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  return entries.filter((e) => e.isFile() && e.name.endsWith(JSON_EXT)).map((e) => e.name.slice(0, -JSON_EXT.length));
}

async function listRegularIds(): Promise<string[]> {
  return (await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

/** data/mods 的模組資料夾名稱，加上 data/builtin-mods 的內建條目（同一 modId 不會同時存在於兩處） */
export async function listModIds(): Promise<string[]> {
  return [...(await listRegularIds()), ...(await listBuiltinIds())];
}

/** modId 對應的檔案：一般模組為 data/mods/<modId>/mod.json，內建條目為 data/builtin-mods/<modId>.json */
async function modFilePath(modId: string): Promise<string> {
  return (await listBuiltinIds()).includes(modId) ? join(BUILTIN_PATH, `${modId}${JSON_EXT}`) : join(MODS_DIR, modId, MOD_FILE);
}

/** 讀取模組資料（容許 BOM，與 validate:data 一致）；驗證由呼叫端負責 */
export async function readModJson(modId: string): Promise<unknown> {
  const parsed = parseJsonText(await readFile(await modFilePath(modId), 'utf8'));
  if (!parsed.ok) throw new Error(`${modId} JSON 解析失敗：${parsed.reason}`);
  return parsed.value;
}

/** 以既有資料的格式（2 空白縮排＋結尾換行）寫回 */
export async function writeModJson(modId: string, meta: Readonly<Record<string, unknown>>): Promise<void> {
  await writeFile(await modFilePath(modId), toJson(meta), 'utf8');
}
