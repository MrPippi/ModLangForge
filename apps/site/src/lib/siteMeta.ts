/** 未設定或格式錯誤時使用的預設 repo */
export const DEFAULT_REPO = 'MrPippi/ModLangForge';

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** 設為 noindex、不應列入 sitemap 的路徑 */
export const NOINDEX_PATHS: readonly string[] = ['/pack/', '/404/', '/admin/', '/me/', '/contributors/profile/'];

/** 驗證 owner/name 格式；缺少或格式錯誤時回傳佔位值 */
export function resolveRepo(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return REPO_PATTERN.test(trimmed) ? trimmed : DEFAULT_REPO;
}

export function robotsTxt(site: URL): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site).href}\n`;
}

/** 供 @astrojs/sitemap 的 filter 使用 */
export function isSitemapPage(pageUrl: string): boolean {
  const path = new URL(pageUrl).pathname;
  const normalized = path.endsWith('/') ? path : `${path}/`;
  return !NOINDEX_PATHS.includes(normalized);
}

/** 建置旗標：只有字串 'true' 代表開啟 */
export function parseFlag(value: string | undefined): boolean {
  return value === 'true';
}

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

function isLocalSite(siteUrl: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

/** 建議功能開啟且部署到非本機網址時，必須設定 Turnstile site key；否則回傳錯誤訊息 */
export function turnstileConfigError(env: {
  readonly PUBLIC_SUGGEST_ENABLED?: string;
  readonly SITE_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}): string | null {
  if (!parseFlag(env.PUBLIC_SUGGEST_ENABLED)) return null;
  if (!env.SITE_URL || isLocalSite(env.SITE_URL)) return null;
  if (env.PUBLIC_TURNSTILE_SITE_KEY) return null;
  return 'PUBLIC_SUGGEST_ENABLED=true 且 SITE_URL 為正式網址時，必須設定 PUBLIC_TURNSTILE_SITE_KEY（Turnstile site key）。 / PUBLIC_TURNSTILE_SITE_KEY is required when suggestions are enabled for a non-local SITE_URL.';
}
