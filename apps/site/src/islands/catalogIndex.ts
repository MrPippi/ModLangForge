import { z } from 'zod';
import { LOADERS, TRANSLATION_STATUSES } from '@mlf/core/catalog';
import type { ModSummary } from '../lib/summary';

export const CATALOG_INDEX_URL = '/api/v1/index.json';

export const modSummarySchema = z.object({
  modId: z.string().min(1),
  name: z.string().min(1),
  nameZh: z.string().nullable(),
  summary: z.string(),
  mcVersions: z.array(z.string()),
  loaders: z.array(z.enum(LOADERS)),
  status: z.enum(TRANSLATION_STATUSES),
  percent: z.number().min(0).max(100),
  total: z.number().int().min(0),
  updatedAt: z.string(),
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

/** 抓取並驗證完整目錄；HTTP 非 2xx 或格式不符時丟出 CatalogIndexError */
export async function fetchCatalogIndex(signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ModSummary[]> {
  const res = await fetchImpl(CATALOG_INDEX_URL, { signal });
  if (!res.ok) throw new CatalogIndexError(`HTTP ${res.status}`);
  const parsed = indexSchema.safeParse(await res.json());
  if (!parsed.success) throw new CatalogIndexError('Invalid catalog index', { cause: parsed.error });
  return parsed.data.mods;
}
