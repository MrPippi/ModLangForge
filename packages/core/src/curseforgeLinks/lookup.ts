import { CURSEFORGE_GAME_ID, CURSEFORGE_MOD_CLASS, searchCurseforge } from '../modpackImport/curseforge';
import type { FetchLike } from '../modpackImport/http';
import { decideLink, type LinkMatch, type LinkTarget, matchBySlug } from './match';

export const NAME_SEARCH_PAGE_SIZE = 20;

/** 依序查詢：先以 Modrinth slug，沒有確定的結果再以名稱；請求不重試，錯誤直接丟出 */
export async function findCurseforgeLink(fetchImpl: FetchLike, apiKey: string, target: LinkTarget): Promise<LinkMatch> {
  const base = { gameId: CURSEFORGE_GAME_ID, classId: CURSEFORGE_MOD_CLASS };
  const bySlug = target.slug === null ? [] : await searchCurseforge(fetchImpl, apiKey, { ...base, slug: target.slug });
  if (matchBySlug(target, bySlug)) return decideLink(target, bySlug, []);
  const byName = await searchCurseforge(fetchImpl, apiKey, { ...base, searchFilter: target.name, pageSize: NAME_SEARCH_PAGE_SIZE });
  return decideLink(target, bySlug, byName);
}
