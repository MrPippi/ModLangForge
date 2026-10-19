import { TRANSLATION_STATUSES, type CatalogMod, type StatsPlatform } from '@mlf/core/catalog';

/** /mods 首屏 SSR 的筆數 */
export const INITIAL_COUNT = 24;

/** 摘要狀態：翻譯狀態，或「內建繁中」（jar 已附完整 zh_tw、本站不收錄譯文） */
export const SUMMARY_STATUSES = [...TRANSLATION_STATUSES, 'builtin'] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

/** 下載量與其來源平台 */
export interface ModDownloads {
  readonly count: number;
  readonly platform: StatsPlatform;
}

/** 目錄摘要（首頁、列表頁、API index 共用）；本檔不可匯入 node 模組，供 client island 使用 */
export interface ModSummary {
  readonly modId: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly summary: string;
  readonly mcVersions: readonly string[];
  readonly loaders: readonly CatalogMod['loaders'][number][];
  readonly status: SummaryStatus;
  readonly percent: number;
  readonly total: number;
  /** 已翻譯條數（完整翻譯以條數判斷，不用四捨五入後的百分比） */
  readonly translated: number;
  readonly updatedAt: string;
  /** 本站的模組圖示網址；沒有圖示時為 null */
  readonly icon: string | null;
  /** 本站的模組橫幅網址；沒有橫幅時為 null */
  readonly banner: string | null;
  /** 下載量與其來源平台；沒有下載量資料時為 null */
  readonly downloads: ModDownloads | null;
  /** 是否含 Patchouli 手冊（排序與篩選仍以語言檔為準） */
  readonly hasGuide: boolean;
  /** jar 內建繁中的涵蓋率；沒有記錄時為 null，內建條目為 100 */
  readonly builtinPercent: number | null;
}

export function byUpdatedDesc(a: ModSummary, b: ModSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}
