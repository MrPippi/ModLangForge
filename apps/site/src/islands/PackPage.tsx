import { useCallback, useEffect, useRef, useState } from 'react';
import { PACK_FORMATS } from '@mlf/core/export';
import type { ExportResult } from '@mlf/core/export';
import { PixelIcon } from '../components/PixelIcon';
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

interface ModPayloads {
  readonly loaded: Readonly<Record<string, LoadState>>;
  readonly retry: (id: string) => void;
}

/** 每個 modId 只請求一次（進行中的請求不重複發出），失敗可重試 */
function useModPayloads(ids: readonly string[], fetchImpl: FetchImpl): ModPayloads {
  const [loaded, setLoaded] = useState<Readonly<Record<string, LoadState>>>({});
  const requested = useRef(new Set<string>());

  const load = useCallback((id: string) => {
    requested.current.add(id);
    fetchModData(id, fetchImpl).then(
      (payload) => setLoaded((prev) => ({ ...prev, [id]: payload ? { kind: 'ok', payload } : { kind: 'gone' } })),
      (err: unknown) => {
        if (import.meta.env.DEV) console.error('fetchModData failed', id, err);
        setLoaded((prev) => ({ ...prev, [id]: { kind: 'error' } }));
      },
    );
  }, [fetchImpl]);

  useEffect(() => {
    ids.filter((id) => !requested.current.has(id)).forEach(load);
  }, [ids, load]);

  const retry = useCallback((id: string) => {
    setLoaded((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
    load(id);
  }, [load]);

  return { loaded, retry };
}

interface ItemRowProps {
  readonly id: string;
  readonly state: LoadState | undefined;
  readonly onRemove: () => void;
  readonly onRetry: () => void;
}

function ItemRow({ id, state, onRemove, onRetry }: ItemRowProps) {
  const label = state?.kind === 'ok' ? state.payload.meta.name : id;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        {state?.kind === 'ok' ? <a className="link font-medium" href={modUrl(id)}>{label}</a> : <span className="font-medium">{label}</span>}
        {state === undefined && <span className="ml-2 text-xs text-muted">{t.pack.loading}</span>}
        {state?.kind === 'gone' && <span className="ml-2 text-xs text-warn">{t.pack.gone}</span>}
        {state?.kind === 'error' && <span className="ml-2 text-xs text-danger">{t.download.failed}</span>}
      </div>
      <div className="flex shrink-0 gap-2">
        {state?.kind === 'error' && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>{t.download.retry}</button>}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}><PixelIcon name="close" size={12} />{t.pack.remove}</button>
      </div>
    </li>
  );
}

export default function PackPage({ fetchImpl = fetch, onSave = saveBlob }: PackPageProps) {
  const cart = useHydratedCart();
  const { loaded, retry } = useModPayloads(cart.items, fetchImpl);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'working' | 'error'>('idle');

  const payloads = cart.items.flatMap((id) => {
    const s = loaded[id];
    return s?.kind === 'ok' ? [s.payload] : [];
  });
  const pick = pickCommonVersion(payloads.map((p) => p.meta.mcVersions));
  const version = chosen ?? pick.version;
  const pending = cart.items.filter((id) => loaded[id] === undefined).length;
  const failed = cart.items.filter((id) => loaded[id]?.kind === 'error').length;
  const canDownload = payloads.length > 0 && pending === 0 && failed === 0 && phase !== 'working';

  if (!cart.hydrated) return null;
  if (cart.items.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-4 py-12 text-center">
        <PixelIcon name="chest" size={48} className="text-line-strong" />
        <p>{t.pack.empty}</p>
        <a className="btn btn-primary" href="/mods/">{t.pack.browse}<PixelIcon name="arrowRight" size={14} /></a>
      </div>
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
      <ul className="card divide-y-2 divide-line p-0">
        {cart.items.map((id) => <ItemRow key={id} id={id} state={loaded[id]} onRemove={() => cart.remove(id)} onRetry={() => retry(id)} />)}
      </ul>
      {pick.fallback && chosen === null && <p className="text-sm text-warn">{t.pack.noCommonVersion}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">{t.download.version}</span>
          <select className="input" value={version} onChange={(e) => setChosen(e.target.value)}>
            {PACK_FORMATS.map((f) => <option key={f.mcVersion} value={f.mcVersion}>{f.mcVersion}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={!canDownload} onClick={() => void download()}>
          {phase === 'working' ? t.download.working : <><PixelIcon name="download" />{t.pack.download(payloads.length)}</>}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => cart.clear()}>{t.pack.clear}</button>
      </div>
      {failed > 0 && <p className="text-sm text-danger">{t.pack.unloaded(failed)}</p>}
      {phase === 'error' && <p role="alert" className="text-sm text-danger">{t.download.failed}</p>}
    </div>
  );
}
