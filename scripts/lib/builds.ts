import { downloadCurseforgeJar, findCurseforgeProject, listCurseforgeBuilds } from '@mlf/core/curseforgeMods';
import { curseforgeSlug } from '@mlf/core/modpack';
import { buildSourceFor, fromModrinthVersion, modrinthSlug, type ModrinthVersion, type PlatformBuild } from '@mlf/core/pipeline';
import { API, downloadModrinthFile, getJson } from './modrinth';

interface Links {
  readonly modrinth?: string;
  readonly curseforge?: string;
}

async function modrinthBuilds(slug: string): Promise<PlatformBuild[]> {
  const versions = await getJson<ModrinthVersion[]>(`${API}/project/${slug}/version`);
  return versions.map(fromModrinthVersion);
}

async function curseforgeBuilds(slug: string, apiKey: string): Promise<PlatformBuild[]> {
  const project = await findCurseforgeProject(fetch, apiKey, slug);
  if (!project) throw new Error(`CurseForge 上找不到 ${slug}`);
  return listCurseforgeBuilds(fetch, apiKey, project.id, (fetched, total) =>
    console.warn(`${slug}: CurseForge 檔案過多，只取最新 ${fetched} 個（共 ${total} 個）`));
}

/** 依 trackingPlatform 取得模組的全部版本；CurseForge 專有模組沒有金鑰時回傳略過原因 */
export async function listBuilds(meta: { readonly links: Links }, apiKey: string | undefined): Promise<{ builds: PlatformBuild[] } | { skip: string }> {
  const source = buildSourceFor(meta.links, apiKey);
  if ('skip' in source) return source;
  if (source.platform === 'modrinth') return { builds: await modrinthBuilds(modrinthSlug(meta.links.modrinth) ?? '') };
  return { builds: await curseforgeBuilds(curseforgeSlug(meta.links.curseforge) ?? '', apiKey ?? '') };
}

/** 下載版本的 jar；Modrinth 走既有規則（非 .jar 或過大回傳 null），CurseForge 走白名單 CDN 並比對 sha1 */
export async function downloadBuildJar(build: PlatformBuild): Promise<Uint8Array | null> {
  if (build.platform === 'curseforge') return downloadCurseforgeJar(fetch, build);
  return build.file.url === null ? null : downloadModrinthFile(build.file.name, build.file.url);
}
