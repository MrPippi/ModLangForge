import { projectStats } from '@mlf/core/merge';
import { t } from '../i18n/zh-TW';
import { useWorkspace } from '../store/workspaceStore';
import type { ModProject } from '@mlf/core';
import { ConfirmButton } from './ConfirmButton';

function ModItem({ mod, active }: { readonly mod: ModProject; readonly active: boolean }) {
  const setActive = useWorkspace((s) => s.setActive);
  const removeMod = useWorkspace((s) => s.removeMod);
  const stats = projectStats(mod);

  return (
    <li className="relative">
      <button
        type="button"
        aria-current={active || undefined}
        onClick={() => setActive(mod.id)}
        className={`block w-full cursor-pointer rounded-sm border-2 py-2 pr-16 pl-3 text-left transition-colors ${
          active ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface'
        }`}
      >
        <span className="block truncate font-medium">{mod.name}</span>
        <span className="block truncate text-xs text-muted">
          {mod.modId} · {mod.version}
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-sm bg-line">
          <span className="block h-full bg-primary" style={{ width: `${stats.percent}%` }} />
        </span>
        <span className="mt-1 flex justify-between text-xs text-muted">
          <span>{`${stats.translated}/${stats.total} · ${stats.percent}%`}</span>
          {stats.warnings > 0 && <span className="text-warn">{t.modList.warnings(stats.warnings)}</span>}
        </span>
      </button>
      {/* 移除鈕與選取鈕並列而非巢狀，避免互動元素包互動元素 */}
      <ConfirmButton
        label={t.modList.remove}
        confirmLabel={t.modList.removeConfirm}
        onConfirm={() => void removeMod(mod.id)}
        className="absolute top-1 right-1 min-h-9 cursor-pointer rounded-sm px-2 text-xs text-muted hover:bg-surface hover:text-fg"
      />
    </li>
  );
}

export function ModList() {
  const mods = useWorkspace((s) => s.mods);
  const activeModId = useWorkspace((s) => s.activeModId);

  if (mods.length === 0) {
    return <p className="p-3 text-sm text-muted">{t.modList.empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {mods.map((mod) => (
        <ModItem key={mod.id} mod={mod} active={mod.id === activeModId} />
      ))}
    </ul>
  );
}
