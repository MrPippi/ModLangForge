import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv, FetchLike } from '../appEnv';
import { isLocalSite, turnstileHostname } from '../siteUrl';
import { testEnv } from '../testEnv';
import { epochSeconds } from './session';
import { signToken } from './signedToken';
import { callbackUrl, consumeOAuthState, issueOAuthState, OAUTH_COOKIE, safeReturnTo } from './oauthState';
import { findProvider } from './providers';

const env = testEnv();
const REDIRECT = 'https://mlf.test/api/v1/auth/discord/callback';

function routes(table: Record<string, () => Response>): FetchLike {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const hit = Object.keys(table).find((suffix) => url.endsWith(suffix));
    return hit ? table[hit]!() : new Response('nope', { status: 404 });
  });
}

describe('findProvider', () => {
  it('knows discord and github only', () => {
    expect(findProvider('discord')?.name).toBe('discord');
    expect(findProvider('github')?.name).toBe('github');
    expect(findProvider('minecraft')).toBeNull();
    expect(findProvider('constructor')).toBeNull();
  });
});

describe('discord provider', () => {
  const discord = findProvider('discord')!;

  it('builds the authorize URL with identify scope and state', () => {
    const url = new URL(discord.authorizeUrl(env, 'st', REDIRECT));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'discord-id', response_type: 'code', scope: 'identify', state: 'st', redirect_uri: REDIRECT });
  });

  it('exchanges the code and reads the user', async () => {
    const fetchImpl = routes({
      '/oauth2/token': () => Response.json({ access_token: 'at' }),
      '/users/@me': () => Response.json({ id: '42', username: 'steve', global_name: '史蒂夫' }),
    });
    expect(await discord.fetchIdentity(env, 'code', REDIRECT, fetchImpl)).toEqual({ providerUserId: '42', username: 'steve', displayName: '史蒂夫' });
    const [, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(init?.body)).toContain('client_secret=discord-secret');
  });

  it('falls back to username when global_name is missing', async () => {
    const fetchImpl = routes({
      '/oauth2/token': () => Response.json({ access_token: 'at' }),
      '/users/@me': () => Response.json({ id: '42', username: 'steve', global_name: null }),
    });
    expect((await discord.fetchIdentity(env, 'code', REDIRECT, fetchImpl))?.displayName).toBe('steve');
  });

  it.each([
    ['token error', { '/oauth2/token': () => Response.json({ error: 'invalid_grant' }, { status: 400 }) }],
    ['non-JSON user', { '/oauth2/token': () => Response.json({ access_token: 'at' }), '/users/@me': () => new Response('<html>') }],
    ['invalid user shape', { '/oauth2/token': () => Response.json({ access_token: 'at' }), '/users/@me': () => Response.json({ id: 42 }) }],
  ])('returns null on %s', async (_name, table) => {
    expect(await discord.fetchIdentity(env, 'code', REDIRECT, routes(table))).toBeNull();
  });
});

