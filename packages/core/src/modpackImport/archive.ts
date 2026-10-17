import JSZip from 'jszip';
import { MAX_JAR_BYTES, MAX_UNCOMPRESSED_BYTES } from '../jar/errors';
import { LangParseError, parseJsonLang } from '../lang';
import { stripBom } from '../lang/types';
import { isValidNamespace } from '../modpack/schema';
import { ModpackImportError } from './errors';
import { parseCurseManifest, parseMrpackIndex, type ParsedCurseManifest, type ParsedMrpack } from './manifest';

/** 命名空間 → KubeJS 英文原文 */
export type KubejsEnglish = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface ArchiveReadOptions {
  /** 解壓後內容總上限（所有讀取的檔案共用），預設 MAX_UNCOMPRESSED_BYTES */
  readonly maxUncompressedBytes?: number;
}

export const MRPACK_INDEX = 'modrinth.index.json';
export const CURSE_MANIFEST = 'manifest.json';

/** 只讀 overrides/ 底下的 KubeJS 英文語言檔 */
const KUBEJS_LANG = /^overrides\/kubejs\/assets\/([^/]+)\/lang\/en_us\.json$/;
const MB = 1024 * 1024;

/** 單次讀取的上下文；totalBytes 為所有已讀檔案共用的解壓後累計量（同 jar/readJar 的做法） */
interface ArchiveContext {
  readonly zip: JSZip;
  readonly name: string;
  readonly limit: number;
  totalBytes: number;
}

async function loadZip(bytes: Uint8Array, name: string): Promise<JSZip> {
  if (bytes.byteLength > MAX_JAR_BYTES) throw new ModpackImportError(`${name} 超過 ${MAX_JAR_BYTES} bytes`);
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new ModpackImportError(`${name} 不是有效的壓縮檔`);
  }
}

/** 讀取檔案文字並累計解壓後大小，超過上限即丟錯 */
async function readText(ctx: ArchiveContext, path: string): Promise<string> {
  const file = ctx.zip.file(path);
  if (!file) throw new ModpackImportError(`${ctx.name} 裡沒有 ${path}`);
  const text = await file.async('string');
  ctx.totalBytes += text.length;
  if (ctx.totalBytes > ctx.limit) {
    throw new ModpackImportError(`${ctx.name} 解壓後內容超過 ${Math.round(ctx.limit / MB)} MB 上限`);
  }
  return text;
}

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

async function openContext(bytes: Uint8Array, name: string, options?: ArchiveReadOptions): Promise<ArchiveContext> {
  const zip = await loadZip(bytes, name);
  return { zip, name, limit: options?.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES, totalBytes: 0 };
}

export async function readMrpack(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ index: ParsedMrpack; kubejs: KubejsEnglish }> {
  const ctx = await openContext(bytes, name, options);
  const index = parseMrpackIndex(await readJson(ctx, MRPACK_INDEX));
  return { index, kubejs: await readKubejs(ctx) };
}

export async function readCurseZip(
  bytes: Uint8Array,
  name: string,
  options?: ArchiveReadOptions,
): Promise<{ manifest: ParsedCurseManifest; kubejs: KubejsEnglish }> {
  const ctx = await openContext(bytes, name, options);
  const manifest = parseCurseManifest(await readJson(ctx, CURSE_MANIFEST));
  return { manifest, kubejs: await readKubejs(ctx) };
}
