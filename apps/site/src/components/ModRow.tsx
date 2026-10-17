import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { downloadsLabel, LOADER_LABELS } from '../lib/format';
import { versionRange } from '../islands/pickVersion';
import { t } from '../i18n/zh-TW';
import { ModIcon } from './ModIcon';
import { StatusBadge } from './StatusBadge';
import { ModTag } from './ModTag';

/** 模組目錄條列模式的一列；窄螢幕時右側資訊換到下一行 */
export function ModRow({ mod }: { readonly mod: ModSummary }) {
  return (
    <a href={modUrl(mod.modId)} className="card card-link flex flex-wrap items-center gap-x-3 gap-y-2 p-3!">
      <ModIcon src={mod.icon} name={mod.name} size={40} />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{mod.name}</h3>
          {mod.nameZh && <span className="truncate text-sm text-muted">{mod.nameZh}</span>}
          {mod.status !== 'builtin' && <StatusBadge status={mod.status} className="px-1.5 text-xs" />}
        </div>
        <p className="truncate text-sm text-muted">{mod.summary}</p>
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
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <ModTag mod={mod} />
        {mod.downloads !== null && <span className="text-hint">{downloadsLabel(mod.downloads)}</span>}
      </div>
    </a>
  );
}
