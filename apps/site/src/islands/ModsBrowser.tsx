import { useMemo, useState } from 'react';
import { LOADERS } from '@mlf/core/catalog';
import { t } from '../i18n/zh-TW';
import type { ModSummary } from '../lib/data';
import { modUrl } from '../lib/config';
import { formatPercent, LOADER_LABELS, STATUS_LABELS } from '../lib/format';
import { sortVersions } from './pickVersion';

const ALL = '';

export function filterMods(mods: readonly ModSummary[], loader: string, version: string): ModSummary[] {
  return mods.filter(
    (m) => (loader === ALL || m.loaders.some((l) => l === loader)) && (version === ALL || m.mcVersions.includes(version)),
  );
}

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

export default function ModsBrowser({ mods }: { readonly mods: readonly ModSummary[] }) {
  const [loader, setLoader] = useState(ALL);
  const [version, setVersion] = useState(ALL);
  const versions = useMemo(() => sortVersions(mods.flatMap((m) => m.mcVersions)), [mods]);
  const shown = filterMods(mods, loader, version);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">{t.mods.filterLoader}</span>
          <select className="input" value={loader} onChange={(e) => setLoader(e.target.value)}>
            <option value={ALL}>{t.mods.all}</option>
            {LOADERS.map((l) => <option key={l} value={l}>{LOADER_LABELS[l]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">{t.mods.filterVersion}</span>
          <select className="input" value={version} onChange={(e) => setVersion(e.target.value)}>
            <option value={ALL}>{t.mods.all}</option>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <span className="ml-auto text-slate-500">{t.mods.count(shown.length)}</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-slate-500">{t.mods.none}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => <ModRow key={m.modId} mod={m} />)}
        </ul>
      )}
    </div>
  );
}
