import JSZip from 'jszip';
import { MAX_JAR_BYTES, MAX_UNCOMPRESSED_BYTES } from '../jar/errors';
import { ModpackImportError } from './errors';

export interface ArchiveReadOptions {
  /** 解壓後內容總上限（所有讀取的檔案共用），預設 MAX_UNCOMPRESSED_BYTES */
  readonly maxUncompressedBytes?: number;
}

/** 單次讀取的上下文；totalBytes 為所有已讀檔案共用的解壓後累計量（同 jar/readJar 的做法） */
export interface ArchiveContext {
  readonly zip: JSZip;
  readonly name: string;
  readonly limit: number;
  totalBytes: number;
}

const MB = 1024 * 1024;

async function loadZip(bytes: Uint8Array, name: string): Promise<JSZip> {
  if (bytes.byteLength > MAX_JAR_BYTES) throw new ModpackImportError(`${name} 超過 ${MAX_JAR_BYTES} bytes`);
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new ModpackImportError(`${name} 不是有效的壓縮檔`);
  }
}

/** 讀取檔案文字並累計解壓後大小，超過上限即丟錯 */
export async function readText(ctx: ArchiveContext, path: string): Promise<string> {
  const file = ctx.zip.file(path);
  if (!file) throw new ModpackImportError(`${ctx.name} 裡沒有 ${path}`);
  const text = await file.async('string');
  ctx.totalBytes += text.length;
  if (ctx.totalBytes > ctx.limit) {
    throw new ModpackImportError(`${ctx.name} 解壓後內容超過 ${Math.round(ctx.limit / MB)} MB 上限`);
  }
  return text;
}

export async function openContext(bytes: Uint8Array, name: string, options?: ArchiveReadOptions): Promise<ArchiveContext> {
  const zip = await loadZip(bytes, name);
  return { zip, name, limit: options?.maxUncompressedBytes ?? MAX_UNCOMPRESSED_BYTES, totalBytes: 0 };
}
