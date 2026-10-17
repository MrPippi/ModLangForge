import { progressTier, TIER_BAR } from '../lib/progress';
import { TranslationTag } from './TranslationTag';

interface ProgressLineProps {
  readonly translated: number;
  readonly total: number;
  readonly percent: number;
  /** 標籤後的細節文字，例如「已翻譯 3 / 4 條」 */
  readonly detail: string;
  /** 進度條的無障礙名稱 */
  readonly label: string;
  readonly percentText?: (p: number) => string;
}

/** 一行文字（標籤 · 細節）加 3px 細進度線 */
export function ProgressLine({ translated, total, percent, detail, label, percentText }: ProgressLineProps) {
  const tier = progressTier(translated, total, percent);
  const width = `${Math.max(0, Math.min(100, percent))}%`;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
        <TranslationTag translated={translated} total={total} percent={percent} percentText={percentText} />
        <span>· {detail}</span>
      </p>
      <div
        className="h-[3px] overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className={`h-full ${TIER_BAR[tier]}`} style={{ width }} />
      </div>
    </div>
  );
}
