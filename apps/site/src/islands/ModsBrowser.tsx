import { useMemo, useRef, useState } from 'react';
import { LOADERS, TRANSLATION_STATUSES } from '@mlf/core/catalog';
import { t } from '../i18n/zh-TW';
import type { ModSummary } from '../lib/summary';
import { ModCard } from '../components/ModCard';
import { LOADER_LABELS, STATUS_LABELS } from '../lib/format';
import { ALL, filterMods, SORT_KEYS, type SortKey, sortMods } from './filterMods';
import { sortVersions } from './pickVersion';
import { useCatalogIndex } from './useCatalogIndex';
import { useHydrated } from './useHydrated';
import { useIncrementalList } from './useIncrementalList';

interface Option {
  readonly value: string;
  readonly label: string;
}

function SelectField(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly Option[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-36 flex-1 flex-col gap-1 sm:flex-none">
      <span className="font-medium text-muted">{props.label}</span>
      <select className="input" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const withAll = (options: readonly Option[]): Option[] => [{ value: ALL, label: t.mods.all }, ...options];
const LOADER_OPTIONS = withAll(LOADERS.map((l) => ({ value: l, label: LOADER_LABELS[l] })));
const STATUS_OPTIONS = withAll(TRANSLATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })));
const SORT_OPTIONS: Option[] = SORT_KEYS.map((k) => ({ value: k, label: t.mods.sortLabels[k] }));

function LoadState({ kind, onRetry }: { readonly kind: 'loading' | 'error'; readonly onRetry: () => void }) {
  if (kind === 'loading') return <span className="flex min-h-11 items-center text-muted">{t.mods.loading}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 text-danger">
      {t.mods.loadFailed}
      <button type="button" className="link inline-flex min-h-11 items-center" onClick={onRetry}>{t.mods.retry}</button>
      <a href="/" className="link inline-flex min-h-11 items-center">{t.mods.useSearch}</a>
    </span>
  );
}

export default function ModsBrowser({ initial, total }: { readonly initial: readonly ModSummary[]; readonly total: number }) {
  const { state, retry } = useCatalogIndex();
  const hydrated = useHydrated();
  const statusRef = useRef<HTMLSpanElement>(null);
  const [loader, setLoader] = useState(ALL);
  const [version, setVersion] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('name');
  const ready = state.kind === 'ready';
  const all = ready ? state.mods : initial;
  const versionOptions = useMemo(() => withAll(sortVersions(all.flatMap((m) => m.mcVersions)).map((v) => ({ value: v, label: v }))), [all]);
  const shown = useMemo(
    () => (ready ? sortMods(filterMods(all, { loader, version, status }), sort) : all),
    [ready, all, loader, version, status, sort],
  );
  const { visible, hasMore, sentinelRef } = useIncrementalList(shown, `${loader}|${version}|${status}|${sort}|${state.kind}`);
  // 重試時按鈕會被移除，先把焦點移到持久存在的狀態區，避免掉到 <body>
  const handleRetry = () => {
    statusRef.current?.focus();
    retry();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-sm border-2 border-line bg-surface p-4 text-sm">
        {hydrated && (
          <>
            <SelectField label={t.mods.filterLoader} value={loader} options={LOADER_OPTIONS} disabled={!ready} onChange={setLoader} />
            <SelectField label={t.mods.filterVersion} value={version} options={versionOptions} disabled={!ready} onChange={setVersion} />
            <SelectField label={t.mods.filterStatus} value={status} options={STATUS_OPTIONS} disabled={!ready} onChange={setStatus} />
            <SelectField label={t.mods.sort} value={sort} options={SORT_OPTIONS} disabled={!ready} onChange={(v) => setSort(v as SortKey)} />
            <span ref={statusRef} tabIndex={-1} aria-live="polite" className="outline-none">
              {state.kind !== 'ready' && <LoadState kind={state.kind} onRetry={handleRetry} />}
            </span>
          </>
        )}
        <span aria-live="polite" className="ml-auto flex min-h-11 items-center font-medium text-muted">{t.mods.count(ready ? shown.length : total)}</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-16 text-center text-muted">{t.mods.none}</p>
      ) : (
        <ul aria-label={t.mods.listLabel} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => <li key={m.modId}><ModCard mod={m} /></li>)}
        </ul>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </div>
  );
}
