import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { LOADER_LABELS } from '../lib/format';
import { versionRange } from '../islands/pickVersion';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';

/** 模組目錄的模組卡片；版本只顯示範圍，避免整排版本號 */
export function ModCard({ mod }: { readonly mod: ModSummary }) {
  return (
    <a href={modUrl(mod.modId)} className="card card-link flex h-full flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{mod.name}</h3>
          {mod.nameZh && <p className="truncate text-sm text-muted">{mod.nameZh}</p>}
        </div>
        <StatusBadge status={mod.status} />
      </div>
      <p className="line-clamp-2 text-sm text-muted">{mod.summary}</p>
      <div className="mt-auto grid gap-2 pt-1">
        <p className="flex flex-wrap gap-x-2 text-hint">
          <span>Minecraft {versionRange(mod.mcVersions)}</span>
          <span aria-hidden="true">·</span>
          <span>{mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')}</span>
        </p>
        <ProgressBar percent={mod.percent} />
      </div>
    </a>
  );
}
