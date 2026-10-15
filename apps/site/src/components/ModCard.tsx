import type { ModSummary } from '../lib/summary';
import { modUrl } from '../lib/config';
import { LOADER_LABELS } from '../lib/format';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';

/** 首頁與模組目錄共用的模組卡片 */
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
      <p className="mt-auto text-hint">
        {mod.mcVersions.join(' / ')} · {mod.loaders.map((l) => LOADER_LABELS[l]).join(' / ')}
      </p>
      <ProgressBar percent={mod.percent} />
    </a>
  );
}
