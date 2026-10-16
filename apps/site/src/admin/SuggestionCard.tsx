import { useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, AdminSuggestion } from './adminApi';
import { EditForm, RejectForm } from './SuggestionForms';
import { s } from './strings';

interface Props {
  readonly item: AdminSuggestion;
  readonly api: AdminApi;
  readonly isAdmin: boolean;
  readonly onDone: (message: string) => void;
}

type Mode = 'view' | 'edit' | 'reject';
const REJECTABLE: readonly AdminSuggestion['status'][] = ['pending', 'approved', 'conflict'];

function Details({ item }: { readonly item: AdminSuggestion }) {
  return (
    <>
      <p className="whitespace-pre-wrap">{item.proposed}</p>
      {item.formatWarning && <p className="text-xs text-warn">{s.formatWarning}</p>}
      {item.note && <p className="text-xs text-muted">{s.note}：{item.note}</p>}
      <p className="text-xs text-muted">{s.base}：{item.baseTarget ?? '—'}</p>
      <p className="text-xs text-muted">{item.authorName ?? s.anonymous} · {item.createdAt.slice(0, 10)} · {s.status[item.status]}</p>
      {item.reviewNote && <p className="text-xs text-muted">{item.reviewNote}</p>}
    </>
  );
}

export default function SuggestionCard({ item, api, isAdmin, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<ApiResult<unknown>>, message: string) => {
    setError(null);
    const result = await action();
    if (result.ok) onDone(message);
    else setError(result.message);
  };
  const back = () => setMode('view');
  const pending = item.status === 'pending';

  return (
    <article aria-label={s.cardLabel(item.id)} className="flex flex-col gap-1 rounded-sm border-2 border-line bg-surface p-3">
      <Details item={item} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {mode === 'view' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {pending && <button type="button" className="btn btn-primary" onClick={() => void run(() => api.approve(item.id), s.approved)}>{s.approve}</button>}
          {pending && <button type="button" className="btn" onClick={() => setMode('edit')}>{s.editApprove}</button>}
          {REJECTABLE.includes(item.status) && <button type="button" className="btn" onClick={() => setMode('reject')}>{s.reject}</button>}
          {isAdmin && <button type="button" className="btn" onClick={() => void run(() => api.addBlock(item.authorSubject, s.blockReason(item.id)), s.blocked)}>{s.blockAuthor}</button>}
        </div>
      )}
      {mode === 'edit' && <EditForm initial={item.proposed} onCancel={back} onConfirm={(text) => void run(() => api.approve(item.id, text), s.approved)} />}
      {mode === 'reject' && <RejectForm onCancel={back} onConfirm={(reason) => void run(() => api.reject(item.id, reason), s.rejected)} />}
    </article>
  );
}
