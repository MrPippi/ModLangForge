import { useState } from 'react';
import type { AdminApi } from './adminApi';
import { s } from './strings';

type Status = 'partial' | 'reviewed';

export default function ModStatusControl({ api, modId }: { readonly api: AdminApi; readonly modId: string }) {
  const [status, setStatus] = useState<Status>('reviewed');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const queue = async () => {
    setBusy(true);
    const result = await api.setModStatus(modId, status);
    setBusy(false);
    setMessage(result.ok ? s.statusQueued : result.message);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-sm">{s.modStatus}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="reviewed">{s.statusReviewed}</option>
          <option value="partial">{s.statusPartial}</option>
        </select>
      </label>
      <button type="button" className="btn" disabled={busy} onClick={() => void queue()}>{s.queueStatus}</button>
      {message && <span role="status" className="text-sm">{message}</span>}
    </div>
  );
}
