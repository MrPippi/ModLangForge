import { z } from 'zod';
import { LOADERS } from '@mlf/core/catalog';
import { MOD_BANNER_PATTERN } from '../lib/modBanner';
import { MOD_ICON_PATTERN } from '../lib/modIcon';
import { SUMMARY_STATUSES, type ModSummary } from '../lib/summary';

export const CATALOG_INDEX_URL = '/api/v1/index.json';
/** 請求逾時；逾時以 TimeoutError 拒絕，讓 UI 進入錯誤狀態並提供重試 */
export const CATALOG_TIMEOUT_MS = 15_000;

export const modSummarySchema = z.object({
  modId: z.string().min(1),
  name: z.string().min(1),
  nameZh: z.string().nullable(),
  summary: z.string(),
  mcVersions: z.array(z.string()),
  loaders: z.array(z.enum(LOADERS)),
  status: z.enum(SUMMARY_STATUSES),
  percent: z.number().min(0).max(100),
  total: z.number().int().min(0),
  // 舊版 index 沒有此欄位，視為 0
  translated: z.number().int().min(0).default(0),
  updatedAt: z.string(),
  // 只接受本站路徑，避免 index 被竄改時載入外部圖片
  icon: z.string().regex(MOD_ICON_PATTERN).nullable().default(null),
  banner: z.string().regex(MOD_BANNER_PATTERN).nullable().default(null),
  // 舊版 index 的 downloads 是單純數字（沒有平台資訊），視為沒有記錄
  downloads: z.preprocess(
    (v) => (typeof v === 'number' ? null : v),
    z.object({ count: z.number().int().min(0), platform: z.enum(['modrinth', 'curseforge']) }).nullable().default(null),
  ),
  // 舊版 index 沒有此欄位，視為無手冊
  hasGuide: z.boolean().default(false),
  // 舊版 index 沒有此欄位，視為沒有記錄
  builtinPercent: z.number().int().min(0).max(100).nullable().default(null),
}) satisfies z.ZodType<ModSummary>;

const indexSchema = z.object({
  version: z.literal(1),
  mods: z.array(modSummarySchema),
});

export class CatalogIndexError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogIndexError';
  }
}

/** 抓取並驗證完整目錄；HTTP 非 2xx 或格式不符時丟出 CatalogIndexError，逾時丟出 TimeoutError */
export async function fetchCatalogIndex(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = CATALOG_TIMEOUT_MS,
): Promise<ModSummary[]> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(CATALOG_INDEX_URL, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new CatalogIndexError(`HTTP ${res.status}`);
  const parsed = indexSchema.safeParse(await res.json());
  if (!parsed.success) throw new CatalogIndexError('Invalid catalog index', { cause: parsed.error });
  return parsed.data.mods;
}
