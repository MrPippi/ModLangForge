import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMe } from '../islands/api';
import { createAdminApi, type AdminSuggestion } from './adminApi';
import DirectEditor from './DirectEditor';
import { buildHits, latestApproved } from './editorHits';
import { clearModCache } from './modStrings';
import { failure, routeFetch } from './testFetch';

const strings = { en: { a: 'Apple', b: 'Banana', constructor: 'Ctor' }, zh: { a: '蘋果' } };
const approved = (over: Partial<AdminSuggestion>): AdminSuggestion => ({
  id: 1, modId: 'create', key: 'a', baseTarget: null, proposed: 'x', note: null, formatWarning: false, status: 'approved',
  authorUserId: null, authorName: null, authorSubject: 'ip:x', reviewNote: null, createdAt: '2026-10-01T00:00:00.000Z', reviewedAt: '2026-10-02T00:00:00.000Z', ...over,
});

// jsdom 沒有版面：給所有元素固定尺寸，讓虛擬捲動渲染列
vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
  x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1024, width: 1024, height: 800, toJSON: () => ({}),
} as DOMRect);
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1024 });

const delayed = (gate: Promise<void>, data: unknown) => ({
  ok: true, status: 200, json: async () => { await gate; return { ok: true, data }; },
});

beforeEach(() => {
  resetMe();
  clearModCache();
});

describe('buildHits', () => {
  it('overlays approved edits and never reads prototype properties', () => {
    const hits = buildHits('create', strings, { b: '香蕉' }, '');
    expect(hits.map((h) => [h.entry.key, h.entry.target, h.entry.status])).toEqual([
      ['a', '蘋果', 'translated'],
      ['b', '香蕉', 'translated'],
      ['constructor', '', 'untranslated'],
    ]);
  });

  it('filters by key, source or target', () => {
    expect(buildHits('create', strings, {}, 'banan').map((h) => h.entry.key)).toEqual(['b']);
    expect(buildHits('create', strings, {}, '蘋').map((h) => h.entry.key)).toEqual(['a']);
  });
});

describe('latestApproved', () => {
  it('orders by (reviewedAt ?? createdAt, id) like publish', () => {
    expect(latestApproved([approved({ id: 1, proposed: '舊' }), approved({ id: 2, proposed: '新' })])).toEqual({ a: '新' });
  });

  it('prefers the later reviewedAt even when its id is lower', () => {
    const list = [
      approved({ id: 5, proposed: '較早核准', reviewedAt: '2026-10-02T00:00:00.000Z' }),
      approved({ id: 3, proposed: '較晚核准', reviewedAt: '2026-10-03T00:00:00.000Z' }),
    ];
    expect(latestApproved(list)).toEqual({ a: '較晚核准' });
  });

  it('falls back to createdAt when reviewedAt is missing', () => {
    const list = [
      approved({ id: 1, proposed: '甲', reviewedAt: null, createdAt: '2026-10-05T00:00:00.000Z' }),
      approved({ id: 2, proposed: '乙', reviewedAt: '2026-10-04T00:00:00.000Z' }),
    ];
    expect(latestApproved(list)).toEqual({ a: '甲' });
  });
});

describe('DirectEditor', () => {
  function mount(extra: Record<string, (url: string, init?: RequestInit) => unknown> = {}) {
    const fetchImpl = routeFetch({
      'GET /api/v1/mods/create.json': () => ({ ok: true, status: 200, json: async () => ({ en_us: { a: 'Apple', b: 'Banana' }, zh_tw: { a: '蘋果' } }) }),
      'GET /api/v1/admin/suggestions': () => ({ suggestions: [] }),
      'POST /api/v1/admin/edits': () => ({ id: 9, formatWarning: false }),
      'POST /api/v1/admin/mods/create/status': () => ({ id: 3 }),
      ...extra,
    });
    render(<DirectEditor api={createAdminApi(fetchImpl as never)} fetchImpl={fetchImpl as never} />);
    return fetchImpl;
  }

  async function open() {
    await userEvent.type(screen.getByLabelText('要編輯的模組 ID'), 'create');
    await userEvent.click(screen.getByRole('button', { name: '開啟' }));
  }

  it('saves an edit as a direct edit', async () => {
    const fetchImpl = mount();
    await open();
    const box = await screen.findByLabelText('譯文 (zh_tw) b');
    await userEvent.type(box, '香蕉');
    await userEvent.tab();
    expect(await screen.findByText('已暫存 b，發佈後生效。')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/edits');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ modId: 'create', key: 'b', proposed: '香蕉' });
    });
  });

  it('shows server errors for rejected edits', async () => {
    mount({ 'POST /api/v1/admin/edits': () => failure('empty', '譯文不能是空白。') });
    await open();
    const box = await screen.findByLabelText('譯文 (zh_tw) a');
    await userEvent.clear(box);
    await userEvent.tab();
    expect(await screen.findByRole('alert')).toHaveTextContent('譯文不能是空白。');
  });

  it('reports an unknown mod', async () => {
    mount({ 'GET /api/v1/mods/create.json': () => ({ ok: false, status: 404, json: async () => ({}) }) });
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('找不到這個模組。');
  });

  it('queues a mod status change', async () => {
    const fetchImpl = mount();
    await open();
    await userEvent.selectOptions(await screen.findByLabelText('模組狀態'), 'partial');
    await userEvent.click(screen.getByRole('button', { name: '排入發佈' }));
    expect(await screen.findByText('已排入下次發佈。')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchImpl.mock.calls.find(([u]) => u === '/api/v1/admin/mods/create/status')?.[1]?.body).toBe('{"status":"partial"}');
    });
  });

  it('disables the status button while the request is pending', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = mount({ 'POST /api/v1/admin/mods/create/status': () => delayed(gate, { id: 3 }) });
    await open();
    const button = await screen.findByRole('button', { name: '排入發佈' });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await userEvent.click(button);
    release();
    expect(await screen.findByText('已排入下次發佈。')).toBeInTheDocument();
    expect(button).toBeEnabled();
    await waitFor(() => expect(fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/admin/mods/create/status')).toHaveLength(1));
  });

  it('does not send duplicate writes for the same key while one is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = mount({ 'POST /api/v1/admin/edits': () => delayed(gate, { id: 9, formatWarning: false }) });
    await open();
    const box = await screen.findByLabelText('譯文 (zh_tw) b');
    await userEvent.type(box, '香蕉');
    await userEvent.tab();
    await userEvent.click(box);
    await userEvent.type(box, '!');
    await userEvent.tab();
    release();
    expect(await screen.findByText('已暫存 b，發佈後生效。')).toBeInTheDocument();
    expect(fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/admin/edits')).toHaveLength(1);
  });
});
