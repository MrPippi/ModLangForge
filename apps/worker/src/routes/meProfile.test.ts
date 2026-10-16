import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { Env } from '../env';
import { createFakeMojang } from '../mojang/fakeMojang';
import type { UserProfile } from '../repo/types';
import { createUser, sessionCookie, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';
import { MOJANG_LOOKUPS_PER_HOUR } from './meProfile';

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';
type Actor = { id: number; sessionVersion: number };

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterEach(() => vi.restoreAllMocks());
afterAll(disposeTestDb);

function setup() {
  const mojang = createFakeMojang();
  const app = createApp(testDeps({ fetch: mojang.fetch }));
  const env = (over: Partial<Env> = {}) => testEnv({ DB: db, ...over });
  const post = async (path: string, body: unknown, who?: Actor, headerOver: Record<string, string> = {}, envOver: Partial<Env> = {}) =>
    app.request(path, { method: 'POST', headers: { ...(await writeHeaders(who)), ...headerOver }, body: JSON.stringify(body) }, env(envOver));
  const get = async (path: string, who?: Actor) =>
    app.request(path, { headers: who ? { Cookie: await sessionCookie(who) } : {} }, env());
  return { app, env, mojang, post, get };
}

const profileOf = async (res: Response) => (await readJson<{ profile: UserProfile }>(res)).data.profile;
const codeOf = async (res: Response) => (await readJson(res)).error.code;

describe('GET /api/v1/me/profile', () => {
  it('requires login', async () => {
    const res = await setup().get('/api/v1/me/profile');
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe('login_required');
  });

  it('returns the profile', async () => {
    const user = await createUser(db, 'contributor', '史蒂夫');
    expect(await profileOf(await setup().get('/api/v1/me/profile', user))).toEqual({
      id: user.id, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false,
    });
  });

  it('answers 405 for other methods on every /me path', async () => {
    const { app, env } = setup();
    for (const [path, allow] of [['/api/v1/me', 'GET'], ['/api/v1/me/suggestions', 'GET'], ['/api/v1/me/profile', 'GET, POST'], ['/api/v1/me/minecraft', 'POST']] as const) {
      const res = await app.request(path, { method: 'PUT' }, env());
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe(allow);
    }
  });
});

describe('POST /api/v1/me/profile', () => {
  it('renames with a cleaned name and toggles public; the session stays valid', async () => {
    const user = await createUser(db, 'contributor', '史蒂夫');
    const { post, get } = setup();
    const res = await post('/api/v1/me/profile', { displayName: '  艾力克斯\n', isPublic: false }, user);
    expect(res.status).toBe(200);
    expect(await profileOf(res)).toMatchObject({ displayName: '艾力克斯', isPublic: false });
    const me = await readJson<{ user: { displayName: string } | null }>(await get('/api/v1/me', user));
    expect(me.data.user?.displayName).toBe('艾力克斯');
  });

  it('rejects blank, too long and empty bodies', async () => {
    const user = await createUser(db);
    const { post } = setup();
    const blank = await post('/api/v1/me/profile', { displayName: ' \u200B ' }, user);
    expect(blank.status).toBe(400);
    expect(await codeOf(blank)).toBe('display_name_empty');
    expect(await codeOf(await post('/api/v1/me/profile', { displayName: '字'.repeat(33) }, user))).toBe('display_name_too_long');
    expect(await codeOf(await post('/api/v1/me/profile', {}, user))).toBe('invalid_body');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: 'no' }, user))).toBe('invalid_body');
  });

  it('requires login, Origin and CSRF', async () => {
    const user = await createUser(db);
    const { post } = setup();
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }))).toBe('login_required');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }, user, { Origin: 'https://evil.test' }))).toBe('bad_origin');
    expect(await codeOf(await post('/api/v1/me/profile', { isPublic: false }, user, { 'X-CSRF-Token': 'x'.repeat(43) }))).toBe('bad_csrf');
  });
});

describe('POST /api/v1/me/minecraft', () => {
  it('stores the canonical name and uuid as unverified', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    const res = await post('/api/v1/me/minecraft', { name: 'steve' }, user);
    expect(res.status).toBe(200);
    expect(await profileOf(res)).toMatchObject({ minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false });
    expect(mojang.requests().map((r) => r.url)).toEqual(['https://mojang.test/users/profiles/minecraft/steve']);
  });

  it('does not look up again when the name is unchanged (any case)', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    await post('/api/v1/me/minecraft', { name: 'Steve' }, user);
    expect((await post('/api/v1/me/minecraft', { name: 'STEVE' }, user)).status).toBe(200);
    expect(mojang.requests()).toHaveLength(1);
  });

  it('clears with null or an empty string without a lookup', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    await post('/api/v1/me/minecraft', { name: 'Steve' }, user);
    expect(await profileOf(await post('/api/v1/me/minecraft', { name: null }, user))).toMatchObject({ minecraftName: null, minecraftUuid: null });
    expect((await post('/api/v1/me/minecraft', { name: '' }, user)).status).toBe(200);
    expect(mojang.requests()).toHaveLength(1);
  });

  it('rejects invalid names before calling Mojang', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    const res = await post('/api/v1/me/minecraft', { name: 'Steve!' }, user);
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('invalid_minecraft_name');
    expect(await codeOf(await post('/api/v1/me/minecraft', {}, user))).toBe('invalid_body');
    expect(mojang.requests()).toHaveLength(0);
  });

  it('maps Mojang answers to clear errors without storing anything', async () => {
    const user = await createUser(db);
    const { post, get } = setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const missing = await post('/api/v1/me/minecraft', { name: 'nobody' }, user);
    expect([missing.status, await codeOf(missing)]).toEqual([404, 'minecraft_not_found']);
    const busy = await post('/api/v1/me/minecraft', { name: 'ratelimited' }, user);
    expect([busy.status, await codeOf(busy)]).toEqual([503, 'mojang_busy']);
    const broken = await post('/api/v1/me/minecraft', { name: 'broken' }, user);
    expect([broken.status, await codeOf(broken)]).toEqual([502, 'mojang_failed']);
    expect(errors).toHaveBeenCalledWith('mojang lookup failed', 500);
    expect((await profileOf(await get('/api/v1/me/profile', user))).minecraftName).toBeNull();
  });

  it('limits lookups per user per hour', async () => {
    const user = await createUser(db);
    const { post, mojang } = setup();
    for (let i = 0; i < MOJANG_LOOKUPS_PER_HOUR; i += 1) {
      expect((await post('/api/v1/me/minecraft', { name: `nobody${i}` }, user)).status).toBe(404);
    }
    const limited = await post('/api/v1/me/minecraft', { name: 'steve' }, user);
    expect([limited.status, await codeOf(limited)]).toEqual([429, 'rate_limited']);
    expect(mojang.requests()).toHaveLength(MOJANG_LOOKUPS_PER_HOUR);
  });

  it('returns misconfigured when MOJANG_API_BASE is missing', async () => {
    const user = await createUser(db);
    const res = await setup().post('/api/v1/me/minecraft', { name: 'steve' }, user, {}, { MOJANG_API_BASE: '' });
    expect([res.status, await codeOf(res)]).toEqual([500, 'misconfigured']);
  });

  it('requires login', async () => {
    expect(await codeOf(await setup().post('/api/v1/me/minecraft', { name: 'steve' }))).toBe('login_required');
  });
});
