import { useCallback, useEffect, useState } from 'react';
import { ModIcon } from '../components/ModIcon';
import type { ApiResult, FetchLike } from '../islands/api';
import type { AdminApi, AdminUser, Role } from './adminApi';
import ReviewModsEditor from './ReviewModsEditor';
import { s } from './strings';
import { useModList, type ModEntry } from './useModNames';

const ROLES = Object.keys(s.roles) as Role[];

function ScopeLine({ user, mods }: { readonly user: AdminUser; readonly mods: readonly ModEntry[] }) {
  if (user.reviewMods.length === 0) return <p className="text-sm">{s.reviewModsLabel}{s.allMods}</p>;
  const byId = new Map(mods.map((m) => [m.modId, m]));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span>{s.reviewModsLabel}</span>
      {user.reviewMods.map((id) => {
        const mod = byId.get(id);
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-sm border border-line bg-surface-2 py-0.5 pr-1.5 pl-0.5">
            <ModIcon src={mod?.icon ?? null} name={mod?.name ?? id} size={18} />{mod?.name ?? id}
          </span>
        );
      })}
    </div>
  );
}

export default function UsersPanel({ api, fetchImpl, selfId }: { readonly api: AdminApi; readonly fetchImpl: FetchLike; readonly selfId: number }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<readonly AdminUser[] | 'loading' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [banning, setBanning] = useState<number | null>(null);
  const [scoping, setScoping] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mods = useModList(fetchImpl);

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
    setNotice(null);
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

  const saveScope = async (u: AdminUser, modIds: readonly string[]) => {
    await act(async () => {
      const r = await api.setReviewMods(u.id, modIds);
      if (r.ok) {
        setScoping(null);
        setNotice(s.reviewModsSaved);
      }
      return r;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); void search(query.trim()); }}>
        <input className="input" aria-label={s.userSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-sm bg-primary-soft px-3 py-2 text-sm">{notice}</p>}
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
              {u.role === 'reviewer' && scoping !== u.id && (
                <div className="flex w-full flex-wrap items-center gap-2 border-t-2 border-line pt-2">
                  <div className="min-w-0 flex-1"><ScopeLine user={u} mods={mods} /></div>
                  {u.id !== selfId && (
                    <button type="button" className="link text-sm" disabled={busy} aria-label={s.reviewModsEditFor(u.displayName)} onClick={() => setScoping(u.id)}>{s.reviewModsEdit}</button>
                  )}
                </div>
              )}
              {u.role === 'reviewer' && scoping === u.id && (
                <ReviewModsEditor userName={u.displayName} mods={mods} initial={u.reviewMods} busy={busy}
                  onSave={(ids) => void saveScope(u, ids)} onCancel={() => setScoping(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
