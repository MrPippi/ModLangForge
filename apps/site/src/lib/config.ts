import { resolveRepo } from './siteMeta';

/** GitHub repo（owner/name），由建置時的環境變數 PUBLIC_REPO 設定 */
export const REPO = resolveRepo(import.meta.env.PUBLIC_REPO);
export const DEFAULT_BRANCH = 'main';
export const SITE_NAME = 'ModLangForge 繁中模組翻譯站';
export const SITE_SHORT_NAME = 'ModLangForge';

export function githubEditUrl(modId: string): string {
  return `https://github.com/${REPO}/edit/${DEFAULT_BRANCH}/data/mods/${encodeURIComponent(modId)}/zh_tw.json`;
}

export function githubIssueUrl(modId: string): string {
  const title = encodeURIComponent(`[譯文問題] ${modId}`);
  return `https://github.com/${REPO}/issues/new?title=${title}&labels=translation`;
}

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
