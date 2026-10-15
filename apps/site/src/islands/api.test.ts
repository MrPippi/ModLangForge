import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend, loadMe, resetMe } from './api';

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const me = { ok: true, data: { user: null, csrfToken: 'tok' } };

beforeEach(() => resetMe());

describe('api client', () => {
  it('maps envelopes and network errors', async () => {
    expect(await apiGet('/x', vi.fn(async (_url: string, _init?: RequestInit) => res({ ok: true, data: 1 })))).toEqual({ ok: true, data: 1 });
    expect(await apiGet('/x', vi.fn(async (_url: string, _init?: RequestInit) => res({ ok: false, error: { code: 'forbidden', message: '不行' } }, 403)))).toEqual({ ok: false, code: 'forbidden', message: '不行' });
    expect(await apiGet('/x', vi.fn(async (_url: string, _init?: RequestInit) => { throw new Error('offline'); }))).toMatchObject({ ok: false, code: 'network' });
    expect(await apiGet('/x', vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })))).toMatchObject({ ok: false, code: 'network' });
  });

  it('sends the CSRF token from /api/v1/me and caches it', async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => (url === '/api/v1/me' ? res(me) : res({ ok: true, data: { done: true } })));
    await apiSend('/api/v1/a', 'POST', { x: 1 }, fetchImpl);
    await apiSend('/api/v1/b', 'DELETE', undefined, fetchImpl);
    expect(fetchImpl.mock.calls.filter(([u]) => u === '/api/v1/me')).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls.find(([u]) => u === '/api/v1/a')!;
    expect(init).toMatchObject({ method: 'POST', body: '{"x":1}', headers: { 'X-CSRF-Token': 'tok' } });
  });

  it('does not cache a failed /api/v1/me', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => { throw new Error('offline'); });
    expect((await loadMe(fetchImpl)).ok).toBe(false);
    await loadMe(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
