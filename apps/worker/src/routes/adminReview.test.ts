import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterEach(() => vi.restoreAllMocks());
afterAll(disposeTestDb);

const app = createApp(testDeps());
type Actor = { id: number; sessionVersion: number };
const get = async (path: string, who: Actor) => app.request(path, { headers: await writeHeaders(who) }, testEnv({ DB: db }));
const post = async (path: string, who: Actor, body: unknown) =>
  app.request(path, { method: 'POST', headers: { ...(await writeHeaders(who)), 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(body) }, testEnv({ DB: db }));

/** TEST_MOD：en { a: 'Apple %s', b: 'Banana' }、zh { a: '蘋果 %s' } */
const seed = (over: { key?: string; proposed?: string; hash?: string } = {}) => createD1Repos(db).suggestions.upsertPending({
  modId: 'create', key: over.key ?? 'a', baseTarget: '蘋果 %s', proposed: over.proposed ?? '紅蘋果 %s', note: '更自然',
  formatWarning: false, authorUserId: null, authorHash: over.hash ?? 'h1', createdAt: TEST_NOW.toISOString(),
});

describe('admin review API', () => {
  it('lists pending suggestions filtered by mod', async () => {
    const reviewer = await createUser(db, 'reviewer');
    await seed();
    await seed({ key: 'b', proposed: '香蕉', hash: 'h2' });
    const res = await get('/api/v1/admin/suggestions?status=pending&modId=create', reviewer);
    const body = await readJson<{ suggestions: { key: string; authorSubject: string }[] }>(res);
    expect(body.data.suggestions.map((s) => s.key)).toEqual(['a', 'b']);
    expect(body.data.suggestions[0]?.authorSubject).toBe('ip:h1');
    expect((await get('/api/v1/admin/suggestions?status=bogus', reviewer)).status).toBe(400);
  });

  it('approves as-is and supersedes the competing pending suggestion', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    const b = await seed({ proposed: '青蘋果 %s', hash: 'h2' });
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, {})).status).toBe(200);
    const repos = createD1Repos(db);
    expect((await repos.review.findById(a.id))?.status).toBe('approved');
    expect((await repos.review.findById(b.id))?.status).toBe('superseded');
    const again = await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, {});
    expect(again.status).toBe(409);
    expect((await readJson(again)).error.code).toBe('not_pending');
  });

  it('approves an edited text and re-validates it', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    const unchanged = await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, { proposed: '蘋果 %s' });
    expect((await readJson(unchanged)).error.code).toBe('unchanged');
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, { proposed: '大蘋果' })).status).toBe(200);
    expect(await createD1Repos(db).review.findById(a.id)).toMatchObject({ proposed: '大蘋果', formatWarning: true });
  });

  it('returns 404 for unknown suggestions and 400 for bad ids', async () => {
    const reviewer = await createUser(db, 'reviewer');
    expect((await post('/api/v1/admin/suggestions/12345/approve', reviewer, {})).status).toBe(404);
    expect((await post('/api/v1/admin/suggestions/abc/reject', reviewer, {})).status).toBe(400);
  });

  it('rejects with a reason', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    expect((await post(`/api/v1/admin/suggestions/${a.id}/reject`, reviewer, { reason: '用詞不一致' })).status).toBe(200);
    expect(await createD1Repos(db).review.findById(a.id)).toMatchObject({ status: 'rejected', reviewNote: '用詞不一致' });
  });

  it('refuses to reject an approved suggestion while a publish is running (pending stays rejectable)', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await seed();
    const b = await seed({ key: 'b', proposed: '香蕉', hash: 'h2' });
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, reviewer, {})).status).toBe(200);
    await createD1Repos(db).review.acquirePublishLock(reviewer.id, TEST_NOW);
    const blocked = await post(`/api/v1/admin/suggestions/${a.id}/reject`, reviewer, {});
    expect(blocked.status).toBe(409);
    expect((await readJson(blocked)).error).toEqual({ code: 'publish_in_progress', message: '發佈進行中，請稍後再退回' });
    expect((await createD1Repos(db).review.findById(a.id))?.status).toBe('approved');
    expect((await post(`/api/v1/admin/suggestions/${b.id}/reject`, reviewer, {})).status).toBe(200);
    const again = await post(`/api/v1/admin/suggestions/${b.id}/reject`, reviewer, {});
    expect(again.status).toBe(409);
    expect((await readJson(again)).error.code).toBe('not_pending');
  });

  it('creates a direct edit against the current site value', async () => {
    const reviewer = await createUser(db, 'reviewer', '審核者');
    const pendingOne = await seed();
    const res = await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'a', proposed: '蘋果！%s' });
    expect(res.status).toBe(201);
    const { id } = (await readJson<{ id: number }>(res)).data;
    expect(await createD1Repos(db).review.findById(id)).toMatchObject({ status: 'approved', baseTarget: '蘋果 %s', authorUserId: reviewer.id });
    expect((await createD1Repos(db).review.findById(pendingOne.id))?.status).toBe('superseded');
    expect((await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'constructor', proposed: 'x' })).status).toBe(404);
    expect((await post('/api/v1/admin/edits', reviewer, { modId: 'create', key: 'b', proposed: '  ' })).status).toBe(400);
  });

  it('queues a mod status change for existing mods only', async () => {
    const reviewer = await createUser(db, 'reviewer');
    expect((await post('/api/v1/admin/mods/create/status', reviewer, { status: 'reviewed' })).status).toBe(201);
    expect((await post('/api/v1/admin/mods/nope/status', reviewer, { status: 'reviewed' })).status).toBe(404);
    expect((await post('/api/v1/admin/mods/create/status', reviewer, { status: 'machine' })).status).toBe(400);
    expect(await createD1Repos(db).review.listPendingStatusChanges()).toMatchObject([{ modId: 'create', status: 'reviewed' }]);
  });
});
