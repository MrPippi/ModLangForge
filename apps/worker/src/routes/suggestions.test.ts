import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../app';
import { createMemoryRepo } from '../repo/memoryRepo';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

function setup(over: Partial<AppDeps> = {}) {
  const deps = testDeps({ verifyTurnstile: vi.fn(async () => true), ...over });
  const app = createApp(deps);
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://mlf.test', 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, testEnv({ DB: {} as D1Database }));
  return { post, deps };
}

const valid = { modId: 'create', key: 'a', proposed: '蘋果（%s）', turnstileToken: 'tok' };

describe('POST /api/v1/suggestions', () => {
  it('stores a valid suggestion', async () => {
    const res = await setup().post(valid);
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ ok: true, data: { id: 1, formatWarning: false } });
  });

  it('flags format warnings', async () => {
    const res = await setup().post({ ...valid, proposed: '蘋果' });
    expect((await readJson(res)).data.formatWarning).toBe(true);
  });

  it('accepts suggestions for untranslated keys', async () => {
    expect((await setup().post({ ...valid, key: 'b', proposed: '香蕉' })).status).toBe(201);
  });

  it.each([
    [403, 'bad_origin', valid, { Origin: 'https://evil.test' }],
    [400, 'invalid_body', 'not json', {}],
    [400, 'invalid_body', { ...valid, modId: 'Bad Id' }, {}],
    [404, 'mod_not_found', { ...valid, modId: 'nope' }, {}],
    [404, 'key_not_found', { ...valid, key: 'constructor' }, {}],
    [400, 'unchanged', { ...valid, proposed: '蘋果 %s' }, {}],
    [400, 'empty', { ...valid, proposed: ' ' }, {}],
  ] as const)('returns %i %s', async (status, code, body, headers) => {
    const res = await setup().post(body, headers);
    expect(res.status).toBe(status);
    expect((await readJson(res)).error.code).toBe(code);
  });

  it('rejects an empty Turnstile token as invalid_body', async () => {
    const res = await setup().post({ ...valid, turnstileToken: '' });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('invalid_body');
  });

  it('rejects an oversized body with 413 before touching the repo', async () => {
    const repo = createMemoryRepo();
    const upsert = vi.spyOn(repo, 'upsertPending');
    const count = vi.spyOn(repo, 'countRateEvents');
    const res = await setup({ repo: () => repo }).post({ ...valid, note: 'x'.repeat(20 * 1024) });
    expect(res.status).toBe(413);
    expect((await readJson(res)).error.code).toBe('too_large');
    expect(upsert).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('rejects when Turnstile fails', async () => {
    const res = await setup({ verifyTurnstile: vi.fn(async () => false) }).post(valid);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('turnstile_failed');
  });

  it('rejects blocked subjects', async () => {
    const { hashIp } = await import('../ipHash');
    const blocked = `ip:${await hashIp('test-salt', '1.2.3.4')}`;
    const repo = createMemoryRepo({ blocked: [blocked] });
    const res = await setup({ repo: () => repo }).post(valid);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('blocked');
  });

  it('rate limits after 30 per hour per subject', async () => {
    const { post } = setup();
    for (let i = 0; i < 30; i += 1) expect((await post({ ...valid, proposed: `蘋果${i} %s` })).status).toBe(201);
    const res = await post({ ...valid, proposed: '最後 %s' });
    expect(res.status).toBe(429);
    expect((await readJson(res)).error.code).toBe('rate_limited');
  });

  it('works without CF-Connecting-IP', async () => {
    const res = await setup().post(valid, { 'CF-Connecting-IP': '' });
    expect(res.status).toBe(201);
  });

  it('overwrites the same author pending suggestion', async () => {
    const { post } = setup();
    const first = await readJson(await post(valid));
    const second = await readJson(await post({ ...valid, proposed: '青蘋果 %s' }));
    expect(second.data.id).toBe(first.data.id);
  });

  it('returns a generic 500 when a dependency throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup({ loadMod: async () => { throw new Error('secret detail'); } }).post(valid);
    spy.mockRestore();
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('secret detail');
  });
});
