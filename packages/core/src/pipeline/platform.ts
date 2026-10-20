import { curseforgeSlug } from '../modpack/resolve';
import type { Platform } from './build';
import { modrinthSlug } from './modrinth';

export const NO_LINK_REASON = 'mod.json 沒有 Modrinth 或 CurseForge 連結';
export const NO_KEY_REASON = '沒有 CurseForge 金鑰';

interface PlatformLinks {
  readonly modrinth?: string;
  readonly curseforge?: string;
}

/** 追蹤版本所依據的平台；兩個平台都有連結時一律以 Modrinth 為準，連結格式不符視為沒有 */
export function trackingPlatform(links: PlatformLinks): Platform | null {
  if (modrinthSlug(links.modrinth)) return 'modrinth';
  if (curseforgeSlug(links.curseforge)) return 'curseforge';
  return null;
}

/** 決定從哪個平台取版本；CurseForge 專有模組沒有金鑰時略過（不算錯誤） */
export function buildSourceFor(links: PlatformLinks, apiKey: string | undefined): { readonly platform: Platform } | { readonly skip: string } {
  const platform = trackingPlatform(links);
  if (!platform) return { skip: NO_LINK_REASON };
  if (platform === 'curseforge' && !apiKey) return { skip: NO_KEY_REASON };
  return { platform };
}
