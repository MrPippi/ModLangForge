import { CURSEFORGE_IMAGE_PREFIX, type CurseforgeProject } from './project';

const isAllowed = (url: string): boolean => url.startsWith(CURSEFORGE_IMAGE_PREFIX);

/** 圖示來源：專案 logo（已優先取 url、其次 thumbnailUrl）；沒有 logo 或網址不在 CurseForge 圖片 CDN 時為 null */
export function curseforgeIconSource(project: CurseforgeProject): string | null {
  return project.logoUrl !== null && isAllowed(project.logoUrl) ? project.logoUrl : null;
}

/** 橫幅來源：依原順序保留 CurseForge 圖片 CDN 的截圖，只取第一張 */
export function curseforgeBannerSources(project: CurseforgeProject): readonly string[] {
  return project.screenshotUrls.filter(isAllowed).slice(0, 1);
}
