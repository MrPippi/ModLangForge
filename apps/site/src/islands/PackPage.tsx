import { useEffect, useState } from 'react';
import { PACK_FORMATS } from '@mlf/core/export';
import type { ExportResult } from '@mlf/core/export';
import { t } from '../i18n/zh-TW';
import { modUrl } from '../lib/config';
import { useHydratedCart } from './cartStore';
import { buildPack, fetchModData, type ModPayload, saveBlob } from './downloadPack';
import { pickCommonVersion } from './pickVersion';

type LoadState = { kind: 'ok'; payload: ModPayload } | { kind: 'gone' } | { kind: 'error' };
type FetchImpl = Parameters<typeof fetchModData>[1];

interface PackPageProps {
  readonly fetchImpl?: FetchImpl;
  readonly onSave?: (result: ExportResult) => void;
}

function useModPayloads(ids: readonly string[], fetchImpl: FetchImpl): Readonly<Record<string, LoadState>> {
  const [loaded, setLoaded] = useState<Readonly<Record<string, LoadState>>>({});
  useEffect(() => {
    const missing = ids.filter((id) => !(id in loaded));
    missing.forEach((id) => {
      fetchModData(id, fetchImpl).then(
        (payload) => setLoaded((prev) => ({ ...prev, [id]: payload ? { kind: 'ok', payload } : { kind: 'gone' } })),
        (err: unknown) => {
          if (import.meta.env.DEV) console.error('fetchModData failed', id, err);
          setLoaded((prev) => ({ ...prev, [id]: { kind: 'error' } }));
        },
      );
    });
  }, [ids, loaded, fetchImpl]);
  return loaded;
}

function ItemRow({ id, state, onRemove }: { readonly id: string; readonly state: LoadState | undefined; readonly onRemove: () => void }) {
  const label = state?.kind === 'ok' ? state.payload.meta.name : id;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        {state?.kind === 'ok' ? <a className="link font-medium" href={modUrl(id)}>{label}</a> : <span className="font-medium">{label}</span>}
        {state === undefined && <span className="ml-2 text-xs text-slate-500">{t.pack.loading}</span>}
        {state?.kind === 'gone' && <span className="ml-2 text-xs text-amber-600">{t.pack.gone}</span>}
        {state?.kind === 'error' && <span className="ml-2 text-xs text-red-600">{t.download.failed}</span>}
      </div>
      <button type="button" className="btn btn-secondary" onClick={onRemove}>{t.pack.remove}</button>
    </li>
  );
}

export default function PackPage({ fetchImpl = fetch, onSave = saveBlob }: PackPageProps) {
  const cart = useHydratedCart();
  const loaded = useModPayloads(cart.items, fetchImpl);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'working' | 'error'>('idle');

  const payloads = cart.items.flatMap((id) => {
    const s = loaded[id];
    return s?.kind === 'ok' ? [s.payload] : [];
  });
  const pick = pickCommonVersion(payloads.map((p) => p.meta.mcVersions));
  const version = chosen ?? pick.version;

  if (!cart.hydrated) return null;
  if (cart.items.length === 0) {
    return (
      <p className="card text-center">
        {t.pack.empty} <a className="link" href="/mods/">{t.pack.browse}</a>
      </p>
    );
  }

  const download = async () => {
    setPhase('working');
    try {
      onSave(await buildPack(payloads, version));
      setPhase('idle');
    } catch (err) {
      if (import.meta.env.DEV) console.error('buildPack failed', err);
      setPhase('error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="card divide-y divide-slate-200 p-0 dark:divide-slate-700">
        {cart.items.map((id) => <ItemRow key={id} id={id} state={loaded[id]} onRemove={() => cart.remove(id)} />)}
      </ul>
      {pick.fallback && chosen === null && <p className="text-sm text-amber-600">{t.pack.noCommonVersion}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500">{t.download.version}</span>
          <select className="input" value={version} onChange={(e) => setChosen(e.target.value)}>
            {PACK_FORMATS.map((f) => <option key={f.mcVersion} value={f.mcVersion}>{f.mcVersion}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={payloads.length === 0 || phase === 'working'} onClick={() => void download()}>
          {phase === 'working' ? t.download.working : t.pack.download(payloads.length)}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => cart.clear()}>{t.pack.clear}</button>
      </div>
      {phase === 'error' && <p role="alert" className="text-sm text-red-600">{t.download.failed}</p>}
    </div>
  );
}
