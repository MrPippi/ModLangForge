import { useCallback, useEffect, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { apiSend, loadMe, resetMe, type FetchLike, type Me } from './api';
import MySuggestions from './MySuggestions';

const PROVIDERS = [
  { id: 'discord', label: 'Discord' },
  { id: 'github', label: 'GitHub' },
] as const;

const ERRORS: Readonly<Record<string, string>> = t.account.errors;

function startUrl(provider: string, link: boolean): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  const params = new URLSearchParams({ returnTo: `${url.pathname}${url.search}` });
  if (link) params.set('link', '1');
  return `/api/v1/auth/${provider}/start?${params.toString()}`;
}

function AuthError() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));
  if (!code) return null;
  return <p role="alert" className="absolute right-0 mt-1 w-56 text-xs text-danger">{Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.default}</p>;
}

export default function AccountMenu({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const [me, setMe] = useState<Me | null>(null);
  const [showMine, setShowMine] = useState(false);
  const closeMine = useCallback(() => setShowMine(false), []);
  useEffect(() => {
    let alive = true;
    void loadMe(fetchImpl).then((result) => {
      if (alive && result.ok) setMe(result.data);
    });
    return () => { alive = false; };
  }, [fetchImpl]);

  const logout = async () => {
    const result = await apiSend('/api/v1/auth/logout', 'POST', {}, fetchImpl);
    if (!result.ok) return;
    resetMe();
    const next = await loadMe(fetchImpl);
    if (next.ok) setMe(next.data);
  };

  if (!me) return null;
  const user = me.user;
  const linked = new Set(user?.identities.map((i) => i.provider) ?? []);
  return (
    <div className="relative text-sm">
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-muted hover:bg-surface-2 hover:text-fg">
          {user ? user.displayName : t.account.login}
        </summary>
        <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-2 rounded-sm border-2 border-line-strong bg-surface p-3">
          {!user && PROVIDERS.map((p) => <a key={p.id} className="link" href={startUrl(p.id, false)}>{t.account.loginWith(p.label)}</a>)}
          <button type="button" className="link text-left" onClick={() => setShowMine(true)}>{t.account.mySuggestions}</button>
          {user && PROVIDERS.filter((p) => !linked.has(p.id)).map((p) => <a key={p.id} className="link" href={startUrl(p.id, true)}>{t.account.linkWith(p.label)}</a>)}
          {user && user.role !== 'contributor' && <a className="link" href="/admin/">{t.account.admin}</a>}
          {user && <button type="button" className="link text-left" onClick={() => void logout()}>{t.account.logout}</button>}
        </div>
      </details>
      <AuthError />
      {showMine && <MySuggestions fetchImpl={fetchImpl} loggedIn={user !== null} onClose={closeMine} />}
    </div>
  );
}
