import { useState } from 'react';
import type { ExportResult } from '@mlf/core/export';
import { Icon } from '../components/Icon';
import { t } from '../i18n/zh-TW';
import { buildModpackPack, fetchIncludedMods, fetchModpackData } from './downloadModpack';
import { saveBlob } from './downloadPack';

type FetchImpl = NonNullable<Parameters<typeof fetchModpackData>[1]>;

interface ModpackDownloadProps {
  readonly modpackId: string;
  readonly fetchImpl?: FetchImpl;
  readonly onSave?: (result: ExportResult) => void;
}

type Phase = 'idle' | 'working' | 'error';

export default function ModpackDownload({ modpackId, fetchImpl = fetch, onSave = saveBlob }: ModpackDownloadProps) {
  const [phase, setPhase] = useState<Phase>('idle');

  const download = async () => {
    setPhase('working');
    try {
      const pack = await fetchModpackData(modpackId, fetchImpl);
      onSave(await buildModpackPack(pack, await fetchIncludedMods(pack, fetchImpl)));
      setPhase('idle');
    } catch (err) {
      if (import.meta.env.DEV) console.error('modpack download failed', err);
      setPhase('error');
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <button type="button" className="btn btn-primary" disabled={phase === 'working'} onClick={() => void download()}>
        {phase === 'working' ? t.download.working : <><Icon name="download" />{t.modpackPage.download}</>}
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
