import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, BlockRecord } from './adminApi';
import { s } from './strings';

export default function BlocksPanel({ api }: { readonly api: AdminApi }) {
  const [blocks, setBlocks] = useState<readonly BlockRecord[] | 'loading' | 'error'>('loading');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.listBlocks();
    setBlocks(r.ok ? r.data.blocks : 'error');
  }, [api]);
  useEffect(() => {
    let alive = true;
    void api.listBlocks().then((r) => { if (alive) setBlocks(r.ok ? r.data.blocks : 'error'); });
    return () => { alive = false; };
  }, [api]);

  const act = async (pending: () => Promise<ApiResult<unknown>>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    const r = await pending();
    setError(r.ok ? null : r.message);
    if (r.ok) {
      after?.();
      await load();
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        void act(() => api.addBlock(subject.trim(), reason.trim() || undefined), () => { setSubject(''); setReason(''); });
      }}>
        <label className="flex flex-col text-sm">{s.subject}<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="flex flex-col text-sm">{s.reason}<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="submit" className="btn" disabled={busy}>{s.addBlock}</button>
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {blocks === 'loading' && <p className="text-muted">{s.loading}</p>}
      {blocks === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof blocks !== 'string' && blocks.length === 0 && <p className="text-muted">{s.noBlocks}</p>}
      {typeof blocks !== 'string' && blocks.length > 0 && (
        <ul className="divide-y divide-line">
          {blocks.map((b) => (
            <li key={b.subject} className="flex flex-wrap items-center gap-3 py-2">
              <code className="break-all text-xs">{b.subject}</code>
              <span className="text-sm text-muted">{b.reason ?? ''}</span>
              <button type="button" className="btn" disabled={busy} aria-label={s.removeBlock(b.subject)} onClick={() => void act(() => api.removeBlock(b.subject))}>{s.unblock}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
