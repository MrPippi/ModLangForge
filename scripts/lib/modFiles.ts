import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonText } from '@mlf/core/node';
import { MODS_DIR, toJson } from './modrinth';

const MOD_FILE = 'mod.json';

/** data/mods 底下的模組資料夾名稱 */
export async function listModIds(): Promise<string[]> {
  return (await readdir(MODS_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
}

/** 讀取 data/mods/<modId>/mod.json（容許 BOM，與 validate:data 一致）；驗證由呼叫端負責 */
export async function readModJson(modId: string): Promise<unknown> {
  const parsed = parseJsonText(await readFile(join(MODS_DIR, modId, MOD_FILE), 'utf8'));
  if (!parsed.ok) throw new Error(`${modId}/${MOD_FILE} JSON 解析失敗：${parsed.reason}`);
  return parsed.value;
}

/** 以既有資料的格式（2 空白縮排＋結尾換行）寫回 */
export async function writeModJson(modId: string, meta: Readonly<Record<string, unknown>>): Promise<void> {
  await writeFile(join(MODS_DIR, modId, MOD_FILE), toJson(meta), 'utf8');
}
