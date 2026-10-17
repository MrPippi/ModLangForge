import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { catalogModpackSchema, KUBEJS_DIR, KUBEJS_EN_FILE, langRecordSchema, MODPACK_FILE } from '@mlf/core/modpack';
import type { ExistingModpack, ModpackFiles } from '@mlf/core/modpackImport';
import { isMissing, MODPACKS_DIR, parseJsonText, writeFilesTogether } from '@mlf/core/node';
import { toJson } from './modrinth';

export const MODPACKS_DATA_DIR = resolve(import.meta.dirname, '..', '..', 'data', MODPACKS_DIR);

/** 讀取 JSON（容許 BOM，與 validate:data 一致）；檔案不存在時回傳 null，其餘錯誤丟出 */
async function readJsonOrNull(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  const parsed = parseJsonText(text);
  if (!parsed.ok) throw new Error(`${path} JSON 解析失敗：${parsed.reason}`);
  return parsed.value;
}

async function readKubejsEnglish(dir: string): Promise<ExistingModpack['kubejsEn']> {
  const root = join(dir, KUBEJS_DIR);
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isMissing(err)) return {};
    throw err;
  }
  const entries = await Promise.all(names.map(async (ns) => [ns, await readJsonOrNull(join(root, ns, KUBEJS_EN_FILE))] as const));
  return Object.fromEntries(entries.filter(([, en]) => en !== null).map(([ns, en]) => [ns, langRecordSchema.parse(en)]));
}

/** 讀取既有的 data/modpacks/<id>；不存在時回傳 null */
export async function readExisting(id: string): Promise<ExistingModpack | null> {
  const dir = join(MODPACKS_DATA_DIR, id);
  const raw = await readJsonOrNull(join(dir, MODPACK_FILE));
  if (raw === null) return null;
  return { meta: catalogModpackSchema.parse(raw), kubejsEn: await readKubejsEnglish(dir) };
}

/** 寫入 modpack.json 與有變動的 kubejs/<ns>/en_us.json；不動 zh_tw.json。id 與命名空間已在 core 驗證 */
export async function writeModpack(id: string, { meta, kubejsEn }: ModpackFiles): Promise<void> {
  const dir = join(MODPACKS_DATA_DIR, id);
  const namespaces = Object.keys(kubejsEn);
  await Promise.all([dir, ...namespaces.map((ns) => join(dir, KUBEJS_DIR, ns))].map((d) => mkdir(d, { recursive: true })));
  await writeFilesTogether([
    { path: join(dir, MODPACK_FILE), content: toJson(meta) },
    ...namespaces.map((ns) => ({ path: join(dir, KUBEJS_DIR, ns, KUBEJS_EN_FILE), content: toJson(kubejsEn[ns]) })),
  ]);
}
