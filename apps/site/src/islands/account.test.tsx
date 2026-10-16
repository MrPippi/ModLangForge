import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountMenu from './AccountMenu';
import { resetMe } from './api';
import { ME_CHANGED_EVENT } from '../me/meApi';
import { failure } from '../admin/testFetch';

const res = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
const anon = { user: null, csrfToken: 'csrf' };
const admin = { user: { id: 1, displayName: '管理員', role: 'admin', identities: [{ provider: 'github', username: 'MrPippi' }] }, csrfToken: 'csrf' };

beforeEach(() => resetMe());
afterEach(() => window.history.pushState({}, '', '/'));

describe('AccountMenu', () => {
  it('offers both providers to anonymous visitors with the current page as returnTo', async () => {
    window.history.pushState({}, '', '/mods/create/?auth_error=cancelled');
    render(<AccountMenu fetchImpl={vi.fn(async () => res(anon)) as never} />);
    await userEvent.click(await screen.findByText('登入'));
    expect(screen.getByRole('link', { name: '以 Discord 登入' })).toHaveAttribute('href', '/api/v1/auth/discord/start?returnTo=%2Fmods%2Fcreate%2F');
    expect(screen.getByRole('link', { name: '以 GitHub 登入' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('已取消登入。');
  });

  it('shows admin link and unlinked providers, then logs out with the CSRF token', async () => {
    let meCalls = 0;
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/v1/me') return res(meCalls++ === 0 ? admin : anon);
      return res({ loggedOut: true });
    });
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    expect(screen.getByRole('link', { name: '管理後台' })).toHaveAttribute('href', '/admin/');
    expect(screen.getByRole('link', { name: '綁定 Discord' })).toHaveAttribute('href', expect.stringContaining('link=1'));
    expect(screen.queryByRole('link', { name: '綁定 GitHub' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByText('登入')).toBeInTheDocument();
    const logout = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/auth/logout');
    expect(logout?.[1]).toMatchObject({ method: 'POST', headers: { 'X-CSRF-Token': 'csrf' } });
  });

  it('announces the change after logging out so other islands reload', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === '/api/v1/me' ? res(admin) : res({ loggedOut: true })));
    const onChange = vi.fn();
    window.addEventListener(ME_CHANGED_EVENT, onChange);
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    window.removeEventListener(ME_CHANGED_EVENT, onChange);
  });

  it('lists my suggestions with readable statuses and closes on Escape', async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/api/v1/me/suggestions'
        ? res({ suggestions: [{ id: 3, modId: 'create', key: 'a', proposed: '齒輪', status: 'rejected', reviewNote: '用詞不一致', createdAt: '', reviewedAt: '' }] })
        : res(anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('登入'));
    await userEvent.click(screen.getByRole('button', { name: '我的建議' }));
    const dialog = await screen.findByRole('dialog', { name: '我的建議' });
    expect(dialog).toHaveTextContent('齒輪');
    expect(dialog).toHaveTextContent('已退回：用詞不一致');
    expect(dialog.closest('details')).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  const detailsOf = () => document.querySelector('details');

  it('links logged-in users to /me/', async () => {
    render(<AccountMenu fetchImpl={vi.fn(async () => res(admin)) as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    expect(screen.getByRole('link', { name: '個人資料' })).toHaveAttribute('href', '/me/');
  });

  it('closes the menu on Escape, outside clicks and after opening my suggestions', async () => {
    const fetchImpl = vi.fn(async (url: string) => res(url === '/api/v1/me/suggestions' ? { suggestions: [] } : anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('登入'));
    await waitFor(() => expect(detailsOf()).toHaveAttribute('open'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(detailsOf()).not.toHaveAttribute('open'));
    expect(document.activeElement?.tagName).toBe('SUMMARY');
    await userEvent.click(screen.getByText('登入'));
    await waitFor(() => expect(detailsOf()).toHaveAttribute('open'));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(detailsOf()).not.toHaveAttribute('open'));
    await userEvent.click(screen.getByText('登入'));
    await userEvent.click(screen.getByRole('button', { name: '我的建議' }));
    expect(await screen.findByRole('dialog', { name: '我的建議' })).toBeInTheDocument();
    expect(detailsOf()).not.toHaveAttribute('open');
  });

  it('retries logout once with a fresh CSRF token after bad_csrf', async () => {
    const meReplies = [{ ...admin, csrfToken: 'old' }, { ...admin, csrfToken: 'new' }, anon];
    let logoutCalls = 0;
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === '/api/v1/me') return res(meReplies.shift() ?? anon);
      logoutCalls += 1;
      return logoutCalls === 1 ? failure('bad_csrf', '頁面已過期，請重新整理後再試。', 403) : res({ loggedOut: true });
    });
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByText('登入')).toBeInTheDocument();
    const tokens = fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/auth/logout').map(([, i]) => (i?.headers as Record<string, string>)['X-CSRF-Token']);
    expect(tokens).toEqual(['old', 'new']);
  });

  it('shows why logout failed', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === '/api/v1/me' ? res(admin) : failure('internal', '伺服器發生錯誤，請稍後再試。', 500)));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    await userEvent.click(await screen.findByText('管理員'));
    await userEvent.click(screen.getByRole('button', { name: '登出' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('伺服器發生錯誤，請稍後再試。');
    expect(screen.getByText('管理員')).toBeInTheDocument();
  });

  it('removes auth_error from the address after showing it', async () => {
    window.history.pushState({}, '', '/mods/create/?auth_error=cancelled&x=1#top');
    render(<AccountMenu fetchImpl={vi.fn(async () => res(anon)) as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('已取消登入。');
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe('/mods/create/?x=1#top'));
  });

  it('reloads the user when the profile changes elsewhere on the page', async () => {
    const replies = [admin, { ...admin, user: { ...admin.user, displayName: '新名字' } }];
    const fetchImpl = vi.fn(async () => res(replies.shift() ?? anon));
    render(<AccountMenu fetchImpl={fetchImpl as never} />);
    expect(await screen.findByText('管理員')).toBeInTheDocument();
    resetMe();
    window.dispatchEvent(new Event(ME_CHANGED_EVENT));
    expect(await screen.findByText('新名字')).toBeInTheDocument();
  });
});
