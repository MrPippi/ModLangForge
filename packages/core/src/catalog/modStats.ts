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

export interface DownloadDrop {
  readonly modId: string;
  readonly before: number;
  readonly after: number;
}

/**
 * 同一平台上下載量比上次少的模組，依下降比例由大到小。
 * 下載量通常只增不減，下降代表平台扣除了下載（例如清除機器人流量）或回傳了不同的欄位，需要人工確認。
 */
export function findDownloadDrops(
  prev: ModStats,
  fetched: Readonly<Record<string, { readonly downloads: number; readonly platform: StatsPlatform }>>,
): DownloadDrop[] {
  const ratio = (d: DownloadDrop): number => (d.before - d.after) / d.before;
  return Object.entries(fetched)
    .flatMap(([modId, { downloads, platform }]) => {
      const old = prev.mods[modId];
      return old && old.platform === platform && downloads < old.downloads ? [{ modId, before: old.downloads, after: downloads }] : [];
    })
    .sort((a, b) => ratio(b) - ratio(a));
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

const DROP_LIST_LIMIT = 10;
const formatCount = (n: number): string => n.toLocaleString('en-US');

/** 下載量下降的 PR 摘要段落（Markdown）；沒有下降時回傳空字串 */
export function renderDownloadDrops(drops: readonly DownloadDrop[], limit = DROP_LIST_LIMIT): string {
  if (drops.length === 0) return '';
  const lines = drops.slice(0, limit).map(({ modId, before, after }) => {
    const percent = (((after - before) / before) * 100).toFixed(1);
    return `- ${modId}：${formatCount(before)} → ${formatCount(after)}（${percent}%）`;
  });
  const rest = drops.length - lines.length;
  return [
    '## 下載量下降',
    '',
    `${drops.length} 個模組的下載量比上次少。平台可能扣除了下載數，或 API 回傳的數字有誤，請確認後再合併。`,
    '',
    ...lines,
    ...(rest > 0 ? [`- 其餘 ${rest} 個`] : []),
    '',
  ].join('\n');
}
