import { z } from 'zod';
import { isMinecraftName } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';

/** 專案對外請求一律使用此 User-Agent（與 scripts/lib/modrinth.ts 相同） */
export const MOJANG_USER_AGENT = 'ModLangForge/0.1 (+https://github.com/MrPippi/ModLangForge)';

/** 單次查詢逾時（毫秒）；逾時視為 failed */
export const MOJANG_TIMEOUT_MS = 5000;

const playerSchema = z.object({
  data: z.object({
    player: z.object({
      username: z.string().refine(isMinecraftName),
      raw_id: z.string().regex(/^[0-9a-fA-F]{32}$/).transform((v) => v.toLowerCase()),
    }),
  }),
});

const errorSchema = z.object({ code: z.string() });

export type MojangLookup =
  | { readonly kind: 'found'; readonly name: string; readonly uuid: string }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'failed'; readonly status: number };

/** playerdb.co 對不存在的名稱回 400 + 此 code */
const INVALID_USERNAME_CODE = 'minecraft.invalid_username';

/**
 * 以名稱查 Minecraft 玩家（經 playerdb.co 代理 Mojang；Mojang 對 Cloudflare 出口回 403）。
 * 只送出名稱，不帶任何使用者資料。
 */
export async function lookupMinecraftName(fetchImpl: FetchLike, apiBase: string, name: string): Promise<MojangLookup> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/player/minecraft/${encodeURIComponent(name)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': MOJANG_USER_AGENT },
      signal: AbortSignal.timeout(MOJANG_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'failed', status: 0 };
  }
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 400) {
    const err = errorSchema.safeParse(await res.json().catch(() => null));
    return err.success && err.data.code === INVALID_USERNAME_CODE ? { kind: 'not_found' } : { kind: 'failed', status: 400 };
  }
  if (!res.ok) return { kind: 'failed', status: res.status };
  const parsed = playerSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { kind: 'failed', status: res.status };
  const { username, raw_id } = parsed.data.data.player;
  if (username.toLowerCase() !== name.toLowerCase()) return { kind: 'not_found' };
  return { kind: 'found', name: username, uuid: raw_id };
}
