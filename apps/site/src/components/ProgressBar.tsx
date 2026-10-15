import { t } from '../i18n/zh-TW';
import { formatPercent } from '../lib/format';

interface ProgressBarProps {
  readonly percent: number;
  readonly label?: string;
}

/** 以 10% 為一格的像素分格進度條 */
export function ProgressBar({ percent, label = t.common.progressLabel }: ProgressBarProps) {
  const text = formatPercent(percent);
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <div
        className="h-3 flex-1 overflow-hidden rounded-sm border-2 border-line-strong bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div
          className="h-full bg-primary"
          style={{
            width: text,
            backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), var(--color-surface-2) calc(10% - 2px) 10%)',
            backgroundSize: `${percent > 0 ? (100 / percent) * 100 : 100}% 100%`,
          }}
        />
      </div>
      <span className="w-10 text-right font-medium tabular-nums">{text}</span>
    </div>
  );
}
