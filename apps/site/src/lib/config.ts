import { resolveRepo } from './siteMeta';

/** GitHub repo（owner/name），由建置時的環境變數 PUBLIC_REPO 設定 */
export const REPO = resolveRepo(import.meta.env.PUBLIC_REPO);
export const SITE_NAME = 'ModLangForge 繁中模組翻譯站';
export const SITE_SHORT_NAME = 'ModLangForge';

/** Cloudflare Turnstile site key；預設為官方測試金鑰（永遠通過），正式部署需以 PUBLIC_TURNSTILE_SITE_KEY 覆寫 */
export const TURNSTILE_SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA';

export function githubRequestUrl(query: string): string {
  const title = encodeURIComponent(`[翻譯需求] ${query}`);
  return `https://github.com/${REPO}/issues/new?title=${title}&labels=request`;
}

export function modUrl(modId: string): string {
  return `/mods/${encodeURIComponent(modId)}/`;
}

export function modApiUrl(modId: string): string {
  return `/api/v1/mods/${encodeURIComponent(modId)}.json`;
}

/** Minecraft 頭像服務（依 UUID）；CSP img-src 需同步放行（apps/site/public/_headers） */
export const AVATAR_ORIGIN = 'https://mc-heads.net';

export function avatarUrl(uuid: string, size: number): string {
  return `${AVATAR_ORIGIN}/avatar/${encodeURIComponent(uuid)}/${size}`;
}

export function contributorUrl(id: number): string {
  return `/contributors/${id}/`;
}

export function contributorsUrl(modId?: string): string {
  return modId ? `/contributors/?mod=${encodeURIComponent(modId)}` : '/contributors/';
}
