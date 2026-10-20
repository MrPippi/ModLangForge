import { MAX_JAR_BYTES } from '../jar/errors';
import { ModpackImportError } from '../modpackImport/errors';
import { type FetchLike, type FetchResponse, USER_AGENT } from '../modpackImport/http';
import type { PlatformBuild } from '../pipeline/build';

/** CDN 之間（edge → mediafilez）會轉址；最多跟隨幾次 */
const MAX_REDIRECTS = 3;

/** 允許下載 CurseForge jar 的 CDN；不在清單內的網址一律拒絕 */
export const CURSEFORGE_JAR_HOSTS: readonly string[] = ['https://edge.forgecdn.net/', 'https://mediafilez.forgecdn.net/'];

/** 作者在 CurseForge 關閉第三方下載（downloadUrl 為 null） */
export class CurseforgeDownloadBlocked extends Error {
  constructor(fileName: string) {
    super(`${fileName}：作者不允許第三方下載`);
    this.name = 'CurseforgeDownloadBlocked';
  }
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isAllowedHost = (url: string): boolean => CURSEFORGE_JAR_HOSTS.some((host) => url.startsWith(host));

/** 手動跟隨轉址：每一跳的網址都必須在 CDN 白名單內，不帶金鑰 */
async function fetchFromCdn(fetchImpl: FetchLike, startUrl: string, name: string): Promise<FetchResponse> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' });
    const location = res.status >= 300 && res.status < 400 ? res.headers?.get('location') : null;
    if (!location) return res;
    // 轉址回應的內容用不到，先讀掉以釋放連線
    await res.arrayBuffer().catch(() => undefined);
    url = new URL(location, url).href;
    if (!isAllowedHost(url)) throw new ModpackImportError(`${name} 轉址到不在允許清單內的主機`);
  }
  throw new ModpackImportError(`${name} 轉址次數過多`);
}

/** 下載 CurseForge jar：只認 CDN 白名單（含轉址）、不帶金鑰、有 sha1 就比對 */
export async function downloadCurseforgeJar(fetchImpl: FetchLike, build: PlatformBuild): Promise<Uint8Array> {
  const { url, name, sha1 } = build.file;
  if (url === null) throw new CurseforgeDownloadBlocked(name);
  if (!isAllowedHost(url)) throw new ModpackImportError(`${name} 的下載網址不在允許的主機清單內`);
  const res = await fetchFromCdn(fetchImpl, url, name);
  if (!res.ok) throw new ModpackImportError(`HTTP ${res.status} ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_JAR_BYTES) throw new ModpackImportError(`${name} 超過 ${MAX_JAR_BYTES} bytes`);
  if (sha1 && (await sha1Hex(bytes)) !== sha1.toLowerCase()) throw new ModpackImportError(`${name} 的 sha1 與 CurseForge 記錄不符`);
  return bytes;
}
