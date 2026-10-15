import { projectStats } from '../core/merge';
import { t } from '../i18n/zh-TW';
import { useWorkspace } from '../store/workspaceStore';
import type { ModProject } from '../types';
import { ConfirmButton } from './ConfirmButton';

function ModItem({ mod, active }: { readonly mod: ModProject; readonly active: boolean }) {
  const setActive = useWorkspace((s) => s.setActive);
  const removeMod = useWorkspace((s) => s.removeMod);
  const stats = projectStats(mod);

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={active}
        onClick={() => setActive(mod.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setActive(mod.id);
        }}
        className={`group block w-full cursor-pointer rounded-lg px-3 py-2 text-left ${
          active ? 'bg-emerald-100 dark:bg-emerald-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{mod.name}</span>
          <ConfirmButton
            label={t.modList.remove}
            confirmLabel={t.modList.removeConfirm}
            onConfirm={() => void removeMod(mod.id)}
            className="shrink-0 text-xs text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100"
          />
        </div>
        <div className="truncate text-xs text-slate-500">
          {mod.modId} · {mod.version}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-emerald-500" style={{ width: `${stats.percent}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{`${stats.translated}/${stats.total} · ${stats.percent}%`}</span>
          {stats.warnings > 0 && <span className="text-amber-600">{t.modList.warnings(stats.warnings)}</span>}
        </div>
      </div>
    </li>
  );
}

export function ModList() {
  const mods = useWorkspace((s) => s.mods);
  const activeModId = useWorkspace((s) => s.activeModId);

  if (mods.length === 0) {
    return <p className="p-3 text-sm text-slate-500">{t.modList.empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {mods.map((mod) => (
        <ModItem key={mod.id} mod={mod} active={mod.id === activeModId} />
      ))}
    </ul>
  );
}
