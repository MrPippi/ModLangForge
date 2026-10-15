import { useEffect, useState } from 'react';
import { t } from './i18n/zh-TW';
import { flushPendingSaves, useWorkspace } from './store/workspaceStore';
import { ConfirmButton } from './ui/ConfirmButton';
import { ConflictDialog } from './ui/ConflictDialog';
import { DropZone } from './ui/DropZone';
import { Editor } from './ui/Editor';
import { ExportDialog } from './ui/ExportDialog';
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

function Toolbar({ onExport }: { readonly onExport: () => void }) {
  const hasMods = useWorkspace((s) => s.mods.length > 0);
  const clearWorkspace = useWorkspace((s) => s.clearWorkspace);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-2xl font-bold">{t.app.title}</h1>
      <span className="text-sm text-slate-500">{t.app.subtitle}</span>
      {hasMods && (
        <div className="ml-auto flex gap-2">
          <ConfirmButton label={t.app.clearWorkspace} confirmLabel={t.app.clearConfirm} onConfirm={() => void clearWorkspace()} className="btn btn-secondary" />
          <button type="button" className="btn btn-primary" onClick={onExport}>⬇ {t.app.export}</button>
        </div>
      )}
    </div>
  );
}

function Workspace() {
  return (
    <div className="card flex h-[calc(100vh-14rem)] min-h-[28rem] overflow-hidden p-0">
      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-700">
        <DropZone compact />
        <ModList />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <Editor />
      </section>
    </div>
  );
}

export default function TranslatorApp() {
  usePersistenceLifecycle();
  const hasMods = useWorkspace((s) => s.mods.length > 0);
  const persistent = useWorkspace((s) => s.persistent);
  const [exporting, setExporting] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Toolbar onExport={() => setExporting(true)} />
      {!persistent && <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">{t.app.notPersistent}</div>}
      {hasMods ? (
        <Workspace />
      ) : (
        <div className="flex justify-center py-6">
          <DropZone />
        </div>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      <ConflictDialog />
      <ToastContainer />
    </div>
  );
}
