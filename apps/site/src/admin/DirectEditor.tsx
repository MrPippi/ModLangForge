import { useState } from 'react';
import type { FetchLike } from '../islands/api';
import { TranslationTable } from '../translator/ui/TranslationTable';
import type { AdminApi } from './adminApi';
import ModStatusControl from './ModStatusControl';
import { s } from './strings';
import { useDirectEdit, type Message } from './useDirectEdit';

function MessageLine({ message }: { readonly message: Message | null }) {
  if (!message) return null;
  const error = message.kind === 'error';
  return <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-danger' : 'text-sm'}>{message.text}</p>;
}

export default function DirectEditor({ api, fetchImpl }: { readonly api: AdminApi; readonly fetchImpl: FetchLike }) {
  const [modInput, setModInput] = useState('');
  const edit = useDirectEdit(api, fetchImpl);
  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void edit.open(modInput); }}>
        <label className="flex flex-col text-sm">{s.modIdLabel}
          <input className="input" value={modInput} onChange={(e) => setModInput(e.target.value)} />
        </label>
        <button type="submit" className="btn">{s.open}</button>
      </form>
      <MessageLine message={edit.message} />
      {edit.loaded && (
        <>
          <ModStatusControl api={api} modId={edit.loaded.modId} />
          <input className="input" aria-label={s.search} value={edit.query} onChange={(e) => edit.setQuery(e.target.value)} />
          <div className="flex h-[70vh] flex-col rounded-sm border-2 border-line">
            <TranslationTable hits={edit.hits} showModId={false} showReference={false} autoCommit={false} onCommit={(m, k, v) => void edit.commit(m, k, v)} />
          </div>
        </>
      )}
    </div>
  );
}
