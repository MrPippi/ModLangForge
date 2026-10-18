import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { QUEUE_LIMIT } from './adminReview';
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

describe('status change withdrawal and queue truncation', () => {
  const del = async (path: string, who: Actor) => app.request(path, { method: 'DELETE', headers: await writeHeaders(who) }, testEnv({ DB: db }));
  const addStatus = (createdBy: number) =>
    createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy, now: TEST_NOW.toISOString() });

  it('withdraws a pending status change and removes it from the publish summary', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const admin = await createUser(db, 'admin');
    const id = await addStatus(reviewer.id);
    const before = await readJson<{ statusChanges: unknown[] }>(await get('/api/v1/admin/publish', admin));
    expect(before.data.statusChanges).toEqual([{ id, modId: 'create', status: 'reviewed' }]);
    expect((await del(`/api/v1/admin/mods/status-changes/${id}`, reviewer)).status).toBe(200);
    expect((await readJson<{ statusChanges: unknown[] }>(await get('/api/v1/admin/publish', admin))).data.statusChanges).toEqual([]);
    const again = await del(`/api/v1/admin/mods/status-changes/${id}`, reviewer);
    expect([again.status, (await readJson(again)).error.code]).toEqual([404, 'status_change_not_found']);
    expect((await del('/api/v1/admin/mods/status-changes/abc', reviewer)).status).toBe(400);
  });

  it('refuses while a publish holds the lock and never withdraws published changes', async () => {
    const admin = await createUser(db, 'admin');
    const repos = createD1Repos(db);
    const id = await addStatus(admin.id);
    const lock = await repos.review.acquirePublishLock(admin.id, TEST_NOW);
    if (!lock) throw new Error('setup');
    const busy = await del(`/api/v1/admin/mods/status-changes/${id}`, admin);
    expect([busy.status, (await readJson(busy)).error.code]).toEqual([409, 'publish_in_progress']);
    await repos.review.completePublish({ lock, commitSha: 'abc123', results: [], statusChangeIds: [id] });
    expect((await del(`/api/v1/admin/mods/status-changes/${id}`, admin)).status).toBe(404);
  });

  it('flags a truncated queue', async () => {
    const reviewer = await createUser(db, 'reviewer');
    await db.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
                      INSERT INTO suggestions (mod_id, key, proposed, author_hash, status, created_at)
                      SELECT 'create', 'k' || i, 'x', 'h', 'pending', ?2 FROM n`).bind(QUEUE_LIMIT + 1, TEST_NOW.toISOString()).run();
    const full = await readJson<{ suggestions: unknown[]; truncated: boolean }>(await get('/api/v1/admin/suggestions', reviewer));
    expect(full.data.suggestions).toHaveLength(QUEUE_LIMIT);
    expect(full.data.truncated).toBe(true);
    const other = await readJson<{ truncated: boolean }>(await get('/api/v1/admin/suggestions?modId=jei', reviewer));
    expect(other.data.truncated).toBe(false);
  });
});

describe('reviewer mod assignments', () => {
  async function scopedReviewer(modIds: string[]) {
    const reviewer = await createUser(db, 'reviewer');
    await createD1Repos(db).reviewScopes.replace(reviewer.id, modIds, TEST_NOW.toISOString());
    return reviewer;
  }

  it('lists only the assigned mods and refuses others', async () => {
    await seed();
    const onlyJei = await scopedReviewer(['jei']);
    const list = await readJson<{ suggestions: unknown[] }>(await get('/api/v1/admin/suggestions', onlyJei));
    expect(list.data.suggestions).toEqual([]);
    const denied = await get('/api/v1/admin/suggestions?modId=create', onlyJei);
    expect(denied.status).toBe(403);
    expect((await readJson(denied)).error.code).toBe('mod_not_assigned');
    const withCreate = await scopedReviewer(['create']);
    expect((await readJson<{ suggestions: unknown[] }>(await get('/api/v1/admin/suggestions', withCreate))).data.suggestions).toHaveLength(1);
  });

  it('blocks approve, reject, direct edits, status changes and withdrawals outside the assignment', async () => {
    const a = await seed();
    const onlyJei = await scopedReviewer(['jei']);
    const codes = await Promise.all([
      post(`/api/v1/admin/suggestions/${a.id}/approve`, onlyJei, {}),
      post(`/api/v1/admin/suggestions/${a.id}/reject`, onlyJei, {}),
      post('/api/v1/admin/edits', onlyJei, { modId: 'create', key: 'b', proposed: '香蕉' }),
      post('/api/v1/admin/mods/create/status', onlyJei, { status: 'reviewed' }),
    ].map(async (p) => (await p).status));
    expect(codes).toEqual([403, 403, 403, 403]);
    const withdraw = await app.request('/api/v1/admin/mods/status-changes/1', { method: 'DELETE', headers: await writeHeaders(onlyJei) }, testEnv({ DB: db }));
    expect(withdraw.status).toBe(403);
    expect((await createD1Repos(db).review.findById(a.id))?.status).toBe('pending');
  });

  it('lets an assigned reviewer approve, and keeps unassigned reviewers unrestricted', async () => {
    const a = await seed();
    expect((await post(`/api/v1/admin/suggestions/${a.id}/approve`, await scopedReviewer(['create']), {})).status).toBe(200);
    expect((await post('/api/v1/admin/edits', await createUser(db, 'reviewer'), { modId: 'create', key: 'b', proposed: '香蕉' })).status).toBe(201);
  });
});
