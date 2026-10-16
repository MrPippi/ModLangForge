import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewSuggestion, Repos } from './types';

const NOW = '2026-10-15T12:00:00.000Z';
let db: D1Database;
let repos: Repos;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const pending = (over: Partial<NewSuggestion> = {}) => repos.suggestions.upsertPending({
  modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', note: null, formatWarning: false,
  authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});
const statusOf = async (id: number) => (await repos.review.findById(id))?.status;

describe('ReviewRepo review actions', () => {
  it('lists by status and mod with author info', async () => {
    const alice = await createUser(db, 'contributor', 'Alice');
    await pending({ authorUserId: alice.id });
    await pending({ authorHash: 'h2', key: 'b' });
    await pending({ modId: 'jei', authorHash: 'h3' });
    const list = await repos.review.list({ status: 'pending', modId: 'create', limit: 10 });
    expect(list.map((s) => [s.key, s.authorName, s.authorSubject])).toEqual([['a', 'Alice', `user:${alice.id}`], ['b', null, 'ip:h2']]);
    expect(await repos.review.list({ status: 'approved', modId: null, limit: 10 })).toEqual([]);
  });

  it('approves one suggestion and supersedes other pending ones for the same key', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await pending();
    const b = await pending({ authorHash: 'h2', proposed: '青蘋果' });
    const other = await pending({ authorHash: 'h3', key: 'b' });
    expect(await repos.review.approve({ id: a.id, reviewerId: reviewer.id, proposed: '大紅蘋果', formatWarning: true, now: NOW })).toBe(true);
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'approved', proposed: '大紅蘋果', formatWarning: true, reviewedAt: NOW });
    expect(await statusOf(b.id)).toBe('superseded');
    expect(await statusOf(other.id)).toBe('pending');
    expect(await repos.review.approve({ id: a.id, reviewerId: reviewer.id, proposed: 'x', formatWarning: false, now: NOW })).toBe(false);
  });

  it('rejects pending or approved suggestions with a reason', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const a = await pending();
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: '用詞不一致', now: NOW })).toBe('rejected');
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'rejected', reviewNote: '用詞不一致' });
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: null, now: NOW })).toBe('not_rejectable');
  });

  it('creates a direct edit as an approved suggestion and supersedes pending ones', async () => {
    const reviewer = await createUser(db, 'reviewer', '審核者');
    const old = await pending();
    const id = await repos.review.createDirectEdit({ modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '蘋果！', formatWarning: false, reviewerId: reviewer.id, authorHash: 'h9', now: NOW });
    expect(await repos.review.findById(id)).toMatchObject({ status: 'approved', authorUserId: reviewer.id, authorName: '審核者', reviewedAt: NOW });
    expect(await statusOf(old.id)).toBe('superseded');
  });

  it('lists approved changes with credit only for public, unbanned, logged-in authors', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const pub = await createUser(db, 'contributor', '公開者');
    const hidden = await createUser(db, 'contributor', '隱藏者');
    const banned = await createUser(db, 'contributor', '停權者');
    await db.prepare('UPDATE users SET public = 0 WHERE id = ?').bind(hidden.id).run();
    await db.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(banned.id).run();
    const ids = [
      (await pending({ authorUserId: pub.id })).id,
      (await pending({ authorUserId: hidden.id, key: 'b' })).id,
      (await pending({ key: 'c' })).id,
      (await pending({ authorUserId: banned.id, key: 'd' })).id,
    ];
    for (const id of ids) await repos.review.approve({ id, reviewerId: reviewer.id, proposed: '譯文', formatWarning: false, now: NOW });
    const list = await repos.review.listApprovedForPublish();
    expect(list.map((c) => [c.key, c.creditName, c.reviewedAt])).toEqual([['a', '公開者', NOW], ['b', null, NOW], ['c', null, NOW], ['d', null, NOW]]);
  });
});

