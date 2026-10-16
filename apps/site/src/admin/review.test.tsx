import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import AdminApp from './AdminApp';
import type { AdminSuggestion } from './adminApi';
import { groupSuggestions } from './group';
import { clearModCache } from './modStrings';
import { ADMIN_ME, failure, REVIEWER_ME, routeFetch } from './testFetch';

const item = (over: Partial<AdminSuggestion> = {}): AdminSuggestion => ({
  id: 1, modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', note: '更自然', formatWarning: false, status: 'pending',
  authorUserId: null, authorName: null, authorSubject: `ip:${'a'.repeat(64)}`, reviewNote: null, createdAt: '2026-10-15T00:00:00.000Z', reviewedAt: null, ...over,
});
const MOD = { en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' } };

beforeEach(() => {
  resetMe();
  clearModCache();
});

describe('groupSuggestions', () => {
  it('groups by mod then key, keeping order', () => {
    const groups = groupSuggestions([item(), item({ id: 2 }), item({ id: 3, key: 'b' }), item({ id: 4, modId: 'jei' })]);
    expect(groups.map((g) => [g.modId, g.keys.map((k) => [k.key, k.items.map((x) => x.id)])])).toEqual([
      ['create', [['a', [1, 2]], ['b', [3]]]],
      ['jei', [['a', [4]]]],
    ]);
  });
});

describe('AdminApp access', () => {
  it.each([
    [{ user: null, csrfToken: 'c' }, '請先從右上角登入。'],
    [{ user: { id: 3, displayName: 'C', role: 'contributor', identities: [] }, csrfToken: 'c' }, '你沒有審核權限。'],
  ])('blocks %j', async (me, text) => {
    render(<AdminApp fetchImpl={routeFetch({}, me) as never} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows only review tabs to reviewers and all tabs to admins', async () => {
    const routes = { 'GET /api/v1/admin/suggestions': () => ({ suggestions: [] }) };
    const { unmount } = render(<AdminApp fetchImpl={routeFetch(routes, REVIEWER_ME) as never} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['審核', '直接編輯']);
    unmount();
    resetMe();
    render(<AdminApp fetchImpl={routeFetch(routes, ADMIN_ME) as never} />);
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['審核', '直接編輯', '發佈', '使用者', '封鎖']);
  });
});

describe('ReviewQueue', () => {
  function mount(list: AdminSuggestion[], extra: Record<string, (url: string, init?: RequestInit) => unknown> = {}, me: unknown = ADMIN_ME) {
    const fetchImpl = routeFetch({
      'GET /api/v1/admin/suggestions': () => ({ suggestions: list }),
      'GET /api/v1/mods/create.json': () => ({ ok: true, status: 200, json: async () => MOD }),
      ...extra,
    }, me);
    render(<AdminApp fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  it('groups suggestions for the same key side by side with the source text', async () => {
    mount([item(), item({ id: 2, proposed: '青蘋果', authorName: 'Alice' })]);
    expect(await screen.findByRole('heading', { name: /create/ })).toBeInTheDocument();
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => c.querySelector('p')?.textContent)).toEqual(['紅蘋果', '青蘋果']);
    expect(within(cards[1]!).getByText(/Alice/)).toBeInTheDocument();
  });

  it('approves, then reloads the queue', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/approve': () => ({ id: 1 }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '核准' }));
    expect(await screen.findByText('已核准。')).toBeInTheDocument();
    await waitFor(() => {
      const approve = fetchImpl.mock.calls.find(([u]) => u.endsWith('/approve'));
      expect(approve?.[1]).toMatchObject({ method: 'POST', body: '{}', headers: { 'X-CSRF-Token': 'csrf' } });
      expect(fetchImpl.mock.calls.filter(([u]) => u.startsWith('/api/v1/admin/suggestions?')).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('approves an edited text', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/approve': () => ({ id: 1 }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '修改後核准' }));
    const box = within(card).getByLabelText('核准用譯文');
    await userEvent.clear(box);
    await userEvent.type(box, '大紅蘋果');
    await userEvent.click(within(card).getByRole('button', { name: '確認核准' }));
    await waitFor(() => {
      const approve = fetchImpl.mock.calls.find(([u]) => u.endsWith('/approve'));
      expect(approve?.[1]?.body).toBe('{"proposed":"大紅蘋果"}');
    });
  });

  it('rejects with a reason and shows server errors', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/suggestions/1/reject': () => failure('not_pending', '這條建議已被處理。', 409) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '退回' }));
    await userEvent.type(within(card).getByLabelText('退回理由（選填）'), '用詞不一致');
    await userEvent.click(within(card).getByRole('button', { name: '確認退回' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('這條建議已被處理。');
    await waitFor(() => {
      expect(fetchImpl.mock.calls.find(([u]) => u.endsWith('/reject'))?.[1]?.body).toBe('{"reason":"用詞不一致"}');
    });
  });

  it('lets admins block the author subject', async () => {
    const fetchImpl = mount([item()], { 'POST /api/v1/admin/blocks': () => ({ subject: 'x' }) });
    const card = await screen.findByRole('article', { name: '建議 #1' });
    await userEvent.click(within(card).getByRole('button', { name: '封鎖此來源' }));
    await waitFor(() => {
      const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/blocks');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ subject: `ip:${'a'.repeat(64)}`, reason: '由建議 #1 封鎖' });
    });
  });

  it('hides the block button from reviewers', async () => {
    mount([item()], {}, REVIEWER_ME);
    const card = await screen.findByRole('article', { name: '建議 #1' });
    expect(within(card).queryByRole('button', { name: '封鎖此來源' })).not.toBeInTheDocument();
  });

  it('filters by status and mod', async () => {
    const fetchImpl = mount([]);
    expect(await screen.findByText('沒有符合的建議。')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('狀態'), 'conflict');
    await userEvent.type(screen.getByLabelText('模組 ID'), 'jei');
    await userEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => {
      expect(fetchImpl.mock.calls.some(([u]) => u === '/api/v1/admin/suggestions?status=conflict&modId=jei')).toBe(true);
    });
  });
});
