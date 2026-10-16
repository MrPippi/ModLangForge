/** 模組圖示網址的格式；本檔不可匯入 node 模組，供 client island 使用 */
export const MOD_ICON_PATTERN = /^\/mod-icons\/[a-z0-9_.-]+\.webp$/;

/** 有圖示才回傳本站網址（圖示由 npm run icons:fetch 下載到 public/mod-icons） */
export function modIconUrl(modId: string, available: ReadonlySet<string>): string | null {
  return available.has(modId) ? `/mod-icons/${modId}.webp` : null;
}
