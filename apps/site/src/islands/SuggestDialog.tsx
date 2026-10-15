import { useCallback, useEffect, useMemo, useState } from 'react';
import { lookupEntry } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';
import SuggestForm from './SuggestForm';
import { useModal } from './useModal';

type Strings = Readonly<Record<string, string>>;
type Entries = { readonly en: Strings; readonly zh: Strings } | 'error' | null;

interface Props {
  readonly modId: string;
  readonly fetchImpl?: typeof fetch;
}

const SEARCH_LIMIT = 50;

function useModEntries(modId: string, enabled: boolean, fetchImpl: typeof fetch): Entries {
  const [state, setState] = useState<Entries>(null);
  useEffect(() => {
    if (!enabled || state !== null) return;
    fetchImpl(`/api/v1/mods/${encodeURIComponent(modId)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ en_us?: Strings; zh_tw?: Strings }>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => setState({ en: b.en_us ?? {}, zh: b.zh_tw ?? {} }), () => setState('error'));
  }, [enabled, state, modId, fetchImpl]);
  return state;
}

function useRowButtons(onPick: (key: string) => void): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-suggest-key]');
      if (btn?.dataset.suggestKey) onPick(btn.dataset.suggestKey);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [onPick]);
}

function EntrySearch({ en, zh, onPick }: { readonly en: Strings; readonly zh: Strings; readonly onPick: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return Object.keys(en)
      .filter((k) => [k, en[k] ?? '', zh[k] ?? ''].some((s) => s.toLowerCase().includes(q)))
      .slice(0, SEARCH_LIMIT);
  }, [query, en, zh]);
  return (
    <div className="flex flex-col gap-2">
      <input autoFocus className="input" aria-label={t.suggest.searchLabel} placeholder={t.suggest.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query.trim() !== '' && hits.length === 0 && <p className="text-sm text-muted">{t.suggest.noMatch}</p>}
      <ul className="divide-y divide-line">
        {hits.map((k) => (
          <li key={k}>
            <button type="button" className="min-h-11 w-full cursor-pointer p-2 text-left hover:bg-surface-2" onClick={() => onPick(k)}>
              <div>{en[k]}</div>
              <div className="text-xs text-muted">{zh[k] ?? t.modPage.untranslated}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SuggestDialog({ modId, fetchImpl = fetch }: Props) {
  const [key, setKey] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const entries = useModEntries(modId, key !== null || searching, fetchImpl);
  useRowButtons(setKey);
  const open = key !== null || searching;
  const close = useCallback(() => { setKey(null); setSearching(false); }, []);
  const box = useModal(open, close);
  const entry = key !== null && entries !== null && entries !== 'error' ? lookupEntry(entries.en, entries.zh, key) : null;

  return (
    <>
      <button type="button" className="btn btn-secondary mb-2" onClick={() => setSearching(true)}>{t.suggest.searchAll}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t.suggest.title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div ref={box} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{t.suggest.title}</h3>
              <button type="button" className="link inline-flex min-h-11 items-center text-sm" onClick={close}>{t.suggest.close}</button>
            </div>
            {entries === null && <p className="text-sm text-muted">{t.suggest.loading}</p>}
            {entries === 'error' && <p role="alert" className="text-danger">{t.suggest.loadFailed}</p>}
            {entries !== null && entries !== 'error' && key === null && <EntrySearch en={entries.en} zh={entries.zh} onPick={setKey} />}
            {entries !== null && entries !== 'error' && key !== null && !entry && <p className="text-sm text-muted">{t.suggest.noMatch}</p>}
            {entry && key !== null && (
              <SuggestForm key={key} modId={modId} entryKey={key} source={entry.source} current={entry.current} fetchImpl={fetchImpl} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
