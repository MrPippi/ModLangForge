import { t } from '../i18n/zh-TW';
import { type ConflictAction, useWorkspace } from '../store/workspaceStore';
import { Modal } from './Modal';

const ACTIONS: readonly { readonly action: ConflictAction; readonly label: string; readonly className: string }[] = [
  { action: 'merge', label: t.conflict.merge, className: 'btn btn-primary' },
  { action: 'replace', label: t.conflict.replace, className: 'btn btn-danger' },
  { action: 'skip', label: t.conflict.skip, className: 'btn btn-secondary' },
];

export function ConflictDialog() {
  const conflict = useWorkspace((s) => s.pendingConflicts[0]);
  const resolveConflict = useWorkspace((s) => s.resolveConflict);

  if (!conflict) return null;

  return (
    <Modal title={t.conflict.title}>
      <p className="mb-2">{t.conflict.body(conflict.name, conflict.modId)}</p>
      <p className="mb-4 text-sm text-muted">{conflict.jarName}</p>
      <div className="flex flex-wrap justify-end gap-2">
        {ACTIONS.map(({ action, label, className }) => (
          <button key={action} type="button" className={className} onClick={() => void resolveConflict(conflict.modId, action)}>
            {label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
