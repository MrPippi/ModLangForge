import type { ProjectStats } from '@mlf/core/merge';
import { t } from '../i18n/zh-TW';
import { ProgressBar } from './ProgressBar';

/** 模組頁語言檔進度下方的手冊進度 */
export function GuideProgress({ stats }: { readonly stats: ProjectStats }) {
  const label = t.modPage.guideProgress(stats.translated, stats.total);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <ProgressBar percent={stats.percent} label={label} />
      {stats.warnings > 0 && <p className="mt-2 text-xs text-warn">{t.modPage.guideWarnings(stats.warnings)}</p>}
    </div>
  );
}
