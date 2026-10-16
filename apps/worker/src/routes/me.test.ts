import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { hashIp } from '../ipHash';
import { sessionToken, SESSION_COOKIE } from '../auth/session';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, setCookieValue, TEST_CSRF } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv, TEST_SESSION_SECRET } from '../testEnv';

interface MeData {
  readonly user: { id: number; displayName: string; role: string; identities: { provider: string; username: string | null }[] } | null;
  readonly csrfToken: string;
}

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const getMe = (cookie = '') => createApp(testDeps()).request('/api/v1/me', { headers: cookie ? { Cookie: cookie } : {} }, testEnv({ DB: db }));

describe('GET /api/v1/me', () => {
  it('returns no user and issues an HttpOnly CSRF cookie for anonymous visitors', async () => {
    const res = await getMe();
    const body = await readJson<MeData>(res);
    expect(body.data.user).toBeNull();
    expect(body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookieValue(res, 'mlf_csrf')).toBe(body.data.csrfToken);
    const header = res.headers.getSetCookie().find((h) => h.startsWith('mlf_csrf='));
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps an existing CSRF cookie', async () => {
    const res = await getMe(`mlf_csrf=${TEST_CSRF}`);
    expect((await readJson<MeData>(res)).data.csrfToken).toBe(TEST_CSRF);
    expect(setCookieValue(res, 'mlf_csrf')).toBeNull();
  });

  it('returns the logged-in user with identities', async () => {
    const user = await createUser(db, 'reviewer', '審核者');
    const body = await readJson<MeData>(await getMe(await sessionCookie(user)));
    expect(body.data.user).toMatchObject({ id: user.id, displayName: '審核者', role: 'reviewer', identities: [{ provider: 'github' }] });
  });

  it('treats a stale session version as logged out', async () => {
    const user = await createUser(db);
    const cookie = await sessionCookie(user);
    await createD1Repos(db).users.setRole(user.id, 'reviewer');
    expect((await readJson<MeData>(await getMe(cookie))).data.user).toBeNull();
  });

  it('treats a banned user as logged out', async () => {
    const user = await createUser(db);
    const banned = await createD1Repos(db).users.setBanned(user.id, true);
    if (!banned) throw new Error('setup');
    expect((await readJson<MeData>(await getMe(await sessionCookie(banned)))).data.user).toBeNull();
  });

  it('treats an expired or forged session as logged out', async () => {
    const user = await createUser(db);
    const old = await sessionToken(user, TEST_SESSION_SECRET, new Date(TEST_NOW.getTime() - 31 * 24 * 3600 * 1000));
    expect((await readJson<MeData>(await getMe(`${SESSION_COOKIE}=${old}`))).data.user).toBeNull();
    const forged = await sessionToken(user, 'z'.repeat(40), TEST_NOW);
    expect((await readJson<MeData>(await getMe(`${SESSION_COOKIE}=${forged}`))).data.user).toBeNull();
  });
});

describe('GET /api/v1/me/suggestions', () => {
  it('lists the logged-in user suggestions', async () => {
    const user = await createUser(db);
    const repos = createD1Repos(db);
    await repos.suggestions.upsertPending({ modId: 'create', key: 'a', baseTarget: null, proposed: 'x', note: null, formatWarning: false, authorUserId: user.id, authorHash: 'h', createdAt: TEST_NOW.toISOString() });
    const res = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { Cookie: await sessionCookie(user) } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: { key: string }[] }>(res)).data.suggestions.map((s) => s.key)).toEqual(['a']);
  });

  it('lists anonymous suggestions from the current IP', async () => {
    const repos = createD1Repos(db);
    await repos.suggestions.upsertPending({ modId: 'create', key: 'b', baseTarget: null, proposed: 'x', note: null, formatWarning: false, authorUserId: null, authorHash: await hashIp('test-salt', '5.6.7.8'), createdAt: TEST_NOW.toISOString() });
    const res = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { 'CF-Connecting-IP': '5.6.7.8' } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: { key: string }[] }>(res)).data.suggestions.map((s) => s.key)).toEqual(['b']);
    const other = await createApp(testDeps()).request('/api/v1/me/suggestions', { headers: { 'CF-Connecting-IP': '9.9.9.9' } }, testEnv({ DB: db }));
    expect((await readJson<{ suggestions: unknown[] }>(other)).data.suggestions).toEqual([]);
  });
});
