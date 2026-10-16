import { useEffect, useState, type ReactNode } from 'react';
import type { FetchLike } from '../islands/api';
import type { AdminApi, AdminSuggestion, SuggestionStatus } from './adminApi';
import { groupSuggestions, type KeyGroup } from './group';
import { ownString, useModStrings } from './modStrings';
import { s } from './strings';
import SuggestionCard from './SuggestionCard';

interface Props {
  readonly api: AdminApi;
  readonly fetchImpl: FetchLike;
  readonly isAdmin: boolean;
}

interface Filter {
  readonly status: SuggestionStatus;
  readonly modId: string;
}

const STATUSES = Object.keys(s.status) as SuggestionStatus[];

function KeyBlock({ modId, group, fetchImpl, children }: { readonly modId: string; readonly group: KeyGroup; readonly fetchImpl: FetchLike; readonly children: ReactNode }) {
  const strings = useModStrings(modId, fetchImpl);
  const loaded = strings !== 'loading' && strings !== null ? strings : null;
  return (
    <div className="mb-4">
      <p className="text-xs text-muted"><code>{group.key}</code></p>
      <p><span className="text-xs text-muted">{s.source}：</span><span>{loaded ? ownString(loaded.en, group.key) ?? '—' : '…'}</span></p>
      <p><span className="text-xs text-muted">{s.current}：</span><span>{loaded ? ownString(loaded.zh, group.key) ?? '—' : '…'}</span></p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

function FilterForm({ onApply }: { readonly onApply: (filter: Filter) => void }) {
  const [status, setStatus] = useState<SuggestionStatus>('pending');
  const [modInput, setModInput] = useState('');
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onApply({ status, modId: modInput.trim() }); }}>
      <label className="flex flex-col text-sm">{s.statusFilter}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SuggestionStatus)}>
          {STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-sm">{s.modFilter}
        <input className="input" value={modInput} onChange={(e) => setModInput(e.target.value)} />
      </label>
      <button type="submit" className="btn">{s.apply}</button>
    </form>
  );
}

export default function ReviewQueue({ api, fetchImpl, isAdmin }: Props) {
  const [filter, setFilter] = useState<Filter>({ status: 'pending', modId: '' });
  const [list, setList] = useState<readonly AdminSuggestion[] | 'loading' | 'error'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.listSuggestions(filter.status, filter.modId || undefined).then((result) => {
      if (!alive) return;
      setList(result.ok ? result.data.suggestions : 'error');
      setTruncated(result.ok && result.data.truncated === true);
    });
    return () => { alive = false; };
  }, [api, filter, reloadTick]);

  const onDone = (message: string) => {
    setNotice(message);
    setReloadTick((n) => n + 1);
  };

  return (
    <div>
      <FilterForm onApply={setFilter} />
      {notice && <p role="status" className="mb-2 text-sm">{notice}</p>}
      {truncated && <p className="mb-2 text-sm text-warn">{s.truncated}</p>}
      {list === 'loading' && <p className="text-muted">{s.loading}</p>}
      {list === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof list !== 'string' && list.length === 0 && <p className="text-muted">{s.empty}</p>}
      {typeof list !== 'string' && groupSuggestions(list).map((g) => (
        <section key={g.modId} className="mb-6">
          <h2 className="mb-2 text-lg font-bold">{g.modId}</h2>
          {g.keys.map((k) => (
            <KeyBlock key={k.key} modId={g.modId} group={k} fetchImpl={fetchImpl}>
              {k.items.map((x) => <SuggestionCard key={x.id} item={x} api={api} isAdmin={isAdmin} onDone={onDone} />)}
            </KeyBlock>
          ))}
        </section>
      ))}
    </div>
  );
}
