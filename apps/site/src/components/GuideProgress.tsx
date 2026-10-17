import type { ProjectStats } from '@mlf/core/merge';
import { t } from '../i18n/zh-TW';
import { ProgressLine } from './ProgressLine';

/** 模組頁語言檔進度下方的手冊進度 */
export function GuideProgress({ stats }: { readonly stats: ProjectStats }) {
  return (
    <div>
      <ProgressLine
        translated={stats.translated}
        total={stats.total}
        percent={stats.percent}
        percentText={t.common.guidePercent}
        detail={t.modPage.guideDetail(stats.translated, stats.total)}
        label={t.modPage.guideProgress(stats.translated, stats.total)}
      />
      {stats.warnings > 0 && <p className="mt-2 text-xs text-warn">{t.modPage.guideWarnings(stats.warnings)}</p>}
    </div>
  );
}
