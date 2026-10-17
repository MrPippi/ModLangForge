import JSZip from 'jszip';
import { MAX_JAR_BYTES } from '../jar/errors';
import { LangParseError, parseJsonLang } from '../lang';
import { stripBom } from '../lang/types';
import { isValidNamespace } from '../modpack/schema';
import { ModpackImportError } from './errors';
import { parseCurseManifest, parseMrpackIndex, type ParsedCurseManifest, type ParsedMrpack } from './manifest';

/** 命名空間 → KubeJS 英文原文 */
export type KubejsEnglish = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const MRPACK_INDEX = 'modrinth.index.json';
export const CURSE_MANIFEST = 'manifest.json';

/** 只讀 overrides/ 底下的 KubeJS 英文語言檔 */
const KUBEJS_LANG = /^overrides\/kubejs\/assets\/([^/]+)\/lang\/en_us\.json$/;

async function loadZip(bytes: Uint8Array, name: string): Promise<JSZip> {
  if (bytes.byteLength > MAX_JAR_BYTES) throw new ModpackImportError(`${name} 超過 ${MAX_JAR_BYTES} bytes`);
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new ModpackImportError(`${name} 不是有效的壓縮檔`);
  }
}

async function readJson(zip: JSZip, path: string, name: string): Promise<unknown> {
  const file = zip.file(path);
  if (!file) throw new ModpackImportError(`${name} 裡沒有 ${path}`);
  const text = await file.async('string');
  try {
    return JSON.parse(stripBom(text)) as unknown;
  } catch (err) {
    throw new ModpackImportError(`${path} JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readNamespace(zip: JSZip, ns: string, path: string): Promise<readonly [string, Readonly<Record<string, string>>]> {
  const text = (await zip.file(path)?.async('string')) ?? '';
  try {
    return [ns, parseJsonLang(text).entries];
  } catch (err) {
    if (err instanceof LangParseError) throw new ModpackImportError(`${path} 讀取失敗：${err.message}`);
    throw err;
  }
}

/** 命名空間不合法（含 . 與 ..）或沒有任何字串的檔案略過；非字串值略過 */
async function readKubejs(zip: JSZip): Promise<KubejsEnglish> {
  const found = Object.keys(zip.files)
    .flatMap((path) => {
      const ns = KUBEJS_LANG.exec(path)?.[1];
      return ns !== undefined && isValidNamespace(ns) ? [[ns, path] as const] : [];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const entries = await Promise.all(found.map(([ns, path]) => readNamespace(zip, ns, path)));
  return Object.fromEntries(entries.filter(([, en]) => Object.keys(en).length > 0));
}

export async function readMrpack(bytes: Uint8Array, name: string): Promise<{ index: ParsedMrpack; kubejs: KubejsEnglish }> {
  const zip = await loadZip(bytes, name);
  const index = parseMrpackIndex(await readJson(zip, MRPACK_INDEX, name));
  return { index, kubejs: await readKubejs(zip) };
}

export async function readCurseZip(bytes: Uint8Array, name: string): Promise<{ manifest: ParsedCurseManifest; kubejs: KubejsEnglish }> {
  const zip = await loadZip(bytes, name);
  const manifest = parseCurseManifest(await readJson(zip, CURSE_MANIFEST, name));
  return { manifest, kubejs: await readKubejs(zip) };
}
