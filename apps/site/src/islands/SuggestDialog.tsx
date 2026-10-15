import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lookupEntry } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';
import SuggestForm from './SuggestForm';

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

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

/** 開啟時把焦點移入對話框、Escape 關閉、Tab 在框內循環，關閉後焦點還給開啟者 */
function useModal(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return e.preventDefault();
      if (!box.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open, close]);
  return box;
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
      {query.trim() !== '' && hits.length === 0 && <p className="text-sm text-slate-500">{t.suggest.noMatch}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {hits.map((k) => (
          <li key={k}>
            <button type="button" className="w-full p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onPick(k)}>
              <div>{en[k]}</div>
              <div className="text-xs text-slate-500">{zh[k] ?? t.modPage.untranslated}</div>
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
      <button type="button" className="btn mb-2 text-sm" onClick={() => setSearching(true)}>{t.suggest.searchAll}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t.suggest.title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div ref={box} tabIndex={-1} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{t.suggest.title}</h3>
              <button type="button" className="link text-sm" onClick={close}>{t.suggest.close}</button>
            </div>
            {entries === null && <p className="text-sm text-slate-500">{t.suggest.loading}</p>}
            {entries === 'error' && <p role="alert" className="text-red-600">{t.suggest.loadFailed}</p>}
            {entries !== null && entries !== 'error' && key === null && <EntrySearch en={entries.en} zh={entries.zh} onPick={setKey} />}
            {entry && key !== null && (
              <SuggestForm key={key} modId={modId} entryKey={key} source={entry.source} current={entry.current} fetchImpl={fetchImpl} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
