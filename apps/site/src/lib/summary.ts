import type { CatalogMod } from '@mlf/core/catalog';

/** /mods 首屏 SSR 的筆數 */
export const INITIAL_COUNT = 24;

/** 目錄摘要（首頁、列表頁、API index 共用）；本檔不可匯入 node 模組，供 client island 使用 */
export interface ModSummary {
  readonly modId: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly summary: string;
  readonly mcVersions: readonly string[];
  readonly loaders: readonly CatalogMod['loaders'][number][];
  readonly status: CatalogMod['translation']['status'];
  readonly percent: number;
  readonly total: number;
  readonly updatedAt: string;
}

export function byUpdatedDesc(a: ModSummary, b: ModSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}
