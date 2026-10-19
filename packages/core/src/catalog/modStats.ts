import { z } from 'zod';

/** 下載量來源平台（與 pipeline 的 Platform 相同；這裡自訂以免 catalog 與 pipeline 互相引用） */
const statsPlatformSchema = z.enum(['modrinth', 'curseforge']);
export type StatsPlatform = z.infer<typeof statsPlatformSchema>;

/** 下載量資料檔（data/mod-stats.json） */
export const modStatsSchema = z.object({
  version: z.literal(2),
  mods: z.record(
    z.string(),
    z.object({
      downloads: z.number().int().min(0),
      platform: statsPlatformSchema,
      fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式須為 YYYY-MM-DD' }),
    }),
  ),
});

export type ModStats = z.infer<typeof modStatsSchema>;

/** 檢查資料檔格式，且每個 modId 都必須是已收錄的模組；回傳錯誤訊息，空陣列代表通過 */
export function checkModStats(raw: unknown, knownModIds: ReadonlySet<string>): readonly string[] {
  const parsed = modStatsSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  }
  return Object.keys(parsed.data.mods)
    .filter((id) => !knownModIds.has(id))
    .map((id) => `${id}: 不是已收錄的模組`);
}

/**
 * 合併新抓到的下載量；抓取失敗（或沒有金鑰而未抓）的模組保留舊值，
 * 但已移除或不再有追蹤平台的模組（不在 linkedModIds）會丟掉舊值。
 * 回傳新物件（模組鍵排序，讓檔案 diff 穩定）
 */
export function mergeModStats(
  prev: ModStats,
  fetched: Readonly<Record<string, { readonly downloads: number; readonly platform: StatsPlatform }>>,
  linkedModIds: ReadonlySet<string>,
  today: string,
): ModStats {
  const merged: Record<string, ModStats['mods'][string]> = Object.fromEntries(
    Object.entries(prev.mods).filter(([id]) => linkedModIds.has(id)),
  );
  for (const [id, { downloads, platform }] of Object.entries(fetched)) {
    if (linkedModIds.has(id)) merged[id] = { downloads, platform, fetchedAt: today };
  }
  const mods = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { version: 2, mods };
}
