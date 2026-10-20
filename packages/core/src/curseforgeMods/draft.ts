import { curseforgeModUrl } from '../curseforgeLinks/match';
import type { DraftProject } from '../pipeline/draft';
import type { PlatformBuild } from '../pipeline/build';
import type { CurseforgeProject } from './project';

/** CurseForge 專有模組的草稿輸入：只有 CurseForge 連結；MC 版本與載入器取自檔案清單（檔案清單已只含本站支援的版本） */
export function draftFromCurseforge(project: CurseforgeProject, builds: readonly PlatformBuild[]): DraftProject {
  return {
    name: project.name,
    slug: project.slug,
    authors: project.authors,
    links: { curseforge: curseforgeModUrl(project.slug) },
    mcVersions: [...new Set(builds.flatMap((b) => b.mcVersions))],
    loaders: [...new Set(builds.flatMap((b) => b.loaders))],
  };
}
