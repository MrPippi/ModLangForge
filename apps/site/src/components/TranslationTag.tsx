import { progressTagText, progressTier, TIER_CLASS } from '../lib/progress';

interface TranslationTagProps {
  readonly translated: number;
  readonly total: number;
  readonly percent: number;
  readonly percentText?: (p: number) => string;
  readonly className?: string;
}

/** 翻譯進度小標籤：完整 / 七成以上 / 未滿七成 */
export function TranslationTag({ translated, total, percent, percentText, className = '' }: TranslationTagProps) {
  const tier = progressTier(translated, total, percent);
  return (
    <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium ${TIER_CLASS[tier]} ${className}`.trim()}>
      {progressTagText(translated, total, percent, percentText)}
    </span>
  );
}
