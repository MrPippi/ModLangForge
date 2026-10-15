import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { testEnv } from './testEnv';

describe('app', () => {
  it('returns a JSON 404 envelope for unknown API paths', async () => {
    const res = await createApp({}).request('/api/v1/suggestions/nope', {}, testEnv({ DB: {} as D1Database }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found', message: '找不到這個 API。' } });
  });

  it('falls through to static assets for non-API paths', async () => {
    const res = await createApp({}).request('/mods/create/', {}, testEnv({ DB: {} as D1Database }));
    expect(await res.text()).toBe('asset:/mods/create/');
  });
});
