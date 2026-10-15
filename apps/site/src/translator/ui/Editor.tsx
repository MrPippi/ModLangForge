import { useDeferredValue, useMemo, useState } from 'react';
import { useWorkspace } from '../store/workspaceStore';
import { t } from '../i18n/zh-TW';
import { filterEntries } from './filterEntries';
import { FilterBar } from './FilterBar';
import { type FilterState, initialFilter } from './filterState';
import { TranslationTable } from './TranslationTable';

export function Editor() {
  const mods = useWorkspace((s) => s.mods);
  const activeModId = useWorkspace((s) => s.activeModId);
  const editEntry = useWorkspace((s) => s.editEntry);
  const [filter, setFilter] = useState<FilterState>(initialFilter);
  const query = useDeferredValue(filter.query);

  const hits = useMemo(
    () => filterEntries(mods, { scope: filter.scope, activeModId, query, status: filter.status }),
    [mods, filter.scope, filter.status, activeModId, query],
  );

  if (filter.scope === 'current' && activeModId === null) {
    return <p className="p-10 text-center text-muted">{t.app.selectMod}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar value={filter} count={hits.length} onChange={setFilter} />
      <TranslationTable hits={hits} showModId={filter.scope === 'all'} showReference={filter.showReference} onCommit={editEntry} />
    </div>
  );
}
