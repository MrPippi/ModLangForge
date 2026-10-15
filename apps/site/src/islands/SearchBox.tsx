import { useEffect, useMemo, useState } from 'react';
import { PixelIcon } from '../components/PixelIcon';
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

/** 只把狀態摘要送進 live region，避免每次輸入都重唸整份結果清單 */
function liveMessage(state: SearchState): string {
  switch (state.kind) {
    case 'loading': return t.search.searching;
    case 'unavailable': return t.search.unavailableShort;
    case 'done': return t.search.resultCount(state.results.length);
    default: return '';
  }
}

function EmptyResult({ query }: { readonly query: string }) {
  return (
    <div className="card text-center">
      <p className="font-medium">{t.search.empty(query)}</p>
      <p className="mt-1 text-sm text-muted">{t.search.emptyHint}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <a className="btn btn-primary" href="/translate/"><PixelIcon name="upload" />{t.search.uploadCta}</a>
        <a className="btn btn-secondary" href={githubRequestUrl(query)} rel="noopener noreferrer" target="_blank">
          {t.search.requestCta}
          <PixelIcon name="external" size={12} />
          <span className="sr-only">{t.common.newWindow}</span>
        </a>
      </div>
    </div>
  );
}

function ResultList({ results }: { readonly results: readonly SearchResult[] }) {
  return (
    <ul className="card divide-y-2 divide-line p-0 text-left">
      {results.map((r) => (
        <li key={r.url}>
          <a href={r.url} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-surface-2">
            <span className="truncate">{r.title}</span>
            {r.percent !== null && <span className="text-xs text-muted tabular-nums">{formatPercent(r.percent)}</span>}
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
      <div className="relative">
        <PixelIcon name="search" size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          className="input min-h-13 w-full border-line-strong py-3 pr-4 pl-12 text-base"
          aria-label={t.search.label}
          placeholder={t.search.placeholder}
          value={query}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p aria-live="polite" className="sr-only">{liveMessage(state)}</p>
      {state.kind === 'loading' && <p aria-hidden="true" className="text-sm text-muted">{t.search.searching}</p>}
      {state.kind === 'unavailable' && (
        <p className="text-sm text-muted">
          {t.search.unavailable}
          <a className="link" href="/mods/">{t.search.browseAll}</a>
        </p>
      )}
      {state.kind === 'done' && (state.results.length > 0 ? <ResultList results={state.results} /> : <EmptyResult query={state.query} />)}
    </div>
  );
}
