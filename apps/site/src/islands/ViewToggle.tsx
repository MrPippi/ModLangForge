import { t } from '../i18n/zh-TW';
import type { ViewMode } from './useViewMode';

const MODES: readonly ViewMode[] = ['card', 'list'];

/** 卡片／條列切換鈕 */
export function ViewToggle({ mode, onChange }: { readonly mode: ViewMode; readonly onChange: (mode: ViewMode) => void }) {
  return (
    <div role="group" aria-label={t.mods.view.label} className="inline-flex">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={`min-h-11 border-2 border-line-strong px-3 first:rounded-l-sm last:rounded-r-sm last:border-l-0 ${
            mode === m ? 'bg-primary text-on-primary' : 'bg-surface text-fg hover:bg-surface-2'
          }`}
        >
          {t.mods.view[m]}
        </button>
      ))}
    </div>
  );
}
