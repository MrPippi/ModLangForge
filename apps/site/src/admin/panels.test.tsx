import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { createAdminApi } from './adminApi';
import BlocksPanel from './BlocksPanel';
import PublishPanel from './PublishPanel';
import { failure, routeFetch } from './testFetch';
import { clearModNames } from './useModNames';
import UsersPanel from './UsersPanel';

beforeEach(() => {
  resetMe();
  clearModNames();
});

const summary = { approved: 2, mods: [{ modId: 'create', count: 2 }], statusChanges: [{ id: 1, modId: 'create', status: 'reviewed' }] };

describe('PublishPanel', () => {
  it('shows the summary, confirms, publishes and reports the commit and remaining mods', async () => {
    let published = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => (published ? { approved: 0, mods: [], statusChanges: [] } : summary),
      'POST /api/v1/admin/publish': () => { published = true; return { commitSha: 'abcdef1234', applied: 2, conflicts: 0, superseded: 0, remainingMods: 3 }; },
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    expect(await screen.findByText('已核准待發佈：2 條')).toBeInTheDocument();
    expect(screen.getByText(/create → 已校對/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '發佈到 GitHub' }));
    expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: '確定發佈' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已發佈 2 條（commit abcdef1）');
    expect(screen.getByRole('status')).toHaveTextContent('還有 3 個模組待下次發佈。');
    expect(await screen.findByText('目前沒有可發佈的變更。')).toBeInTheDocument();
  });

  it('labels pending status changes in Chinese', async () => {
    const statusChanges = [{ id: 1, modId: 'create', status: 'reviewed' }, { id: 2, modId: 'jei', status: 'partial' }];
    const fetchImpl = routeFetch({ 'GET /api/v1/admin/publish': () => ({ approved: 0, mods: [], statusChanges }) });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    expect(await screen.findByText('create → 已校對')).toBeInTheDocument();
    expect(screen.getByText('jei → 部分完成')).toBeInTheDocument();
  });

  it('withdraws a pending status change and reloads the summary', async () => {
    let withdrawn = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => (withdrawn ? { approved: 0, mods: [], statusChanges: [] } : { approved: 0, mods: [], statusChanges: [{ id: 4, modId: 'create', status: 'reviewed' }] }),
      'DELETE /api/v1/admin/mods/status-changes/4': () => { withdrawn = true; return { id: 4 }; },
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '撤回 create 的狀態變更' }));
    expect(await screen.findByRole('status')).toHaveTextContent('已撤回模組狀態變更。');
    expect(await screen.findByText('目前沒有可發佈的變更。')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/mods/status-changes/4');
      expect(call?.[1]).toMatchObject({ method: 'DELETE', headers: { 'X-CSRF-Token': 'csrf' } });
    });
  });

  it('still shows the publish result when the summary reload fails', async () => {
    let published = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => (published ? failure('internal', 'boom', 500) : summary),
      'POST /api/v1/admin/publish': () => { published = true; return failure('publish_lock_lost', '已推送 commit，但無法更新狀態。', 409); },
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '發佈到 GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: '確定發佈' }));
    await waitFor(() => expect(screen.getByText('載入失敗，請稍後再試。')).toBeInTheDocument());
    expect(screen.getByText('已推送 commit，但無法更新狀態。')).toBeInTheDocument();
  });

  it('shows publish errors', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => summary,
      'POST /api/v1/admin/publish': () => failure('main_moved', 'main 分支同時有其他更新，未發佈任何變更，請稍後再試。', 409),
    });
    render(<PublishPanel api={createAdminApi(fetchImpl as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '發佈到 GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: '確定發佈' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('main 分支');
  });

  it('does not publish twice while a publish is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/publish': () => summary,
      'POST /api/v1/admin/publish': () => ({ commitSha: null, applied: 0, conflicts: 0, superseded: 0, remainingMods: 0 }),
    });
    const slow = async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/admin/publish')) await gate;
      return fetchImpl(url, init);
    };
    render(<PublishPanel api={createAdminApi(slow as never)} />);
    await userEvent.click(await screen.findByRole('button', { name: '發佈到 GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: '確定發佈' }));
    expect(screen.getByRole('button', { name: '發佈中…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '發佈中…' }));
    release();
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(fetchImpl.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  });
});

describe('UsersPanel', () => {
  const users = [
    { id: 1, displayName: '管理員', role: 'admin', banned: false, isPublic: true, createdAt: '', identities: [{ provider: 'github', username: 'MrPippi' }], reviewMods: [] },
    { id: 2, displayName: '史蒂夫', role: 'contributor', banned: false, isPublic: true, createdAt: '', identities: [{ provider: 'discord', username: 'steve' }], reviewMods: [] },
  ];

  it('changes roles and bans others (with confirm) but offers no controls for yourself', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/users': () => ({ users }),
      'POST /api/v1/admin/users/2/role': () => ({ id: 2, role: 'reviewer' }),
      'POST /api/v1/admin/users/2/ban': () => ({ id: 2, banned: true }),
    });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} selfId={1} />);
    expect(await screen.findByText('github:MrPippi')).toBeInTheDocument();
    expect(screen.queryByLabelText('管理員 的角色')).toBeNull();
    expect(screen.queryByRole('button', { name: '停權 管理員' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('史蒂夫 的角色'), 'reviewer');
    await waitFor(() => expect(screen.getByRole('button', { name: '停權 史蒂夫' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '停權 史蒂夫' }));
    expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/users/2/ban')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: '確定停權 史蒂夫' }));
    await waitFor(() => {
      expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/users/2/role')?.[1]?.body).toBe('{"role":"reviewer"}');
      expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/users/2/ban')?.[1]?.body).toBe('{"banned":true}');
    });
  });

  it('assigns mods to a reviewer with the icon checklist', async () => {
    const reviewer = { ...users[1], role: 'reviewer', reviewMods: [] as string[] };
    let saved = false;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/users': () => ({ users: [users[0], saved ? { ...reviewer, reviewMods: ['create'] } : reviewer] }),
      'GET /api/v1/index.json': () => ({ ok: true, status: 200, json: async () => ({ mods: [
        { modId: 'create', name: 'Create', icon: '/mod-icons/create.webp' }, { modId: 'jei', name: 'Just Enough Items', icon: null },
      ] }) }),
      'POST /api/v1/admin/users/2/review-mods': () => { saved = true; return { id: 2, reviewMods: ['create'] }; },
    });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} selfId={1} />);
    expect(await screen.findByText('負責模組：全部模組')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '設定 史蒂夫 負責的模組' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Create/ }));
    expect(screen.getByText('已選 1 個模組')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('已更新負責模組。')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/users/2/review-mods')?.[1]?.body).toBe('{"modIds":["create"]}');
    expect(await screen.findByText('Create')).toBeInTheDocument();
  });

  it('searches', async () => {
    const fetchImpl = routeFetch({ 'GET /api/v1/admin/users': () => ({ users: [] }) });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} selfId={1} />);
    await userEvent.type(await screen.findByLabelText('搜尋使用者'), 'steve{Enter}');
    await waitFor(() => expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/users?q=steve')).toBe(true));
  });

  it('shows server errors as text', async () => {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/users': () => ({ users }),
      'POST /api/v1/admin/users/2/role': () => failure('last_admin', '不能移除最後一位管理員。', 409),
    });
    render(<UsersPanel api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} selfId={1} />);
    await userEvent.selectOptions(await screen.findByLabelText('史蒂夫 的角色'), 'reviewer');
    expect(await screen.findByRole('alert')).toHaveTextContent('不能移除最後一位管理員。');
  });
});

