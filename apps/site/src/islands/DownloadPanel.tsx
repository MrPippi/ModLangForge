import { useState } from 'react';
import { Icon } from '../components/Icon';
import { t } from '../i18n/zh-TW';
import { useHydratedCart } from './cartStore';
import { buildPack, fetchModData, saveBlob } from './downloadPack';
import { pickDefaultVersion, sortVersions } from './pickVersion';
import { VersionDownload } from './VersionDownload';

interface DownloadPanelProps {
  readonly modId: string;
  readonly mcVersions: readonly string[];
}

type Phase = 'idle' | 'working' | 'error';

export default function DownloadPanel({ modId, mcVersions }: DownloadPanelProps) {
  const versions = sortVersions(mcVersions);
  const [version, setVersion] = useState(pickDefaultVersion(versions));
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
    <div className="flex flex-col items-start gap-3">
      <VersionDownload versions={versions} version={version} disabled={phase === 'working'} onVersionChange={setVersion} onDownload={() => void download()}>
        {phase === 'working' ? t.download.working : <><Icon name="download" />{t.download.button}</>}
      </VersionDownload>
      <button
        type="button"
        className="btn btn-secondary"
        aria-pressed={inCart}
        onClick={() => (inCart ? cart.remove(modId) : cart.add(modId))}
      >
        {inCart ? <><Icon name="check" />{t.download.inPack}</> : <><Icon name="plus" />{t.download.addToPack}</>}
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
