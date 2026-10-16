import { useCallback, useEffect, useState } from 'react';
import type { AdminApi, PublishSummary } from './adminApi';
import { s } from './strings';

type Result = { readonly kind: 'ok' | 'error'; readonly text: string };

const STATUS_LABEL: Readonly<Record<string, string>> = { reviewed: s.statusReviewed, partial: s.statusPartial };
const statusLabel = (status: string): string => (Object.hasOwn(STATUS_LABEL, status) ? STATUS_LABEL[status] ?? status : status);

function ResultLine({ result }: { readonly result: Result | null }) {
  if (!result) return null;
  const error = result.kind === 'error';
  return <p role={error ? 'alert' : 'status'} className={error ? 'text-danger' : ''}>{result.text}</p>;
}

export default function PublishPanel({ api }: { readonly api: AdminApi }) {
  const [summary, setSummary] = useState<PublishSummary | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    const r = await api.publishSummary();
    setSummary(r.ok ? r.data : 'error');
  }, [api]);
  useEffect(() => {
    let alive = true;
    void api.publishSummary().then((r) => { if (alive) setSummary(r.ok ? r.data : 'error'); });
    return () => { alive = false; };
  }, [api]);

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setConfirming(false);
    setResult(null);
    const r = await api.publish();
    setBusy(false);
    if (r.ok) {
      const remaining = r.data.remainingMods > 0 ? s.remaining(r.data.remainingMods) : '';
      setResult({ kind: 'ok', text: `${s.published(r.data)}${remaining}` });
    } else {
      setResult({ kind: 'error', text: r.message });
    }
    await load();
  };

  if (summary === 'loading') return <p className="text-muted">{s.loading}</p>;
  if (summary === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <ResultLine result={result} />
        <p role="alert" className="text-danger">{s.loadFailed}</p>
      </div>
    );
  }
  const empty = summary.approved === 0 && summary.statusChanges.length === 0;
  return (
    <div className="flex flex-col gap-3">
      {empty ? <p className="text-muted">{s.nothing}</p> : <p>{s.approvedCount(summary.approved)}</p>}
      {summary.mods.length > 0 && <ul className="text-sm">{summary.mods.map((m) => <li key={m.modId}><code>{m.modId}</code>：{m.count}</li>)}</ul>}
      {summary.statusChanges.length > 0 && (
        <div className="text-sm">
          <p className="text-muted">{s.pendingStatus}</p>
          <ul>{summary.statusChanges.map((x, i) => <li key={`${x.modId}-${i}`}>{`${x.modId} → ${statusLabel(x.status)}`}</li>)}</ul>
        </div>
      )}
      <div className="flex gap-2">
        {confirming && !busy ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => void publish()}>{s.confirmPublish}</button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>{s.cancel}</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || empty} onClick={() => setConfirming(true)}>{busy ? s.publishing : s.publish}</button>
        )}
      </div>
      <ResultLine result={result} />
    </div>
  );
}
