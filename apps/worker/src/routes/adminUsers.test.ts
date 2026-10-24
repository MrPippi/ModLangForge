// apps/worker/src/routes/adminUsers.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { createUser, sessionCookie, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());
const send = async (path: string, method: string, admin: { id: number; sessionVersion: number }, body?: unknown) =>
  app.request(path, { method, headers: await writeHeaders(admin), body: body === undefined ? undefined : JSON.stringify(body) }, testEnv({ DB: db }));

describe('admin user management', () => {
  it('changes a role and invalidates the target old session', async () => {
    const admin = await createUser(db, 'admin');
    const target = await createUser(db, 'contributor', '目標');
    const oldCookie = await sessionCookie(target);
    const res = await send(`/api/v1/admin/users/${target.id}/role`, 'POST', admin, { role: 'reviewer' });
    expect((await readJson(res)).data).toEqual({ id: target.id, role: 'reviewer' });
    const me = await app.request('/api/v1/me', { headers: { Cookie: oldCookie } }, testEnv({ DB: db }));
    expect((await readJson<{ user: unknown }>(me)).data.user).toBeNull();
  });

  it('bans and unbans a user', async () => {
    const admin = await createUser(db, 'admin');
    const target = await createUser(db);
    expect((await readJson(await send(`/api/v1/admin/users/${target.id}/ban`, 'POST', admin, { banned: true }))).data).toEqual({ id: target.id, banned: true });
    expect((await createD1Repos(db).users.findById(target.id))?.banned).toBe(true);
    await send(`/api/v1/admin/users/${target.id}/ban`, 'POST', admin, { banned: false });
    expect((await createD1Repos(db).users.findById(target.id))?.banned).toBe(false);
  });

  it('refuses to change the acting admin', async () => {
    const admin = await createUser(db, 'admin');
    const res = await send(`/api/v1/admin/users/${admin.id}/role`, 'POST', admin, { role: 'contributor' });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('self_change');
    expect((await send(`/api/v1/admin/users/${admin.id}/ban`, 'POST', admin, { banned: true })).status).toBe(400);
  });

  it.each([
    ['/api/v1/admin/users/abc/role', { role: 'admin' }, 400, 'invalid_body'],
    ['/api/v1/admin/users/12345/role', { role: 'owner' }, 400, 'invalid_body'],
    ['/api/v1/admin/users/12345/role', { role: 'admin' }, 404, 'user_not_found'],
  ])('POST %s %j -> %i %s', async (path, body, status, code) => {
    const admin = await createUser(db, 'admin');
    const res = await send(path, 'POST', admin, body);
    expect(res.status).toBe(status);
    expect((await readJson(res)).error.code).toBe(code);
  });

  it('rejects a stale admin session after the admin role changes', async () => {
    const admin = await createUser(db, 'admin');
    const oldCookie = await sessionCookie(admin);
    await createD1Repos(db).users.setRole(admin.id, 'reviewer');
    const res = await app.request('/api/v1/admin/users', { headers: { Cookie: oldCookie } }, testEnv({ DB: db }));
    expect(res.status).toBe(401);
    expect((await readJson(res)).error.code).toBe('login_required');
  });

  it('treats an over-long search query as empty', async () => {
    const admin = await createUser(db, 'admin', '管理員');
    const res = await app.request(`/api/v1/admin/users?q=${'a'.repeat(65)}`, { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson<{ users: unknown[] }>(res)).data.users).toHaveLength(1);
  });

  it('searches users', async () => {
    const admin = await createUser(db, 'admin', '管理員');
    await createUser(db, 'contributor', '史蒂夫');
    const res = await app.request('/api/v1/admin/users?q=史', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson<{ users: { displayName: string }[] }>(res)).data.users.map((u) => u.displayName)).toEqual(['史蒂夫']);
  });
});

describe('admin blocks', () => {
  it('adds, lists and removes blocked subjects', async () => {
    const admin = await createUser(db, 'admin');
    const subject = `ip:${'a'.repeat(64)}`;
    expect((await send('/api/v1/admin/blocks', 'POST', admin, { subject, reason: '洗版' })).status).toBe(201);
    const list = await app.request('/api/v1/admin/blocks', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson<{ blocks: { subject: string; reason: string }[] }>(list)).data.blocks).toEqual([{ subject, reason: '洗版', createdAt: expect.any(String) }]);
    expect((await send(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', admin)).status).toBe(200);
    expect((await send(`/api/v1/admin/blocks/${encodeURIComponent(subject)}`, 'DELETE', admin)).status).toBe(404);
  });

  it('rejects a malformed subject in the DELETE path', async () => {
    const admin = await createUser(db, 'admin');
    const res = await send('/api/v1/admin/blocks/email%3Aa%40b', 'DELETE', admin);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error.code).toBe('invalid_body');
  });

  it('rejects malformed subjects', async () => {
    const admin = await createUser(db, 'admin');
    const res = await send('/api/v1/admin/blocks', 'POST', admin, { subject: 'email:a@b' });
    expect(res.status).toBe(400);
  });
});

describe('reviewer mod assignments', () => {
  it('replaces the assigned mods, dedupes them and shows them in search and /me', async () => {
    const admin = await createUser(db, 'admin');
    const reviewer = await createUser(db, 'reviewer', '分工審核者');
    const res = await send(`/api/v1/admin/users/${reviewer.id}/review-mods`, 'POST', admin, { modIds: ['jei', 'create', 'jei'] });
    expect((await readJson<{ reviewMods: string[] }>(res)).data.reviewMods).toEqual(['create', 'jei']);
    await send(`/api/v1/admin/users/${reviewer.id}/review-mods`, 'POST', admin, { modIds: ['jei'] });
    const found = await readJson<{ users: { id: number; reviewMods: string[] }[] }>(await send('/api/v1/admin/users?q=分工', 'GET', admin));
    expect(found.data.users.find((u) => u.id === reviewer.id)?.reviewMods).toEqual(['jei']);
    const me = await app.request('/api/v1/me', { headers: { Cookie: await sessionCookie(reviewer) } }, testEnv({ DB: db }));
    expect((await readJson<{ user: { reviewMods: string[] | null } }>(me)).data.user.reviewMods).toEqual(['jei']);
  });

  it('reports null for admins in /me and rejects bad input', async () => {
    const admin = await createUser(db, 'admin');
    const me = await app.request('/api/v1/me', { headers: { Cookie: await sessionCookie(admin) } }, testEnv({ DB: db }));
    expect((await readJson<{ user: { reviewMods: string[] | null } }>(me)).data.user.reviewMods).toBeNull();
    const target = await createUser(db, 'reviewer');
    expect((await send(`/api/v1/admin/users/${target.id}/review-mods`, 'POST', admin, { modIds: ['Bad Id!'] })).status).toBe(400);
    expect((await send('/api/v1/admin/users/99999/review-mods', 'POST', admin, { modIds: [] })).status).toBe(404);
    expect((await send(`/api/v1/admin/users/${admin.id}/review-mods`, 'POST', admin, { modIds: [] })).status).toBe(400);
  });
});
