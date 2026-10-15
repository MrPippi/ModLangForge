import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { FetchLike } from '../appEnv';
import { OAUTH_COOKIE } from '../auth/oauthState';
import { SESSION_COOKIE } from '../auth/session';
import type { Env } from '../env';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, setCookieValue, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterEach(() => vi.restoreAllMocks());
afterAll(disposeTestDb);

interface DiscordUser { id: string; username: string; global_name: string | null }
const DISCORD_42: DiscordUser = { id: '42', username: 'steve', global_name: '史蒂夫' };
const GITHUB_7 = { id: 7, login: 'MrPippi', name: null as string | null };

function fakeOAuth(discordUser: DiscordUser = DISCORD_42, githubUser = GITHUB_7): FetchLike {
  return async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/oauth2/token') || url.endsWith('/login/oauth/access_token')) return Response.json({ access_token: 'at' });
    if (url.endsWith('/users/@me')) return Response.json(discordUser);
    if (url.endsWith('/user')) return Response.json(githubUser);
    return new Response('nope', { status: 404 });
  };
}

function setup(fetchImpl: FetchLike = fakeOAuth(), envOver: Partial<Env> = {}) {
  const app = createApp(testDeps({ fetch: fetchImpl }));
  const env = testEnv({ DB: db, ADMIN_BOOTSTRAP: 'github:mrpippi', ...envOver });
  const request = (path: string, init: RequestInit = {}) => app.request(path, init, env);
  /** 走完 start → callback，回傳 callback 回應 */
  const login = async (provider: 'discord' | 'github', opts: { link?: boolean; cookie?: string; returnTo?: string } = {}) => {
    const query = new URLSearchParams({ returnTo: opts.returnTo ?? '/mods/', ...(opts.link ? { link: '1' } : {}) });
    const start = await request(`/api/v1/auth/${provider}/start?${query.toString()}`, { headers: opts.cookie ? { Cookie: opts.cookie } : {} });
    const state = new URL(start.headers.get('Location') ?? '', 'https://mlf.test').searchParams.get('state') ?? '';
    const cookies = [`${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}`, ...(opts.cookie ? [opts.cookie] : [])];
    return request(`/api/v1/auth/${provider}/callback?code=abc&state=${state}`, { headers: { Cookie: cookies.join('; ') } });
  };
  return { request, login };
}

const location = (res: Response) => res.headers.get('Location');

describe('GET /api/v1/auth/:provider/start', () => {
  it('redirects to the provider with a state stored in a short-lived cookie', async () => {
    const res = await setup().request('/api/v1/auth/discord/start?returnTo=/mods/');
    expect(res.status).toBe(302);
    expect(location(res)).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
    const header = res.headers.getSetCookie().find((h) => h.startsWith(`${OAUTH_COOKIE}=`));
    expect(header).toMatch(/Path=\/api\/v1\/auth/);
    expect(header).toMatch(/Max-Age=600/);
  });

  it('returns 404 for unknown providers and 500 when the provider is not configured', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await setup().request('/api/v1/auth/minecraft/start')).status).toBe(404);
    const res = await setup(fakeOAuth(), { DISCORD_CLIENT_SECRET: '' }).request('/api/v1/auth/discord/start');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('DISCORD');
    expect(spy).toHaveBeenCalled();
  });

  it('requires a session to link', async () => {
    const res = await setup().request('/api/v1/auth/discord/start?link=1&returnTo=/mods/');
    expect(location(res)).toBe('/mods/?auth_error=login_required');
  });

  it('sanitizes returnTo before it is stored in the state', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start?returnTo=//evil.test');
    const state = new URL(location(start) ?? '').searchParams.get('state');
    const res = await request(`/api/v1/auth/discord/callback?error=access_denied&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}` } });
    expect(location(res)).toBe('/?auth_error=cancelled');
  });
});

