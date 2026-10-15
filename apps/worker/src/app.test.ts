import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { readJson, testDeps } from './testDeps';
import { testEnv } from './testEnv';

const env = () => testEnv({ DB: {} as D1Database });

afterEach(() => vi.restoreAllMocks());

describe('app', () => {
  it('returns a JSON 404 envelope with no-store for unknown API paths', async () => {
    const res = await createApp(testDeps()).request('/api/v1/suggestions/nope', {}, env());
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found', message: '找不到這個 API。' } });
  });

  it('falls through to static assets for non-API paths', async () => {
    const res = await createApp(testDeps()).request('/mods/create/', {}, env());
    expect(await res.text()).toBe('asset:/mods/create/');
  });

  it('answers 405 with Allow for the wrong method on a POST route', async () => {
    const res = await createApp(testDeps()).request('/api/v1/suggestions', {}, env());
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect((await readJson(res)).error.code).toBe('method_not_allowed');
  });

  it.each([
    ['TURNSTILE_SECRET', { TURNSTILE_SECRET: '' }],
    ['SESSION_SECRET', { SESSION_SECRET: '' }],
    ['SESSION_SECRET', { SESSION_SECRET: 'short' }],
  ])('returns 500 misconfigured without leaking %s', async (name, override) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await createApp(testDeps()).request('/api/v1/x', {}, testEnv({ DB: {} as D1Database, ...override }));
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await readJson(res);
    expect(body.error.code).toBe('misconfigured');
    expect(JSON.stringify(body)).not.toContain(name);
  });

  it('builds repos once per request', async () => {
    const repos = vi.fn(testDeps().repos);
    await createApp(testDeps({ repos })).request('/api/v1/nope', {}, env());
    expect(repos).toHaveBeenCalledTimes(1);
  });

  it('returns 500 internal with a generic message when a dependency throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp(testDeps({ repos: () => { throw new Error('kaboom'); } }));
    const res = await app.request('/api/v1/nope', {}, env());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'internal', message: '伺服器發生錯誤，請稍後再試。' } });
  });
});
