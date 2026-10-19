import { CURSEFORGE_GAME_ID, CURSEFORGE_MOD_CLASS } from '../modpackImport/curseforge';
import type { FetchLike } from '../modpackImport/http';
import { searchCurseforgeProjects, toProject, type CurseforgeProject } from './project';

/** CurseForge sortField 6 = 下載量 */
const SORT_BY_DOWNLOADS = 6;
const RANKING_PAGE_SIZE = 50;

/** 依下載量由高到低的模組排行；index 為起始筆數 */
export async function curseforgeRankingPage(fetchImpl: FetchLike, apiKey: string, index: number): Promise<readonly CurseforgeProject[]> {
  const hits = await searchCurseforgeProjects(fetchImpl, apiKey, {
    gameId: CURSEFORGE_GAME_ID,
    classId: CURSEFORGE_MOD_CLASS,
    sortField: SORT_BY_DOWNLOADS,
    sortOrder: 'desc',
    pageSize: RANKING_PAGE_SIZE,
    index,
  });
  return hits.map(toProject);
}