describe('github provider', () => {
  const github = findProvider('github')!;

  it('builds the authorize URL', () => {
    const url = new URL(github.authorizeUrl(env, 'st', 'https://mlf.test/cb'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: 'github-id', state: 'st', redirect_uri: 'https://mlf.test/cb' });
  });

  it('exchanges the code and reads the user from GITHUB_API_BASE', async () => {
    const fetchImpl = routes({
      '/login/oauth/access_token': () => Response.json({ access_token: 'ghu' }),
      'api.github.test/user': () => Response.json({ id: 7, login: 'MrPippi', name: null }),
    });
    expect(await github.fetchIdentity(env, 'code', 'https://mlf.test/cb', fetchImpl)).toEqual({ providerUserId: '7', username: 'MrPippi', displayName: 'MrPippi' });
  });

  it('returns null when GitHub answers 200 with an error body', async () => {
    const fetchImpl = routes({ '/login/oauth/access_token': () => Response.json({ error: 'bad_verification_code' }) });
    expect(await github.fetchIdentity(env, 'code', 'https://mlf.test/cb', fetchImpl)).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it.each([
    [undefined, '/'],
    ['/mods/create/', '/mods/create/'],
    ['/mods/?q=a#x', '/mods/?q=a#x'],
    ['//evil.test', '/'],
    ['https://evil.test', '/'],
    ['/\\evil.test', '/'],
    ['/a\nb', '/'],
    ['mods', '/'],
    [`/${'a'.repeat(600)}`, '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe('site URL helpers', () => {
  it('builds callback URLs', () => {
    expect(callbackUrl('https://mlf.test', 'github')).toBe('https://mlf.test/api/v1/auth/github/callback');
  });

  it('detects local sites and the Turnstile hostname', () => {
    expect(isLocalSite('http://localhost:8787')).toBe(true);
    expect(isLocalSite('http://127.0.0.1:8787')).toBe(true);
    expect(isLocalSite('https://modlangforge.com')).toBe(false);
    expect(isLocalSite('not a url')).toBe(false);
    expect(turnstileHostname('http://localhost:8787')).toBeNull();
    expect(turnstileHostname('https://modlangforge.jack3555tw.workers.dev')).toBe('modlangforge.jack3555tw.workers.dev');
  });
});

describe('OAuth state cookie', () => {
  const NOW = new Date('2026-10-16T00:00:00Z');
  const app = new Hono<AppEnv>();
  app.get('/issue', async (c) => c.text(await issueOAuthState(c, { provider: 'github', mode: 'login', returnTo: '/mods/' }, NOW)));
  app.get('/consume', async (c) => c.json(await consumeOAuthState(c, NOW)));
  const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;

  it('round-trips state and deletes the cookie with full attributes', async () => {
    const issued = await app.request('/issue', {}, env);
    const state = await issued.text();
    expect(issued.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const res = await app.request('/consume', { headers: { cookie: cookieOf(issued) } }, env);
    expect(await res.json()).toMatchObject({ typ: 'oauth', state, provider: 'github', mode: 'login', returnTo: '/mods/' });
    const del = res.headers.get('set-cookie')!;
    expect(del).toMatch(/Max-Age=0/i);
    expect(del).toMatch(/HttpOnly/i);
    expect(del).toMatch(/Secure/i);
    expect(del).toMatch(/SameSite=Lax/i);
    expect(del).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('rejects a correctly signed session-typed token', async () => {
    const token = await signToken({ typ: 'session', uid: 1, sv: 0, exp: epochSeconds(NOW) + 60 }, env.SESSION_SECRET);
    const res = await app.request('/consume', { headers: { cookie: `${OAUTH_COOKIE}=${token}` } }, env);
    expect(await res.json()).toBeNull();
  });

  it('rejects a token carrying every OAuth-state field but typ "session"', async () => {
    const token = await signToken({ typ: 'session', state: 'x'.repeat(32), provider: 'github', mode: 'login', returnTo: '/', exp: epochSeconds(NOW) + 60 }, env.SESSION_SECRET);
    const res = await app.request('/consume', { headers: { cookie: `${OAUTH_COOKIE}=${token}` } }, env);
    expect(await res.json()).toBeNull();
  });

  it('rejects an expired or tampered state', async () => {
    const expired = await signToken({ typ: 'oauth', state: 'x'.repeat(32), provider: 'github', mode: 'login', returnTo: '/', exp: epochSeconds(NOW) - 1 }, env.SESSION_SECRET);
    expect(await (await app.request('/consume', { headers: { cookie: `${OAUTH_COOKIE}=${expired}` } }, env)).json()).toBeNull();
    const issued = await app.request('/issue', {}, env);
    const tampered = `${cookieOf(issued)}x`;
    expect(await (await app.request('/consume', { headers: { cookie: tampered } }, env)).json()).toBeNull();
  });
});
