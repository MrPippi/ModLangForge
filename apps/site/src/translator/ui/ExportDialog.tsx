import { useState } from 'react';
import type { ModProject } from '@mlf/core';
import { projectStats } from '@mlf/core/merge';
import {
  DEFAULT_MC_VERSION, exportProjects, type ExportKind, type ExportOptions, type ExportResult, PACK_FORMATS, type UntranslatedMode,
} from '@mlf/core/export';
import { saveBlob } from '../../lib/saveBlob';
import { t } from '../i18n/zh-TW';
import { useWorkspace } from '../store/workspaceStore';
import { toastError } from '../store/toastStore';
import { buildContribution } from './contribution';
import { Modal } from './Modal';

type DialogKind = ExportKind | 'contribution';

const KINDS: readonly { readonly kind: DialogKind; readonly label: string }[] = [
  { kind: 'merged-pack', label: t.exportDialog.kindMerged },
  { kind: 'separate-packs', label: t.exportDialog.kindSeparate },
  { kind: 'lang-files', label: t.exportDialog.kindLang },
  { kind: 'contribution', label: t.exportDialog.kindContribution },
];

interface ExportDialogProps {
  readonly onClose: () => void;
  readonly exportFn?: (projects: readonly ModProject[], opts: ExportOptions) => Promise<ExportResult>;
  readonly onSave?: (result: ExportResult) => void;
}

function ModChecklist({ mods, selected, onToggle }: { readonly mods: readonly ModProject[]; readonly selected: ReadonlySet<string>; readonly onToggle: (id: string) => void }) {
  return (
    <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      {mods.map((m) => (
        <li key={m.id}>
          <label className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={selected.has(m.id)} onChange={() => onToggle(m.id)} />
            <span>{m.name}</span>
            <span className="text-xs text-slate-500">{m.modId}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function ExportDialog({ onClose, exportFn = exportProjects, onSave = saveBlob }: ExportDialogProps) {
  const mods = useWorkspace((s) => s.mods);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(mods.map((m) => m.id)));
  const [kind, setKind] = useState<DialogKind>('merged-pack');
  const [untranslated, setUntranslated] = useState<UntranslatedMode>('keep-source');
  const [mcVersion, setMcVersion] = useState(DEFAULT_MC_VERSION);
  const [description, setDescription] = useState<string>(t.exportDialog.defaultDescription);
  const [busy, setBusy] = useState(false);

  const chosen = mods.filter((m) => selected.has(m.id));
  const warnings = chosen.reduce((sum, m) => sum + projectStats(m).warnings, 0);
  const isPack = kind === 'merged-pack' || kind === 'separate-packs';

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const submit = async () => {
    setBusy(true);
    try {
      const result = kind === 'contribution'
        ? await buildContribution(chosen, new Date().toISOString().slice(0, 10))
        : await exportFn(chosen, { kind, untranslated, mcVersion, description });
      onSave(result);
      onClose();
    } catch (err) {
      if (import.meta.env.DEV) console.error('export failed', err);
      toastError(t.errors.exportFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.exportDialog.title} wide>
      <div className="flex flex-col gap-4 text-sm">
        <section>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-semibold">{t.exportDialog.mods}</h3>
            <button type="button" className="link text-xs" onClick={() => setSelected(new Set(mods.map((m) => m.id)))}>{t.exportDialog.selectAll}</button>
            <button type="button" className="link text-xs" onClick={() => setSelected(new Set())}>{t.exportDialog.selectNone}</button>
          </div>
          <ModChecklist mods={mods} selected={selected} onToggle={toggle} />
        </section>
        <fieldset>
          <legend className="mb-1 font-semibold">{t.exportDialog.kind}</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className="flex items-center gap-2 py-0.5">
              <input type="radio" name="kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              {k.label}
            </label>
          ))}
          {kind === 'contribution' && <p className="mt-1 text-xs text-slate-500">{t.exportDialog.contributionHint}</p>}
        </fieldset>
        {kind !== 'contribution' && (
          <fieldset>
            <legend className="mb-1 font-semibold">{t.exportDialog.untranslated}</legend>
            {(['keep-source', 'skip'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 py-0.5">
                <input type="radio" name="untranslated" checked={untranslated === mode} onChange={() => setUntranslated(mode)} />
                {mode === 'keep-source' ? t.exportDialog.keepSource : t.exportDialog.skip}
              </label>
            ))}
          </fieldset>
        )}
        {isPack && (
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">{t.exportDialog.mcVersion}</span>
              <select className="input" value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                {PACK_FORMATS.map((f) => <option key={f.mcVersion} value={f.mcVersion}>{f.mcVersion}</option>)}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-semibold">{t.exportDialog.description}</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        )}
        {warnings > 0 && <p className="text-amber-600">{t.exportDialog.warnings(warnings)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t.exportDialog.cancel}</button>
          <button type="button" className="btn btn-primary" disabled={chosen.length === 0 || busy} onClick={() => void submit()}>
            {busy ? t.exportDialog.exporting : t.exportDialog.submit}
          </button>
        </div>
      </div>
    </Modal>
  );
}
