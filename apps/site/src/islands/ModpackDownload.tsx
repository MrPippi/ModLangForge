import { useState } from 'react';
import type { ExportResult } from '@mlf/core/export';
import type { QuestLayout } from '@mlf/core/ftbquests';
import { Icon } from '../components/Icon';
import { t } from '../i18n/zh-TW';
import { buildModpackQuestFile, buildModpackResourcePack, fetchIncludedMods, fetchModpackData } from './downloadModpack';
import { saveBlob } from './downloadPack';

type FetchImpl = NonNullable<Parameters<typeof fetchModpackData>[1]>;

interface ModpackDownloadProps {
  readonly modpackId: string;
  /** 有已收錄的模組或整合包自己的文字可做成資源包 */
  readonly hasPack: boolean;
  /** 有已翻譯的 FTB 任務時給任務的 layout，決定檔名與放置位置 */
  readonly questLayout?: QuestLayout;
  readonly fetchImpl?: FetchImpl;
  readonly onSave?: (result: ExportResult) => void;
}

type Phase = 'idle' | 'working' | 'error';
type Part = 'pack' | 'quests';

export default function ModpackDownload({ modpackId, hasPack, questLayout, fetchImpl = fetch, onSave = saveBlob }: ModpackDownloadProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [last, setLast] = useState<Part>('pack');

  const download = async (part: Part) => {
    setLast(part);
    setPhase('working');
    try {
      const pack = await fetchModpackData(modpackId, fetchImpl);
      const result = part === 'pack'
        ? await buildModpackResourcePack(pack, await fetchIncludedMods(pack, fetchImpl))
        : buildModpackQuestFile(pack);
      if (!result) throw new Error(`modpack ${modpackId} has no ${part} to download`);
      onSave(result);
      setPhase('idle');
    } catch (err) {
      if (import.meta.env.DEV) console.error('modpack download failed', err);
      setPhase('error');
    }
  };

  const working = phase === 'working';
  return (
    <div className="flex flex-col items-start gap-3">
      {hasPack && (
        <button type="button" className="btn btn-primary" disabled={working} onClick={() => void download('pack')}>
          {working && last === 'pack' ? t.download.working : <><Icon name="download" />{t.modpackPage.download}</>}
        </button>
      )}
      {questLayout && (
        <div className="flex flex-col items-start gap-1">
          <button type="button" className={hasPack ? 'btn btn-secondary' : 'btn btn-primary'} disabled={working} onClick={() => void download('quests')}>
            {working && last === 'quests' ? t.download.working : <><Icon name="download" />{t.modpackPage.downloadQuests}</>}
          </button>
          <p className="text-xs text-muted">{t.modpackPage.questsHint(questLayout)}</p>
        </div>
      )}
      {phase === 'error' && (
        <p role="alert" className="flex w-full flex-wrap items-center gap-x-2 text-sm text-danger">
          {t.download.failed}
          <button type="button" className="link inline-flex min-h-11 items-center" onClick={() => void download(last)}>{t.download.retry}</button>
        </p>
      )}
    </div>
  );
}
