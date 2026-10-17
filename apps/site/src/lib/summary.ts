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
  /** 已翻譯條數（完整翻譯以條數判斷，不用四捨五入後的百分比） */
  readonly translated: number;
  readonly updatedAt: string;
  /** 本站的模組圖示網址；沒有圖示時為 null */
  readonly icon: string | null;
  /** 本站的模組橫幅網址；沒有橫幅時為 null */
  readonly banner: string | null;
  /** Modrinth 下載量；沒有 Modrinth 資料時為 null */
  readonly downloads: number | null;
  /** 是否含 Patchouli 手冊（排序與篩選仍以語言檔為準） */
  readonly hasGuide: boolean;
}

export function byUpdatedDesc(a: ModSummary, b: ModSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}
