import { useEffect, useState } from 'react';
import { PixelIcon } from '../components/PixelIcon';
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="text-[1.375rem] sm:text-[2.0625rem]">{t.app.title}</h1>
      <span className="text-sm text-muted">{t.app.subtitle}</span>
      {hasMods && (
        <div className="ml-auto flex flex-wrap gap-2">
          <ConfirmButton label={t.app.clearWorkspace} confirmLabel={t.app.clearConfirm} onConfirm={() => void clearWorkspace()} className="btn btn-secondary" />
          <button type="button" className="btn btn-primary" onClick={onExport}><PixelIcon name="download" />{t.app.export}</button>
        </div>
      )}
    </div>
  );
}

function Workspace() {
  return (
    <div className="card flex flex-col overflow-hidden p-0 md:h-[calc(100vh-14rem)] md:min-h-[28rem] md:flex-row">
      <aside className="flex max-h-72 shrink-0 flex-col gap-3 overflow-y-auto border-b-2 border-line bg-surface-2 p-3 md:max-h-none md:w-64 md:border-r-2 md:border-b-0">
        <DropZone compact />
        <ModList />
      </aside>
      <section className="flex h-[70vh] min-w-0 flex-1 flex-col md:h-auto">
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
      {!persistent && <div role="status" className="rounded-sm border-l-4 border-warn bg-warn-soft px-4 py-2 text-sm text-fg">{t.app.notPersistent}</div>}
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
