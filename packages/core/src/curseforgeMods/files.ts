import { LOADERS } from '../catalog/schema';
import { PACK_FORMATS } from '../export/packFormats';
import { listCurseforgeFiles, type CurseforgeFile } from '../modpackImport/curseforge';
import type { FetchLike } from '../modpackImport/http';
import type { Loader, PlatformBuild } from '../pipeline/build';
import { JSON_LANG_MIN_PACK_FORMAT } from '../pipeline/modrinth';

/** CurseForge fileStatus：4 代表已核准 */
const APPROVED_STATUS = 4;
/** hashes 中 algo 1 為 SHA-1 */
const SHA1_ALGO = 1;
const JAR_SUFFIX = /\.jar$/i;

const SUPPORTED_MC_VERSIONS: ReadonlySet<string> = new Set(
  PACK_FORMATS.filter((p) => p.packFormat >= JSON_LANG_MIN_PACK_FORMAT).map((p) => p.mcVersion),
);

const toLoader = (name: string): Loader | undefined => LOADERS.find((l) => l === name.toLowerCase());

/** CurseForge 檔案轉成平台中立的版本；伺服器包、非 jar、不可用／未核准、或沒有支援的 MC 版本或載入器時回傳 null */
export function fromCurseforgeFile(file: CurseforgeFile): PlatformBuild | null {
  if (file.isServerPack === true || !JAR_SUFFIX.test(file.fileName)) return null;
  if (file.isAvailable === false) return null;
  if (file.fileStatus != null && file.fileStatus !== APPROVED_STATUS) return null;
  const mcVersions = file.gameVersions.filter((v) => SUPPORTED_MC_VERSIONS.has(v));
  const loaders = [...new Set(file.gameVersions.flatMap((v) => toLoader(v) ?? []))];
  if (mcVersions.length === 0 || loaders.length === 0) return null;
  const sha1 = file.hashes.find((h) => h.algo === SHA1_ALGO)?.value;
  return {
    platform: 'curseforge',
    id: String(file.id),
    modVersion: file.fileName.replace(JAR_SUFFIX, ''),
    mcVersions,
    loaders,
    publishedAt: file.fileDate,
    file: { name: file.fileName, url: file.downloadUrl, ...(sha1 ? { sha1 } : {}) },
  };
}

/** 專案所有可用檔案（alpha／beta 也列入），已轉成平台中立的版本 */
export async function listCurseforgeBuilds(fetchImpl: FetchLike, apiKey: string, projectId: number): Promise<PlatformBuild[]> {
  const files = await listCurseforgeFiles(fetchImpl, projectId, apiKey);
  return files.flatMap((f) => fromCurseforgeFile(f) ?? []);
}