describe('GET /api/v1/auth/:provider/callback', () => {
  it('creates a contributor, sets a session cookie and returns to the page', async () => {
    const res = await setup().login('discord');
    expect(res.status).toBe(302);
    expect(location(res)).toBe('/mods/');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeTruthy();
    expect(await createD1Repos(db).users.findByIdentity('discord', '42')).toMatchObject({ displayName: '史蒂夫', role: 'contributor' });
  });

  it('makes the ADMIN_BOOTSTRAP identity an admin on first login', async () => {
    await setup().login('github');
    expect((await createD1Repos(db).users.findByIdentity('github', '7'))?.role).toBe('admin');
  });

  it('logs an existing identity into the same user', async () => {
    await setup().login('discord');
    await setup().login('discord');
    expect((await createD1Repos(db).users.search('', 10)).length).toBe(1);
  });

  it('refuses banned users without a session', async () => {
    await setup().login('discord');
    const user = await createD1Repos(db).users.findByIdentity('discord', '42');
    await createD1Repos(db).users.setBanned(user!.id, true);
    const res = await setup().login('discord');
    expect(location(res)).toBe('/mods/?auth_error=banned');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeNull();
  });

  it('rejects a mismatched or missing state', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start');
    const cookie = `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}`;
    const wrong = await request('/api/v1/auth/discord/callback?code=abc&state=wrong', { headers: { Cookie: cookie } });
    expect(location(wrong)).toBe('/?auth_error=bad_state');
    expect(setCookieValue(wrong, SESSION_COOKIE)).toBeNull();
    const missing = await request('/api/v1/auth/discord/callback?code=abc&state=x');
    expect(location(missing)).toBe('/?auth_error=bad_state');
    expect(await createD1Repos(db).users.search('', 10)).toEqual([]);
  });

  it('rejects a state issued for another provider', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start');
    const state = new URL(location(start) ?? '').searchParams.get('state');
    const res = await request(`/api/v1/auth/github/callback?code=abc&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}` } });
    expect(location(res)).toBe('/?auth_error=bad_state');
    expect(await createD1Repos(db).users.search('', 10)).toEqual([]);
  });

  it('handles a cancelled authorization (no code)', async () => {
    const { request } = setup();
    const start = await request('/api/v1/auth/discord/start?returnTo=/pack/');
    const state = new URL(location(start) ?? '').searchParams.get('state');
    const res = await request(`/api/v1/auth/discord/callback?error=access_denied&state=${state}`, { headers: { Cookie: `${OAUTH_COOKIE}=${setCookieValue(start, OAUTH_COOKIE)}` } });
    expect(location(res)).toBe('/pack/?auth_error=cancelled');
  });

  it('reports provider failures without creating users or leaking secrets', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup(async () => { throw new Error('network down'); }).login('discord');
    expect(res.status).toBe(302);
    expect(location(res)).toBe('/mods/?auth_error=provider_failed');
    expect(await createD1Repos(db).users.search('', 10)).toEqual([]);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/discord-secret|github-secret/);
  });

  it('reports a rejected token exchange as provider_failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await setup(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })).login('discord');
    expect(location(res)).toBe('/mods/?auth_error=provider_failed');
  });

  it('sanitizes returnTo', async () => {
    const res = await setup().login('discord', { returnTo: '//evil.test' });
    expect(location(res)).toBe('/');
  });

  it('links a second provider to the logged-in user', async () => {
    const user = await createUser(db);
    const res = await setup().login('discord', { link: true, cookie: await sessionCookie(user) });
    expect(location(res)).toBe('/mods/');
    expect((await createD1Repos(db).users.findByIdentity('discord', '42'))?.id).toBe(user.id);
  });

  it('refuses to link an identity owned by someone else', async () => {
    await setup().login('discord');
    const other = await createUser(db);
    const res = await setup().login('discord', { link: true, cookie: await sessionCookie(other) });
    expect(location(res)).toBe('/mods/?auth_error=identity_taken');
    expect((await createD1Repos(db).users.findByIdentity('discord', '42'))?.id).not.toBe(other.id);
  });

  it('refuses to link a second identity of an already linked provider', async () => {
    const user = await createUser(db);
    const cookie = await sessionCookie(user);
    expect(location(await setup().login('discord', { link: true, cookie }))).toBe('/mods/');
    const res = await setup(fakeOAuth({ id: '43', username: 'alex', global_name: 'Alex' })).login('discord', { link: true, cookie });
    expect(location(res)).toBe('/mods/?auth_error=provider_linked');
    expect(await createD1Repos(db).users.findByIdentity('discord', '43')).toBeNull();
  });
});