describe('BlocksPanel', () => {
  it('adds and removes blocks', async () => {
    const subject = `ip:${'b'.repeat(64)}`;
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/blocks': () => ({ blocks: [{ subject, reason: '洗版', createdAt: '2026-10-15T00:00:00.000Z' }] }),
      'POST /api/v1/admin/blocks': () => ({ subject: 'user:5' }),
      [`DELETE /api/v1/admin/blocks/${encodeURIComponent(subject)}`]: () => ({ removed: true }),
    });
    render(<BlocksPanel api={createAdminApi(fetchImpl as never)} />);
    const row = (await screen.findByText(subject)).closest('li');
    expect(row).not.toBeNull();
    await userEvent.type(screen.getByLabelText('主體（ip:… 或 user:…）'), 'user:5');
    await userEvent.type(screen.getByLabelText('理由（選填）'), '測試');
    await userEvent.click(screen.getByRole('button', { name: '新增封鎖' }));
    await waitFor(() => expect(fetchImpl.mock.calls.find(([u, i]) => u === '/api/v1/admin/blocks' && i?.method === 'POST')?.[1]?.body).toBe('{"subject":"user:5","reason":"測試"}'));
    await userEvent.click(within(row!).getByRole('button', { name: `解除封鎖 ${subject}` }));
    await waitFor(() => expect(fetchImpl.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(true));
  });
});
