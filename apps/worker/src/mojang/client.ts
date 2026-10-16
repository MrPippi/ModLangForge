import { z } from 'zod';
import { isMinecraftName } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';

/** 專案對外請求一律使用此 User-Agent（與 scripts/lib/modrinth.ts 相同） */
export const MOJANG_USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';

/** 單次查詢逾時（毫秒）；逾時視為 failed */
export const MOJANG_TIMEOUT_MS = 5000;

const profileSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{32}$/).transform((s) => s.toLowerCase()),
  name: z.string().refine(isMinecraftName),
});

export type MojangLookup =
  | { readonly kind: 'found'; readonly name: string; readonly uuid: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'failed'; readonly status: number };

/** 以名稱查 Mojang 公開 API；只送出名稱，不帶任何使用者資料 */
export async function lookupMinecraftName(fetchImpl: FetchLike, apiBase: string, name: string): Promise<MojangLookup> {
  const url = `${apiBase.replace(/\/+$/, '')}/users/profiles/minecraft/${encodeURIComponent(name)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': MOJANG_USER_AGENT },
      signal: AbortSignal.timeout(MOJANG_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'failed', status: 0 };
  }
  if (res.status === 204 || res.status === 404) return { kind: 'not_found' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (!res.ok) return { kind: 'failed', status: res.status };
  const parsed = profileSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? { kind: 'found', name: parsed.data.name, uuid: parsed.data.id } : { kind: 'failed', status: res.status };
}
