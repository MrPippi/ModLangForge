import { LangParseError, parseJsonLang } from '../lang';
import { stripBom } from '../lang/types';
import { isValidNamespace } from '../modpack/schema';
import { type ArchiveContext, type ArchiveReadOptions, openContext, readText } from './archiveContext';
import { ModpackImportError } from './errors';
import { parseCurseManifest, parseMrpackIndex, type ParsedCurseManifest, type ParsedMrpack } from './manifest';
import { type QuestRead, readQuests } from './questArchive';

export type { ArchiveReadOptions } from './archiveContext';

/** 命名空間 → KubeJS 英文原文 */
export type KubejsEnglish = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const MRPACK_INDEX = 'modrinth.index.json';
export const CURSE_MANIFEST = 'manifest.json';

/** 只讀 overrides/ 底下的 KubeJS 英文語言檔 */
const KUBEJS_LANG = /^overrides\/kubejs\/assets\/([^/]+)\/lang\/en_us\.json$/;

async function readJson(ctx: ArchiveContext, path: string): Promise<unknown> {
  const text = await readText(ctx, path);
  try {
    return JSON.parse(stripBom(text)) as unknown;
  } catch (err) {
    throw new ModpackImportError(`${path} JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readNamespace(ctx: ArchiveContext, ns: string, path: string): Promise<readonly [string, Readonly<Record<string, string>>]> {
  const text = await readText(ctx, path);
  try {
    return [ns, parseJsonLang(text).entries];
  } catch (err) {
    if (err instanceof LangParseError) throw new ModpackImportError(`${path} 讀取失敗：${err.message}`);
    throw err;
  }
}

/** 壓縮檔內的反斜線路徑視同 /；命名空間不合法（含 . 與 ..）或沒有任何字串的檔案略過；非字串值略過；逐檔順序讀取以控制記憶體 */
async function readKubejs(ctx: ArchiveContext): Promise<KubejsEnglish> {
  const found = Object.keys(ctx.zip.files)
    .flatMap((path) => {
      const ns = KUBEJS_LANG.exec(path.replaceAll('\\', '/'))?.[1];
      return ns !== undefined && isValidNamespace(ns) ? [[ns, path] as const] : [];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const entries: (readonly [string, Readonly<Record<string, string>>])[] = [];
  for (const [ns, path] of found) {
    entries.push(await readNamespace(ctx, ns, path));
  }
  return Object.fromEntries(entries.filter(([, en]) => Object.keys(en).length > 0));
}

export async function readMrpack(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ index: ParsedMrpack; kubejs: KubejsEnglish; ftbquests: QuestRead }> {
  const ctx = await openContext(bytes, name, options);
  const index = parseMrpackIndex(await readJson(ctx, MRPACK_INDEX));
  const kubejs = await readKubejs(ctx);
  return { index, kubejs, ftbquests: await readQuests(ctx, index.mcVersion) };
}

export async function readCurseZip(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ manifest: ParsedCurseManifest; kubejs: KubejsEnglish; ftbquests: QuestRead }> {
  const ctx = await openContext(bytes, name, options);
  const manifest = parseCurseManifest(await readJson(ctx, CURSE_MANIFEST));
  const kubejs = await readKubejs(ctx);
  return { manifest, kubejs, ftbquests: await readQuests(ctx, manifest.mcVersion) };
}
