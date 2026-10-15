import { useState } from 'react';
import { PixelIcon } from '../components/PixelIcon';
import { t } from '../i18n/zh-TW';
import { useHydratedCart } from './cartStore';
import { buildPack, fetchModData, saveBlob } from './downloadPack';
import { sortVersions } from './pickVersion';

interface DownloadPanelProps {
  readonly modId: string;
  readonly mcVersions: readonly string[];
}

type Phase = 'idle' | 'working' | 'error';

export default function DownloadPanel({ modId, mcVersions }: DownloadPanelProps) {
  const versions = sortVersions(mcVersions);
  const [version, setVersion] = useState(versions[0] ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const cart = useHydratedCart();
  const inCart = cart.items.includes(modId);

  const download = async () => {
    setPhase('working');
    try {
      const payload = await fetchModData(modId);
      if (!payload) throw new Error(`${modId} not found`);
      saveBlob(await buildPack([payload], version));
      setPhase('idle');
    } catch (err) {
      if (import.meta.env.DEV) console.error('download failed', err);
      setPhase('error');
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">{t.download.version}</span>
        <select className="input" value={version} onChange={(e) => setVersion(e.target.value)}>
          {versions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-primary" disabled={phase === 'working'} onClick={() => void download()}>
        {phase === 'working' ? t.download.working : <><PixelIcon name="download" />{t.download.button}</>}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        aria-pressed={inCart}
        onClick={() => (inCart ? cart.remove(modId) : cart.add(modId))}
      >
        {inCart ? <><PixelIcon name="check" />{t.download.inPack}</> : <><PixelIcon name="plus" />{t.download.addToPack}</>}
      </button>
      {phase === 'error' && (
        <p role="alert" className="flex w-full flex-wrap items-center gap-x-2 text-sm text-danger">
          {t.download.failed}
          <button type="button" className="link inline-flex min-h-11 items-center" onClick={() => void download()}>{t.download.retry}</button>
        </p>
      )}
    </div>
  );
}
