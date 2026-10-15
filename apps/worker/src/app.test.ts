import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { readJson, testDeps } from './testDeps';
import { testEnv } from './testEnv';

const env = () => testEnv({ DB: {} as D1Database });

afterEach(() => vi.restoreAllMocks());

describe('app', () => {
  it('returns a JSON 404 envelope for unknown API paths', async () => {
    const res = await createApp(testDeps()).request('/api/v1/suggestions/nope', {}, env());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found', message: '找不到這個 API。' } });
  });

  it('falls through to static assets for non-API paths', async () => {
    const res = await createApp(testDeps()).request('/mods/create/', {}, env());
    expect(await res.text()).toBe('asset:/mods/create/');
  });

  it('returns 500 misconfigured without leaking the env var name', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await createApp(testDeps()).request('/api/v1/x', {}, testEnv({ DB: {} as D1Database, TURNSTILE_SECRET: '' }));
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('misconfigured');
    expect(body.error.message).not.toContain('TURNSTILE_SECRET');
  });

  it('returns 500 internal with a generic message when a handler throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp(testDeps({ loadMod: async () => { throw new Error('kaboom'); } }));
    const res = await app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { Origin: 'https://mlf.test' },
      body: JSON.stringify({ modId: 'create', key: 'a', proposed: 'x', turnstileToken: 't' }),
    }, env());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'internal', message: '伺服器發生錯誤，請稍後再試。' } });
  });
});
