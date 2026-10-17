import { t } from '../i18n/zh-TW';
import { modpackUrl } from '../lib/config';
import { CHIP_CLASS, LOADER_LABELS } from '../lib/format';
import { modpackDisplayName, type ModpackSummary, type QuestSummary } from '../lib/modpackSummary';
import { StatusBadge } from './StatusBadge';

function questLine(quests: QuestSummary): string {
  return quests.status === 'supported' ? t.modpacks.quests(quests.percent) : t.modpacks.questsUnsupported;
}

/** 整合包目錄的一張卡片 */
export function ModpackCard({ pack }: { readonly pack: ModpackSummary }) {
  return (
    <article className="card flex h-full flex-col gap-3">
      <h2 className="text-lg font-semibold">
        <a className="link" href={modpackUrl(pack.id)}>{modpackDisplayName(pack)}</a>
      </h2>
      <p className="text-sm text-muted">{pack.summary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={CHIP_CLASS}>Minecraft {pack.mcVersion}</span>
        <span className={CHIP_CLASS}>{LOADER_LABELS[pack.loader]}</span>
        <StatusBadge status={pack.status} />
      </div>
      <p className="text-sm font-medium">{t.modpacks.includedMods(pack.includedMods, pack.totalMods)}</p>
      {pack.kubejs
        ? <p className="text-sm text-muted">{t.modpacks.kubejs(pack.kubejs.percent)}</p>
        : pack.ftbquests?.status !== 'supported' && <p className="text-sm text-muted">{t.modpacks.noKubejs}</p>}
      {pack.ftbquests && <p className="text-sm text-muted">{questLine(pack.ftbquests)}</p>}
    </article>
  );
}
