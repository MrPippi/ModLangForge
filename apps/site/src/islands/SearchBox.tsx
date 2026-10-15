import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { githubRequestUrl } from '../lib/config';
import { formatPercent } from '../lib/format';
import { createSearchClient, type SearchClient, type SearchResult, SearchUnavailableError } from './searchClient';

const DEBOUNCE_MS = 200;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; query: string; results: readonly SearchResult[] }
  | { kind: 'unavailable' };

function EmptyResult({ query }: { readonly query: string }) {
  return (
    <div className="card text-center">
      <p className="font-medium">{t.search.empty(query)}</p>
      <p className="mt-1 text-sm text-slate-500">{t.search.emptyHint}</p>
      <div className="mt-3 flex justify-center gap-3">
        <a className="btn btn-primary" href="/translate/">{t.search.uploadCta}</a>
        <a className="btn btn-secondary" href={githubRequestUrl(query)} rel="noopener noreferrer" target="_blank">
          {t.search.requestCta}
        </a>
      </div>
    </div>
  );
}

function ResultList({ results }: { readonly results: readonly SearchResult[] }) {
  return (
    <ul className="card divide-y divide-slate-200 p-0 text-left dark:divide-slate-700">
      {results.map((r) => (
        <li key={r.url}>
          <a href={r.url} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
            <span className="truncate">{r.title}</span>
            {r.percent !== null && <span className="text-xs text-slate-500">{formatPercent(r.percent)}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function SearchBox({ client }: { readonly client?: SearchClient }) {
  const search = useMemo(() => client ?? createSearchClient(), [client]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  const onChange = (value: string) => {
    setQuery(value);
    setState(value.trim() === '' ? { kind: 'idle' } : { kind: 'loading' });
  };

  useEffect(() => {
    const q = query.trim();
    if (q === '') return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      search.search(q).then(
        (results) => !cancelled && setState({ kind: 'done', query: q, results }),
        (err: unknown) => {
          if (cancelled) return;
          if (import.meta.env.DEV && !(err instanceof SearchUnavailableError)) console.error('search failed', err);
          setState({ kind: 'unavailable' });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        className="input w-full px-4 py-3 text-base"
        aria-label={t.search.label}
        placeholder={t.search.placeholder}
        value={query}
        onChange={(e) => onChange(e.target.value)}
      />
      <div aria-live="polite">
        {state.kind === 'loading' && <p className="text-sm text-slate-500">{t.search.searching}</p>}
        {state.kind === 'unavailable' && (
          <p className="text-sm text-slate-500">
            {t.search.unavailable}
            <a className="link" href="/mods/">{t.search.browseAll}</a>
          </p>
        )}
        {state.kind === 'done' && (state.results.length > 0 ? <ResultList results={state.results} /> : <EmptyResult query={state.query} />)}
      </div>
    </div>
  );
}
