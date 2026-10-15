import { t } from '../i18n/zh-TW';
import type { SearchScope, StatusFilter } from './filterEntries';
import type { FilterState } from './filterState';

const STATUS_OPTIONS: readonly StatusFilter[] = ['all', 'untranslated', 'translated', 'warning', 'new'];
const STATUS_TEXT: Readonly<Record<StatusFilter, string>> = {
  all: t.status.all,
  untranslated: t.status.untranslated,
  translated: t.status.translated,
  warning: t.status.warning,
  new: t.status.new,
};

interface FilterBarProps {
  readonly value: FilterState;
  readonly count: number;
  readonly onChange: (next: FilterState) => void;
}

export function FilterBar({ value, count, onChange }: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 text-sm dark:border-slate-700">
      <input
        type="search"
        className="input min-w-48 flex-1"
        placeholder={t.filter.search}
        value={value.query}
        onChange={(e) => set('query', e.target.value)}
      />
      <label className="flex items-center gap-1">
        <span className="text-slate-500">{t.filter.statusLabel}</span>
        <select className="input" value={value.status} onChange={(e) => set('status', e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-slate-500">{t.filter.scopeLabel}</span>
        <select className="input" value={value.scope} onChange={(e) => set('scope', e.target.value as SearchScope)}>
          <option value="current">{t.filter.scopeCurrent}</option>
          <option value="all">{t.filter.scopeAll}</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={value.showReference} onChange={(e) => set('showReference', e.target.checked)} />
        {t.table.showReference}
      </label>
      <span className="ml-auto text-slate-500">{t.filter.count(count)}</span>
    </div>
  );
}
