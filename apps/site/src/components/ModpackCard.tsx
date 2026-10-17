import { t } from '../i18n/zh-TW';
import { modpackUrl } from '../lib/config';
import { CHIP_CLASS, LOADER_LABELS } from '../lib/format';
import { modpackDisplayName, type ModpackSummary } from '../lib/modpackSummary';
import { StatusBadge } from './StatusBadge';

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
      <p className="text-sm text-muted">{pack.kubejs ? t.modpacks.kubejs(pack.kubejs.percent) : t.modpacks.noKubejs}</p>
    </article>
  );
}
