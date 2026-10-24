import { useState } from 'react';
import { ModIcon } from '../components/ModIcon';
import { s } from './strings';
import { matchesMod, type ModEntry } from './useModNames';

interface Props {
  readonly userName: string;
  readonly mods: readonly ModEntry[];
  readonly initial: readonly string[];
  readonly busy: boolean;
  readonly onSave: (modIds: readonly string[]) => void;
  readonly onCancel: () => void;
}

/** 勾選審核者負責的模組；一個都不勾代表可審核全部模組 */
export default function ReviewModsEditor({ userName, mods, initial, busy, onSave, onCancel }: Props) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(initial));
  const [query, setQuery] = useState('');
  const shown = mods.filter((m) => matchesMod(m, query));
  const toggle = (modId: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(modId)) next.delete(modId);
    else next.add(modId);
    return next;
  });
  return (
    <fieldset className="grid w-full gap-3 rounded-sm border-2 border-line bg-surface-2 p-3">
      <legend className="px-1 text-sm font-semibold">{s.reviewModsFor(userName)}</legend>
      <p className="text-sm text-muted">{s.reviewModsHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 sm:max-w-72" aria-label={s.modSearch} placeholder={s.modIdPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="text-sm" aria-live="polite">{picked.size === 0 ? s.reviewModsAll : s.reviewModsPicked(picked.size)}</span>
      </div>
      <ul aria-label={s.modPickerList} className="grid max-h-72 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
        {shown.map((m) => (
          <li key={m.modId}>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-surface has-checked:bg-primary-soft">
              <input type="checkbox" checked={picked.has(m.modId)} onChange={() => toggle(m.modId)} />
              <ModIcon src={m.icon} name={m.name} size={24} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <code className="max-w-[40%] truncate text-xs text-muted">{m.modId}</code>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2 text-muted">{s.noModMatch}</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onSave([...picked].sort())}>{s.save}</button>
        {picked.size > 0 && <button type="button" className="btn" disabled={busy} onClick={() => setPicked(new Set())}>{s.reviewModsClear}</button>}
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{s.cancel}</button>
      </div>
    </fieldset>
  );
}
