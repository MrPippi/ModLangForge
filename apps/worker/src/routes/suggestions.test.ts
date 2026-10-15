import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from '../app';
import { hashIp } from '../ipHash';
import { createD1Repos } from '../repo';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { createUser, writeHeaders } from '../testAuth';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);
afterEach(() => vi.restoreAllMocks());

function setup(over: Partial<AppDeps> = {}) {
  const deps = testDeps({ verifyTurnstile: vi.fn(async () => true), ...over });
  const app = createApp(deps);
  const post = async (body: unknown, headers: Record<string, string> = {}, user?: { id: number; sessionVersion: number }) =>
    app.request('/api/v1/suggestions', {
      method: 'POST',
      headers: { ...(await writeHeaders(user)), 'CF-Connecting-IP': '1.2.3.4', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, testEnv({ DB: db }));
  return { post, deps };
}

const countRows = async (table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;
const valid = { modId: 'create', key: 'a', proposed: '蘋果（%s）', turnstileToken: 'tok' };

describe('POST /api/v1/suggestions', () => {
  it('stores a valid suggestion', async () => {
    const res = await setup().post(valid);
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ ok: true, data: { id: expect.any(Number), formatWarning: false } });
  });

  it('flags format warnings', async () => {
    expect((await readJson(await setup().post({ ...valid, proposed: '蘋果' }))).data.formatWarning).toBe(true);
  });

  it('accepts suggestions for untranslated keys', async () => {
    expect((await setup().post({ ...valid, key: 'b', proposed: '香蕉' })).status).toBe(201);
  });

  it.each([
    [403, 'bad_origin', valid, { Origin: 'https://evil.test' }],
    [400, 'invalid_body', 'not json', {}],
    [400, 'invalid_body', { ...valid, modId: 'Bad Id' }, {}],
    [400, 'invalid_body', { ...valid, turnstileToken: '' }, {}],
    [404, 'mod_not_found', { ...valid, modId: 'nope' }, {}],
    [404, 'key_not_found', { ...valid, key: 'constructor' }, {}],
    [400, 'unchanged', { ...valid, proposed: '蘋果 %s' }, {}],
    [400, 'empty', { ...valid, proposed: ' ' }, {}],
  ] as const)('returns %i %s', async (status, code, body, headers) => {
    const res = await setup().post(body, headers);
    expect(res.status).toBe(status);
    expect((await readJson(res)).error.code).toBe(code);
  });

  it('rejects an oversized body with 413 before touching the database', async () => {
    const res = await setup().post({ ...valid, note: 'x'.repeat(20 * 1024) });
    expect(res.status).toBe(413);
    expect((await readJson(res)).error.code).toBe('too_large');
    expect(await countRows('suggestions')).toBe(0);
    expect(await countRows('rate_events')).toBe(0);
  });

  it('rejects when Turnstile fails', async () => {
    const res = await setup({ verifyTurnstile: vi.fn(async () => false) }).post(valid);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('turnstile_failed');
  });

  it('rejects blocked subjects', async () => {
    await createD1Repos(db).blocks.add(`ip:${await hashIp('test-salt', '1.2.3.4')}`, null, '2026-10-15T00:00:00.000Z');
    const res = await setup().post(valid);
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

  it('counts failed attempts toward the rate limit', async () => {
    const { post } = setup();
    for (let i = 0; i < 30; i += 1) expect((await post({ ...valid, proposed: '蘋果 %s' })).status).toBe(400);
    expect((await post(valid)).status).toBe(429);
  });

  it('does not call Turnstile once rate limited', async () => {
    const verify = vi.fn(async () => true);
    const { post } = setup({ verifyTurnstile: verify });
    for (let i = 0; i < 30; i += 1) await post({ ...valid, proposed: `蘋果${i} %s` });
    verify.mockClear();
    await post(valid);
    expect(verify).not.toHaveBeenCalled();
  });

  it('works without CF-Connecting-IP', async () => {
    expect((await setup().post(valid, { 'CF-Connecting-IP': '' })).status).toBe(201);
  });

  it('overwrites the same author pending suggestion', async () => {
    const { post } = setup();
    const first = await readJson(await post(valid));
    const second = await readJson(await post({ ...valid, proposed: '青蘋果 %s' }));
    expect(second.data.id).toBe(first.data.id);
  });

  it('returns a generic 500 when a dependency throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup({ loadMod: async () => { throw new Error('secret detail'); } }).post(valid);
    expect(res.status).toBe(500);
    const body = await readJson(res);
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('secret detail');
  });
});

describe('POST /api/v1/suggestions with sessions and CSRF', () => {
  it.each([
    ['wrong', { 'X-CSRF-Token': 'wrong' }],
    ['empty', { 'X-CSRF-Token': '' }],
  ])('rejects a %s CSRF token', async (_label, headers) => {
    const res = await setup().post(valid, headers);
    expect(res.status).toBe(403);
    expect((await readJson(res)).error.code).toBe('bad_csrf');
  });

  it('records the logged-in author and rate limits by user', async () => {
    const user = await createUser(db);
    const { post } = setup();
    expect((await post(valid, {}, user)).status).toBe(201);
    const row = await db.prepare('SELECT author_user_id FROM suggestions').first<{ author_user_id: number }>();
    expect(row?.author_user_id).toBe(user.id);
    expect(await db.prepare('SELECT subject FROM rate_events').first<{ subject: string }>()).toEqual({ subject: `user:${user.id}` });
  });

  it('rejects a logged-in user whose user subject is blocked', async () => {
    const user = await createUser(db);
    await createD1Repos(db).blocks.add(`user:${user.id}`, null, '2026-10-15T00:00:00.000Z');
    const res = await setup().post(valid, {}, user);
    expect((await readJson(res)).error.code).toBe('blocked');
  });

  it('passes the expected Turnstile hostname for non-local sites', async () => {
    const verify = vi.fn(async () => true);
    await setup({ verifyTurnstile: verify }).post(valid);
    expect(verify).toHaveBeenCalledWith('test-secret', 'tok', '1.2.3.4', 'mlf.test');
  });
});
