import { trackingPlatform, type Platform } from '@mlf/core/pipeline';

interface BuiltinLinks {
  readonly modrinth?: string;
  readonly curseforge?: string;
}

/** 內建繁中頁「下載模組」按鈕的目標；兩個平台都有時以 Modrinth 為準，連結格式不符則不顯示按鈕 */
export function builtinDownloadLink(links: BuiltinLinks): { readonly href: string; readonly platform: Platform } | null {
  const platform = trackingPlatform(links);
  const href = platform ? links[platform] : undefined;
  return platform && href ? { href, platform } : null;
}
