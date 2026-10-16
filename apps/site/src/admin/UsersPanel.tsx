import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '../islands/api';
import type { AdminApi, AdminUser, Role } from './adminApi';
import { s } from './strings';

const ROLES = Object.keys(s.roles) as Role[];

export default function UsersPanel({ api, selfId }: { readonly api: AdminApi; readonly selfId: number }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<readonly AdminUser[] | 'loading' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banning, setBanning] = useState<number | null>(null);

  const search = useCallback(async (q: string) => {
    const r = await api.listUsers(q);
    setUsers(r.ok ? r.data.users : 'error');
  }, [api]);
  useEffect(() => {
    let alive = true;
    void api.listUsers('').then((r) => { if (alive) setUsers(r.ok ? r.data.users : 'error'); });
    return () => { alive = false; };
  }, [api]);

  const act = async (pending: () => Promise<ApiResult<unknown>>) => {
    if (busy) return;
    setBusy(true);
    setBanning(null);
    const r = await pending();
    setError(r.ok ? null : r.message);
    if (r.ok) await search(query.trim());
    setBusy(false);
  };

  const banButton = (u: AdminUser) => {
    if (u.banned) {
      return <button type="button" className="btn" disabled={busy} aria-label={`${s.unban} ${u.displayName}`} onClick={() => void act(() => api.setBanned(u.id, false))}>{s.unban}</button>;
    }
    if (banning === u.id) {
      return (
        <>
          <button type="button" className="btn" disabled={busy} aria-label={s.confirmBan(u.displayName)} onClick={() => void act(() => api.setBanned(u.id, true))}>{s.confirmBan(u.displayName)}</button>
          <button type="button" className="btn" onClick={() => setBanning(null)}>{s.cancel}</button>
        </>
      );
    }
    return <button type="button" className="btn" disabled={busy} aria-label={`${s.ban} ${u.displayName}`} onClick={() => setBanning(u.id)}>{s.ban}</button>;
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); void search(query.trim()); }}>
        <input className="input" aria-label={s.userSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {users === 'loading' && <p className="text-muted">{s.loading}</p>}
      {users === 'error' && <p role="alert" className="text-danger">{s.loadFailed}</p>}
      {typeof users !== 'string' && (
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-semibold">{u.displayName}{u.id === selfId && s.self}</span>
              <span className="text-xs text-muted">{u.identities.map((i) => `${i.provider}:${i.username ?? '?'}`).join('、')}</span>
              {u.id === selfId ? <span className="text-sm text-muted">{s.roles[u.role]}</span> : (
                <>
                  <select className="input" aria-label={s.roleFor(u.displayName)} value={u.role} disabled={busy}
                    onChange={(e) => void act(() => api.setRole(u.id, e.target.value as Role))}>
                    {ROLES.map((r) => <option key={r} value={r}>{s.roles[r]}</option>)}
                  </select>
                  {banButton(u)}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
