import type { CatalogModpack } from '@mlf/core/modpack';

/** 整合包裡已收錄的模組（整合包頁顯示用） */
export interface IncludedMod {
  readonly modId: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly percent: number;
  /** 模組 jar 已內建完整繁中（不需下載翻譯） */
  readonly builtin: boolean;
}

/** FTB 任務摘要：supported 有進度；unsupported-version（MC 1.21 以下）只標示版本不支援 */
export type QuestSummary =
  | { readonly status: 'supported'; readonly total: number; readonly translated: number; readonly percent: number }
  | { readonly status: 'unsupported-version' };

/** 整合包摘要（目錄頁、API index、翻譯工具共用）；本檔不可匯入 node 模組，供 client island 使用 */
export interface ModpackSummary {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly summary: string;
  readonly mcVersion: string;
  readonly loader: CatalogModpack['source']['loader'];
  readonly status: CatalogModpack['translation']['status'];
  /** 對上已收錄模組的條目數（N） */
  readonly includedMods: number;
  /** 整合包使用的模組數（M） */
  readonly totalMods: number;
  /** KubeJS 文字進度（各命名空間合計）；沒有 KubeJS 文字時為 null */
  readonly kubejs: { readonly total: number; readonly translated: number; readonly percent: number } | null;
  /** FTB 任務；整合包沒有任務檔時為 null */
  readonly ftbquests: QuestSummary | null;
  readonly updatedAt: string;
}

/** 沿用 lib/format 的 displayName（client 可用）；所有使用端維持 modpackDisplayName 這個名字 */
export { displayName as modpackDisplayName } from './format';
