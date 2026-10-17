import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { formatCheckFor } from '@mlf/core/ftbquests';
import { checkGuideFormat } from '@mlf/core/patchouli';
import { checkFormat } from '@mlf/core/validate';
import { useWorkspace } from '../store/workspaceStore';
import { t } from '../i18n/zh-TW';
import { filterEntries } from './filterEntries';
import { FilterBar } from './FilterBar';
import { type FilterState, initialFilter } from './filterState';
import { TranslationTable } from './TranslationTable';
import { useGlossary } from '../glossary/useGlossary';

export function Editor() {
  const mods = useWorkspace((s) => s.mods);
  const activeModId = useWorkspace((s) => s.activeModId);
  const editEntry = useWorkspace((s) => s.editEntry);
  const [filter, setFilter] = useState<FilterState>(initialFilter);
  const query = useDeferredValue(filter.query);
  const termsFor = useGlossary();
  // 只看目前搜尋範圍內的模組；有效（非 obsolete）手冊條目才算有手冊，重新上傳不含手冊的 jar 後可能只剩 obsolete 條目
  const showSection = useMemo(
    () => mods
      .filter((m) => filter.scope === 'all' || m.id === activeModId)
      .some((m) => m.guide?.entries.some((e) => e.status !== 'obsolete') === true),
    [mods, filter.scope, activeModId],
  );
  const section = showSection ? filter.section : 'lang';

  const hits = useMemo(
    () => filterEntries(mods, { scope: filter.scope, activeModId, query, status: filter.status, section }),
    [mods, filter.scope, filter.status, activeModId, query, section],
  );

  const editGuide = useCallback(
    (modId: string, key: string, target: string) => editEntry(modId, key, target, 'guide'),
    [editEntry],
  );

  if (filter.scope === 'current' && activeModId === null) {
    return <p className="p-10 text-center text-muted">{t.app.selectMod}</p>;
  }

  const isGuide = section === 'guide';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar value={filter} count={hits.length} showSection={showSection} onChange={setFilter} />
      <TranslationTable
        hits={hits}
        showModId={filter.scope === 'all'}
        showReference={filter.showReference}
        onCommit={isGuide ? editGuide : editEntry}
        check={isGuide ? checkGuideFormat : checkFormat}
        checkFor={isGuide ? undefined : formatCheckFor}
        termsFor={termsFor}
      />
    </div>
  );
}
