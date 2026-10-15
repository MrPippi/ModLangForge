import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountMenu from './AccountMenu';
import { resetMe } from './api';

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
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
