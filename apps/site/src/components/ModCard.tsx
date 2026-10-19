import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { downloadsLabel, LOADER_LABELS } from '../lib/format';
import { versionRange } from '../islands/pickVersion';
import { t } from '../i18n/zh-TW';
import { ModBanner } from './ModBanner';
import { ModIcon } from './ModIcon';
import { StatusBadge } from './StatusBadge';
import { ModTag } from './ModTag';

/** 模組目錄的模組卡片；版本只顯示範圍，避免整排版本號 */
export function ModCard({ mod }: { readonly mod: ModSummary }) {
  return (
    <a href={modUrl(mod.modId)} className="card card-link flex h-full flex-col gap-2 overflow-hidden p-0!">
      <div className="relative h-32 shrink-0 border-b-2 border-line-strong">
        <ModBanner src={mod.banner} name={mod.name} fallback="pattern" />
        <ModTag mod={mod} className="absolute right-2 top-2 shadow-sm" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4">
        {/* 橫幅區塊有 relative，圖示要疊在它上面才不會被蓋住 */}
        <div className="relative z-10 -mt-7 flex items-end gap-3">
          <ModIcon src={mod.icon} name={mod.name} size={48} className="bg-surface" />
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{mod.name}</h3>
            {mod.nameZh && <p className="truncate text-sm text-muted">{mod.nameZh}</p>}
          </div>
          {mod.status !== 'builtin' && <StatusBadge status={mod.status} className="px-1.5 text-xs" />}
        </div>
        <p className="line-clamp-2 text-sm text-muted">{mod.summary}</p>
        <div className="mt-auto grid gap-1 pt-1">
          {mod.downloads !== null && (
            <p className="text-hint">
              {downloadsLabel(mod.downloads.count)} <span>{t.common.platformNames[mod.downloads.platform]}</span>
            </p>
          )}
          <p className="flex flex-wrap gap-x-2 text-hint">
            <span>Minecraft {versionRange(mod.mcVersions)}</span>
            <span aria-hidden="true">·</span>
            <span>{mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')}</span>
            {mod.status !== 'builtin' && mod.builtinPercent !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t.builtin.partial(mod.builtinPercent)}</span>
              </>
            )}
            {mod.hasGuide && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t.common.hasGuide}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </a>
  );
}
