/** 模組橫幅網址的格式；本檔不可匯入 node 模組，供 client island 使用 */
export const MOD_BANNER_PATTERN = /^\/mod-banners\/[a-z0-9_.-]+\.webp$/;

/** 有橫幅才回傳本站網址（橫幅由工具下載到 public/mod-banners） */
export function modBannerUrl(modId: string, available: ReadonlySet<string>): string | null {
  return available.has(modId) ? `/mod-banners/${modId}.webp` : null;
}