const LOCAL_ENV = { TEST_LOGIN_ENABLED: 'true', SITE_URL: 'http://localhost:8787' } satisfies Partial<Env>;
const TEST_LOGIN_BODY = JSON.stringify({ provider: 'github', providerUserId: '9001', username: 'MrPippi' });

describe.each([
  ['logout', '/api/v1/auth/logout', {} as Partial<Env>, 'https://mlf.test'],
  ['test-login', '/api/v1/auth/test-login', LOCAL_ENV as Partial<Env>, LOCAL_ENV.SITE_URL],
])('requireWrite on %s', (_name, path, envOver, origin) => {
  const send = (headers: Record<string, string>) => setup(fakeOAuth(), envOver).request(path, { method: 'POST', headers, body: TEST_LOGIN_BODY });
  const goodHeaders = async (): Promise<Record<string, string>> => ({ ...(await writeHeaders()), Origin: origin });
  const errorCode = async (res: Response) => (await readJson(res)).error.code;

  it('rejects a foreign Origin', async () => {
    const res = await send({ ...(await goodHeaders()), Origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('bad_origin');
  });

  it('rejects a missing CSRF cookie', async () => {
    const { Cookie: _dropped, ...withoutCookie } = await goodHeaders();
    const res = await send(withoutCookie);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('bad_csrf');
  });

  it('rejects a CSRF header that differs from the cookie', async () => {
    const res = await send({ ...(await goodHeaders()), 'X-CSRF-Token': 'd'.repeat(43) });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('bad_csrf');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie', async () => {
    const user = await createUser(db);
    const { request } = setup();
    const res = await request('/api/v1/auth/logout', { method: 'POST', headers: await writeHeaders(user) });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().find((h) => h.startsWith(`${SESSION_COOKIE}=`))).toMatch(/Max-Age=0/);
    expect((await request('/api/v1/auth/logout')).status).toBe(405);
  });
});

describe('POST /api/v1/auth/test-login', () => {
  const post = async (envOver: Partial<Env>, headers?: Record<string, string>) =>
    setup(fakeOAuth(), envOver).request('/api/v1/auth/test-login', {
      method: 'POST',
      headers: headers ?? { ...(await writeHeaders()), Origin: envOver.SITE_URL ?? 'https://mlf.test' },
      body: TEST_LOGIN_BODY,
    });

  it('is hidden unless enabled on a local SITE_URL', async () => {
    expect((await post({})).status).toBe(404);
    expect((await post({ TEST_LOGIN_ENABLED: 'true' })).status).toBe(404);
    expect((await post({ TEST_LOGIN_ENABLED: 'false', SITE_URL: 'http://localhost:8787' })).status).toBe(404);
  });

  it('is hidden even from requests without Origin or CSRF', async () => {
    const res = await post({}, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(404);
    expect((await readJson(res)).error.code).toBe('not_found');
  });

  it('logs in locally and applies ADMIN_BOOTSTRAP', async () => {
    const res = await post(LOCAL_ENV);
    expect(res.status).toBe(200);
    expect((await readJson<{ role: string }>(res)).data.role).toBe('admin');
    expect(setCookieValue(res, SESSION_COOKIE)).toBeTruthy();
  });

  it('refuses banned identities', async () => {
    await post(LOCAL_ENV);
    const user = await createD1Repos(db).users.findByIdentity('github', '9001');
    await createD1Repos(db).users.setBanned(user!.id, true);
    const res = await post(LOCAL_ENV);
    expect(res.status).toBe(403);
    expect(setCookieValue(res, SESSION_COOKIE)).toBeNull();
  });
});
