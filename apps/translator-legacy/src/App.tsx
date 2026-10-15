import { useEffect } from 'react';
import { t } from './i18n/zh-TW';
import { flushPendingSaves, useWorkspace } from './store/workspaceStore';
import { ConfirmButton } from './ui/ConfirmButton';
import { ConflictDialog } from './ui/ConflictDialog';
import { DropZone } from './ui/DropZone';
import { ModList } from './ui/ModList';
import { ToastContainer } from './ui/Toast';

function usePersistenceLifecycle() {
  const init = useWorkspace((s) => s.init);
  useEffect(() => {
    void init();
    const flush = () => void flushPendingSaves();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [init]);
}

function Header() {
  const hasMods = useWorkspace((s) => s.mods.length > 0);
  const clearWorkspace = useWorkspace((s) => s.clearWorkspace);
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
      <h1 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{t.app.title}</h1>
      <span className="text-sm text-slate-500">{t.app.subtitle}</span>
      <div className="ml-auto flex items-center gap-2">
        {hasMods && (
          <ConfirmButton
            label={t.app.clearWorkspace}
            confirmLabel={t.app.clearConfirm}
            onConfirm={() => void clearWorkspace()}
            className="btn btn-secondary"
          />
        )}
      </div>
    </header>
  );
}

function Workspace() {
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-700">
        <DropZone compact />
        <ModList />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col" />
    </div>
  );
}

export default function App() {
  usePersistenceLifecycle();
  const hasMods = useWorkspace((s) => s.mods.length > 0);
  const persistent = useWorkspace((s) => s.persistent);

  return (
    <div className="flex h-full flex-col">
      <Header />
      {!persistent && <div className="bg-amber-100 px-4 py-1 text-sm text-amber-800">{t.app.notPersistent}</div>}
      {hasMods ? (
        <Workspace />
      ) : (
        <main className="flex flex-1 items-center justify-center p-6">
          <DropZone />
        </main>
      )}
      <ConflictDialog />
      <ToastContainer />
    </div>
  );
}
