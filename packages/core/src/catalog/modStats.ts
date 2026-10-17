import { z } from 'zod';

/** Modrinth 下載量資料檔（data/modrinth-stats.json） */
export const modStatsSchema = z.object({
  version: z.literal(1),
  mods: z.record(
    z.string(),
    z.object({
      downloads: z.number().int().min(0),
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
 * 合併新抓到的下載量；抓取失敗的模組保留舊值，
 * 但已移除或不再有 Modrinth 連結的模組（不在 linkedModIds）會丟掉舊值。
 * 回傳新物件（模組鍵排序，讓檔案 diff 穩定）
 */
export function mergeModStats(
  prev: ModStats,
  fetched: Readonly<Record<string, number>>,
  linkedModIds: ReadonlySet<string>,
  today: string,
): ModStats {
  const merged: Record<string, ModStats['mods'][string]> = Object.fromEntries(
    Object.entries(prev.mods).filter(([id]) => linkedModIds.has(id)),
  );
  for (const [id, downloads] of Object.entries(fetched)) {
    if (linkedModIds.has(id)) merged[id] = { downloads, fetchedAt: today };
  }
  const mods = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { version: 1, mods };
}
