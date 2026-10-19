import { z } from 'zod';
import { apiInit, CURSEFORGE_API, CURSEFORGE_GAME_ID, CURSEFORGE_MOD_CLASS } from '../modpackImport/curseforge';
import { parseOrThrow } from '../modpackImport/errors';
import { fetchJson, type FetchLike } from '../modpackImport/http';

export const CURSEFORGE_IMAGE_PREFIX = 'https://media.forgecdn.net/';

const imageSchema = z.object({ url: z.string().nullish(), thumbnailUrl: z.string().nullish() });
const projectSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  slug: z.string().min(1),
  classId: z.number().int().nullish(),
  authors: z.array(z.object({ name: z.string().min(1) })),
  downloadCount: z.number().nullish(),
  logo: imageSchema.nullish(),
  screenshots: z.array(imageSchema).nullish(),
});
const searchSchema = z.object({ data: z.array(projectSchema) });

/** CurseForge 上的一個模組專案 */
export interface CurseforgeProject {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly authors: readonly string[];
  /** 平台沒有提供下載量時為 null */
  readonly downloadCount: number | null;
  readonly logoUrl: string | null;
  readonly screenshotUrls: readonly string[];
}

type RawProject = z.infer<typeof projectSchema>;

export function toProject(raw: RawProject): CurseforgeProject {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    authors: raw.authors.map((a) => a.name),
    downloadCount: raw.downloadCount ?? null,
    logoUrl: raw.logo?.url ?? raw.logo?.thumbnailUrl ?? null,
    screenshotUrls: (raw.screenshots ?? []).flatMap((s) => (s.url ? [s.url] : [])),
  };
}

/** GET /mods/search；參數依傳入順序組成查詢字串，回應以 zod 驗證 */
export async function searchCurseforgeProjects(
  fetchImpl: FetchLike,
  apiKey: string,
  params: Readonly<Record<string, string | number>>,
): Promise<RawProject[]> {
  const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const raw = await fetchJson(fetchImpl, `${CURSEFORGE_API}/mods/search?${query}`, apiInit(apiKey));
  return parseOrThrow(searchSchema, raw, 'CurseForge 搜尋結果').data;
}

/** 以 slug 精確查詢模組（classId 6）；slug 不完全相同或不是模組時回傳 null */
export async function findCurseforgeProject(fetchImpl: FetchLike, apiKey: string, slug: string): Promise<CurseforgeProject | null> {
  const hits = await searchCurseforgeProjects(fetchImpl, apiKey, { gameId: CURSEFORGE_GAME_ID, classId: CURSEFORGE_MOD_CLASS, slug });
  const hit = hits.find((m) => m.slug === slug && m.classId === CURSEFORGE_MOD_CLASS);
  return hit ? toProject(hit) : null;
}
