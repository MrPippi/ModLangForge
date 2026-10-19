import { MAX_JAR_BYTES } from '../jar/errors';
import { ModpackImportError } from './errors';

export const USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';

export interface FetchInit {
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** 帶金鑰的 API 請求用 'error'，避免金鑰隨轉址送到其他網域 */
  readonly redirect?: 'follow' | 'error' | 'manual';
}

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  /** 手動處理轉址時讀取 Location；假 fetch 可省略 */
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** 腳本傳入全域 fetch；測試注入假 fetch */
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/** 錯誤訊息只含狀態碼與網址，不含標頭（避免帶出金鑰） */
export async function fetchJson(fetchImpl: FetchLike, url: string, init: FetchInit = {}): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers } });
  if (!res.ok) throw new ModpackImportError(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 下載檔案；只帶 User-Agent，不帶任何 API 金鑰 */
export async function fetchBytes(fetchImpl: FetchLike, url: string, maxBytes: number = MAX_JAR_BYTES): Promise<Uint8Array> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new ModpackImportError(`HTTP ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new ModpackImportError(`${url} 超過 ${maxBytes} bytes`);
  return bytes;
}

export function chunk<T>(list: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
}