describe('ReviewRepo status changes and publishing', () => {
  it('records pending mod status changes', async () => {
    const reviewer = await createUser(db, 'reviewer');
    const id = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: reviewer.id, now: NOW });
    expect(await repos.review.listPendingStatusChanges()).toEqual([{ id, modId: 'create', status: 'reviewed', createdAt: NOW }]);
  });

  it('holds a single publish lock until released or stale', async () => {
    const admin = await createUser(db, 'admin');
    const at = new Date(NOW);
    const first = await repos.review.acquirePublishLock(admin.id, at);
    expect(first).toEqual({ id: expect.any(Number), token: NOW });
    expect(await repos.review.acquirePublishLock(admin.id, at)).toBeNull();
    expect(await repos.review.acquirePublishLock(admin.id, new Date(at.getTime() + 11 * 60 * 1000))).toEqual({ id: expect.any(Number), token: expect.any(String) });
    await resetDb(db);
    const admin2 = await createUser(db, 'admin');
    const lock = await repos.review.acquirePublishLock(admin2.id, at);
    await repos.review.releasePublishLock(lock!);
    expect(await repos.review.acquirePublishLock(admin2.id, at)).toEqual({ id: expect.any(Number), token: expect.any(String) });
  });

  it('keeps a taken-over lock safe from the previous holder', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    await repos.review.approve({ id: a.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const statusId = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: NOW });
    const t0 = new Date(NOW);
    const lockA = await repos.review.acquirePublishLock(admin.id, t0);
    const t1 = new Date(t0.getTime() + 11 * 60 * 1000);
    const lockB = await repos.review.acquirePublishLock(admin.id, t1);
    expect(lockA).not.toBeNull();
    expect(lockB).not.toBeNull();
    await repos.review.releasePublishLock(lockA!);
    expect(await repos.review.acquirePublishLock(admin.id, t1)).toBeNull();
    await expect(repos.review.completePublish({ lock: lockA!, commitSha: 'zzz', results: [{ id: a.id, outcome: 'applied' }], statusChangeIds: [statusId] })).rejects.toThrow('publish lock lost');
    await expect(repos.review.completePublish({ lock: lockA!, commitSha: null, results: [{ id: a.id, outcome: 'superseded' }], statusChangeIds: [] })).rejects.toThrow('publish lock lost');
    expect(await statusOf(a.id)).toBe('approved');
    expect(await repos.review.listPendingStatusChanges()).toHaveLength(1);
    expect(await db.prepare('SELECT commit_sha, created_at FROM publish_batches').all()).toMatchObject({ results: [{ commit_sha: null, created_at: lockB!.token }] });
  });

  it('blocks rejecting an approved suggestion only while a live publish lock exists', async () => {
    const admin = await createUser(db, 'admin');
    const approvedRow = await pending();
    const pendingRow = await pending({ key: 'b' });
    const conflictRow = await pending({ key: 'c' });
    await repos.review.approve({ id: approvedRow.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    await db.prepare("UPDATE suggestions SET status = 'conflict' WHERE id = ?").bind(conflictRow.id).run();
    await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    const reject = (id: number, now = NOW) => repos.review.reject({ id, reviewerId: admin.id, reason: null, now });
    expect(await reject(approvedRow.id)).toBe('publish_in_progress');
    expect(await statusOf(approvedRow.id)).toBe('approved');
    expect(await reject(pendingRow.id)).toBe('rejected');
    expect(await reject(conflictRow.id)).toBe('rejected');
    const afterStale = new Date(new Date(NOW).getTime() + 11 * 60 * 1000).toISOString();
    expect(await reject(approvedRow.id, afterStale)).toBe('rejected');
  });

  it('refuses to reject published, superseded or rejected suggestions', async () => {
    const admin = await createUser(db, 'admin');
    const done = await pending();
    const sup = await pending({ authorHash: 'h2' });
    const rej = await pending({ key: 'b' });
    await repos.review.approve({ id: done.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    await repos.review.reject({ id: rej.id, reviewerId: admin.id, reason: null, now: NOW });
    const lock = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ lock: lock!, commitSha: 'c1', results: [{ id: done.id, outcome: 'applied' }], statusChangeIds: [] });
    for (const id of [done.id, sup.id, rej.id]) {
      expect(await repos.review.reject({ id, reviewerId: admin.id, reason: 'no', now: NOW })).toBe('not_rejectable');
    }
  });

  it('completes a publish: statuses, batch row and status changes', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    const b = await pending({ key: 'b', authorHash: 'h2' });
    for (const id of [a.id, b.id]) await repos.review.approve({ id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const statusId = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ lock: batchId!, commitSha: 'abc123', results: [{ id: a.id, outcome: 'applied' }, { id: b.id, outcome: 'conflict' }], statusChangeIds: [statusId] });
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'published' });
    expect(await statusOf(b.id)).toBe('conflict');
    expect(await db.prepare('SELECT commit_sha, suggestion_count FROM publish_batches').first()).toEqual({ commit_sha: 'abc123', suggestion_count: 1 });
    expect(await db.prepare('SELECT batch_id FROM suggestions WHERE id = ?').bind(a.id).first()).toEqual({ batch_id: batchId!.id });
    expect(await repos.review.listPendingStatusChanges()).toEqual([]);
  });

  it('completes a publish with more than 100 ids without exceeding bound-parameter limits', async () => {
    const admin = await createUser(db, 'admin');
    const ids: number[] = [];
    for (let i = 0; i < 120; i += 1) ids.push((await pending({ key: `k${i}`, authorHash: `h${i}` })).id);
    for (const id of ids) await repos.review.approve({ id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const statusIds: number[] = [];
    for (let i = 0; i < 105; i += 1) statusIds.push(await repos.review.addStatusChange({ modId: `m${i}`, status: 'partial', createdBy: admin.id, now: NOW }));
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    const batchSizes: number[] = [];
    const counting = { prepare: (sql: string) => db.prepare(sql), batch: (stmts: D1PreparedStatement[]) => { batchSizes.push(stmts.length); return db.batch(stmts); } };
    const results = ids.map((id, i) => ({ id, outcome: (['applied', 'conflict', 'superseded'] as const)[i % 3] ?? 'applied' }));
    await createD1Repos(counting as unknown as D1Database).review.completePublish({ lock: batchId!, commitSha: 'big', results, statusChangeIds: statusIds });
    // 語句數固定，與 id 數量無關（D1 每次呼叫的查詢數上限）
    expect(batchSizes).toEqual([5]);
    const count = (status: string) => db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE status = ?').bind(status).first();
    expect(await count('published')).toEqual({ n: 40 });
    expect(await count('conflict')).toEqual({ n: 40 });
    expect(await count('superseded')).toEqual({ n: 40 });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE batch_id = ?').bind(batchId!.id).first()).toEqual({ n: 40 });
    expect(await repos.review.listPendingStatusChanges()).toEqual([]);
  });

  it('completes a publish without a commit by dropping the batch row', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    await repos.review.approve({ id: a.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ lock: batchId!, commitSha: null, results: [{ id: a.id, outcome: 'superseded' }], statusChangeIds: [] });
    expect(await statusOf(a.id)).toBe('superseded');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first()).toEqual({ n: 0 });
  });
});
