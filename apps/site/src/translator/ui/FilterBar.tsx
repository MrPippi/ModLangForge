import type { EntrySection } from '@mlf/core';
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
  /** 有模組含手冊時才顯示「語言檔／手冊」切換 */
  readonly showSection: boolean;
  readonly onChange: (next: FilterState) => void;
}

export function FilterBar({ value, count, showSection, onChange }: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, v: FilterState[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-wrap items-center gap-3 border-b-2 border-line p-3 text-sm">
      <input
        type="search"
        className="input min-w-48 flex-1"
        aria-label={t.filter.search}
        placeholder={t.filter.search}
        value={value.query}
        onChange={(e) => set('query', e.target.value)}
      />
      {showSection && (
        <label className="flex items-center gap-1">
          <span className="text-muted">{t.filter.sectionLabel}</span>
          <select className="input" aria-label={t.filter.sectionLabel} value={value.section} onChange={(e) => set('section', e.target.value as EntrySection)}>
            <option value="lang">{t.filter.sectionLang}</option>
            <option value="guide">{t.filter.sectionGuide}</option>
          </select>
        </label>
      )}
      <label className="flex items-center gap-1">
        <span className="text-muted">{t.filter.statusLabel}</span>
        <select className="input" value={value.status} onChange={(e) => set('status', e.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted">{t.filter.scopeLabel}</span>
        <select className="input" value={value.scope} onChange={(e) => set('scope', e.target.value as SearchScope)}>
          <option value="current">{t.filter.scopeCurrent}</option>
          <option value="all">{t.filter.scopeAll}</option>
        </select>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-primary" checked={value.showReference} onChange={(e) => set('showReference', e.target.checked)} />
        {t.table.showReference}
      </label>
      <span className="ml-auto text-muted">{t.filter.count(count)}</span>
    </div>
  );
}
