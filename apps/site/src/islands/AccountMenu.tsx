import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n/zh-TW';
import { ME_CHANGED_EVENT } from '../me/meApi';
import { apiSend, loadMe, resetMe, type ApiResult, type FetchLike, type Me } from './api';
import MySuggestions from './MySuggestions';

const PROVIDERS = [
  { id: 'discord', label: 'Discord' },
  { id: 'github', label: 'GitHub' },
] as const;

const ERRORS: Readonly<Record<string, string>> = t.account.errors;
const LOGOUT_PATH = '/api/v1/auth/logout';

function startUrl(provider: string, link: boolean): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  const params = new URLSearchParams({ returnTo: `${url.pathname}${url.search}` });
  if (link) params.set('link', '1');
  return `/api/v1/auth/${provider}/start?${params.toString()}`;
}

function removeAuthErrorParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth_error');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function AuthError() {
  const [code] = useState(() => new URLSearchParams(window.location.search).get('auth_error'));
  // 顯示一次後從網址移除，重新整理或分享連結時不會再出現
  useEffect(() => {
    if (code !== null) removeAuthErrorParam();
  }, [code]);
  if (!code) return null;
  return <p role="alert" className="absolute right-0 mt-1 w-56 text-xs text-danger">{Object.hasOwn(ERRORS, code) ? ERRORS[code] : ERRORS.default}</p>;
}

/** CSRF cookie 過期（bad_csrf）時重新取得 token 再試一次 */
async function logoutWithRetry(fetchImpl: FetchLike): Promise<ApiResult<unknown>> {
  const first = await apiSend(LOGOUT_PATH, 'POST', {}, fetchImpl);
  if (first.ok || first.code !== 'bad_csrf') return first;
  resetMe();
  return apiSend(LOGOUT_PATH, 'POST', {}, fetchImpl);
}

/** 開啟時：Escape 關閉並把焦點還給 summary；點選單外關閉 */
function useMenuDismiss(open: boolean, close: () => void, root: RefObject<HTMLDivElement | null>, summary: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      summary.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close, root, summary]);
}

function useMe(fetchImpl: FetchLike) {
  const [me, setMe] = useState<Me | null>(null);
  const reload = useCallback(async () => {
    const result = await loadMe(fetchImpl);
    if (result.ok) setMe(result.data);
  }, [fetchImpl]);
  useEffect(() => {
    let alive = true;
    void loadMe(fetchImpl).then((result) => {
      if (alive && result.ok) setMe(result.data);
    });
    const onChanged = () => void reload();
    window.addEventListener(ME_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(ME_CHANGED_EVENT, onChanged);
    };
  }, [fetchImpl, reload]);
  return { me, reload };
}

interface PanelProps {
  readonly user: Me['user'];
  readonly logoutError: string | null;
  readonly onOpenMine: () => void;
  readonly onLogout: () => void;
}

function MenuPanel({ user, logoutError, onOpenMine, onLogout }: PanelProps) {
  const linked = new Set(user?.identities.map((i) => i.provider) ?? []);
  return (
    <div className="absolute right-0 z-40 mt-1 flex w-56 flex-col gap-2 rounded-sm border-2 border-line-strong bg-surface p-3">
      {!user && PROVIDERS.map((p) => <a key={p.id} className="link" href={startUrl(p.id, false)}>{t.account.loginWith(p.label)}</a>)}
      {user && <a className="link" href="/me/">{t.account.profile}</a>}
      <button type="button" className="link text-left" onClick={onOpenMine}>{t.account.mySuggestions}</button>
      {user && PROVIDERS.filter((p) => !linked.has(p.id)).map((p) => <a key={p.id} className="link" href={startUrl(p.id, true)}>{t.account.linkWith(p.label)}</a>)}
      {user && user.role !== 'contributor' && <a className="link" href="/admin/">{t.account.admin}</a>}
      {user && <button type="button" className="link text-left" onClick={onLogout}>{t.account.logout}</button>}
      {logoutError && <p role="alert" className="text-xs text-danger">{logoutError}</p>}
    </div>
  );
}

export default function AccountMenu({ fetchImpl = fetch }: { readonly fetchImpl?: FetchLike }) {
  const { me, reload } = useMe(fetchImpl);
  const [open, setOpen] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const closeMine = useCallback(() => setShowMine(false), []);
  useMenuDismiss(open, close, root, summary);

  const logout = async () => {
    setLogoutError(null);
    const result = await logoutWithRetry(fetchImpl);
    if (!result.ok) return setLogoutError(result.message);
    setOpen(false);
    resetMe();
    await reload();
    // 讓同頁其他島（例如 /me/）也回到登出狀態
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
  };
  const openMine = () => {
    setOpen(false);
    setShowMine(true);
  };

  if (!me) return null;
  const user = me.user;
  return (
    <div ref={root} className="relative text-sm">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary ref={summary} className="flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-muted hover:bg-surface-2 hover:text-fg">
          {user ? user.displayName : t.account.login}
        </summary>
        <MenuPanel user={user} logoutError={logoutError} onOpenMine={openMine} onLogout={() => void logout()} />
      </details>
      <AuthError />
      {showMine && <MySuggestions fetchImpl={fetchImpl} loggedIn={user !== null} onClose={closeMine} />}
    </div>
  );
}
