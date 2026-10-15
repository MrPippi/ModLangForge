import { useMemo, useState } from 'react';
import { LOADERS, TRANSLATION_STATUSES } from '@mlf/core/catalog';
import { t } from '../i18n/zh-TW';
import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { formatPercent, LOADER_LABELS, STATUS_LABELS } from '../lib/format';
import { ALL, filterMods, SORT_KEYS, type SortKey, sortMods } from './filterMods';
import { sortVersions } from './pickVersion';
import { useCatalogIndex } from './useCatalogIndex';
import { useIncrementalList } from './useIncrementalList';

function ModRow({ mod }: { readonly mod: ModSummary }) {
  return (
    <li>
      <a href={modUrl(mod.modId)} className="card flex flex-col gap-1 hover:shadow-md">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{mod.name}</span>
          <span className="text-xs text-slate-500">{STATUS_LABELS[mod.status]}</span>
        </div>
        {mod.nameZh && <span className="text-sm text-slate-500">{mod.nameZh}</span>}
        <span className="text-xs text-slate-500">
          {mod.mcVersions.join(' / ')} · {mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')} · {formatPercent(mod.percent)}
        </span>
      </a>
    </li>
  );
}

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
    <label className="flex flex-col gap-1">
      <span className="text-slate-500">{props.label}</span>
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
  if (kind === 'loading') return <span role="status" className="text-slate-500">{t.mods.loading}</span>;
  return (
    <span role="alert" className="flex items-center gap-2 text-red-600">
      {t.mods.loadFailed}
      <button type="button" className="underline" onClick={onRetry}>{t.mods.retry}</button>
      <a href="/" className="underline">{t.mods.useSearch}</a>
    </span>
  );
}

export default function ModsBrowser({ initial, total }: { readonly initial: readonly ModSummary[]; readonly total: number }) {
  const { state, retry } = useCatalogIndex();
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
        <SelectField label={t.mods.filterLoader} value={loader} options={LOADER_OPTIONS} disabled={!ready} onChange={setLoader} />
        <SelectField label={t.mods.filterVersion} value={version} options={versionOptions} disabled={!ready} onChange={setVersion} />
        <SelectField label={t.mods.filterStatus} value={status} options={STATUS_OPTIONS} disabled={!ready} onChange={setStatus} />
        <SelectField label={t.mods.sort} value={sort} options={SORT_OPTIONS} disabled={!ready} onChange={(v) => setSort(v as SortKey)} />
        {state.kind !== 'ready' && <LoadState kind={state.kind} onRetry={retry} />}
        <span className="ml-auto text-slate-500">{t.mods.count(ready ? shown.length : total)}</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t.mods.none}</p>
      ) : (
        <ul aria-label={t.mods.listLabel} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((m) => <ModRow key={m.modId} mod={m} />)}
        </ul>
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </div>
  );
}
