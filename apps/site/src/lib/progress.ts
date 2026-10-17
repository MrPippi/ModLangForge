import { t } from '../i18n/zh-TW';

export type ProgressTier = 'complete' | 'most' | 'low';

const MOST_THRESHOLD = 70;
const MAX_INCOMPLETE_PERCENT = 99;

/** 完整翻譯看實際條數，不看四捨五入後的百分比 */
export function progressTier(translated: number, total: number, percent: number): ProgressTier {
  if (total > 0 && translated >= total) return 'complete';
  return percent >= MOST_THRESHOLD ? 'most' : 'low';
}

/** 未完整時百分比最多顯示 99% */
export function cappedPercent(percent: number): number {
  return Math.min(MAX_INCOMPLETE_PERCENT, percent);
}

export function progressTagText(
  translated: number,
  total: number,
  percent: number,
  percentText: (p: number) => string = t.common.translatedPercent,
): string {
  return progressTier(translated, total, percent) === 'complete' ? t.common.complete : percentText(cappedPercent(percent));
}

export const TIER_BAR: Readonly<Record<ProgressTier, string>> = {
  complete: 'bg-primary',
  most: 'bg-info',
  low: 'bg-warn',
};

export const TIER_CLASS: Readonly<Record<ProgressTier, string>> = {
  complete: 'bg-primary-soft text-link',
  most: 'bg-info-soft text-info',
  low: 'bg-warn-soft text-warn',
};
