/** 未設定 PUBLIC_REPO 時使用的佔位 repo */
export const PLACEHOLDER_REPO = 'OWNER/ModLangForge';

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** 設為 noindex、不應列入 sitemap 的路徑 */
export const NOINDEX_PATHS: readonly string[] = ['/pack/', '/404/'];

/** 驗證 owner/name 格式；缺少或格式錯誤時回傳佔位值 */
export function resolveRepo(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return REPO_PATTERN.test(trimmed) ? trimmed : PLACEHOLDER_REPO;
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
