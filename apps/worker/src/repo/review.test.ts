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
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: '用詞不一致', now: NOW })).toBe(true);
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'rejected', reviewNote: '用詞不一致' });
    expect(await repos.review.reject({ id: a.id, reviewerId: reviewer.id, reason: null, now: NOW })).toBe(false);
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
    expect(first).toEqual(expect.any(Number));
    expect(await repos.review.acquirePublishLock(admin.id, at)).toBeNull();
    expect(await repos.review.acquirePublishLock(admin.id, new Date(at.getTime() + 11 * 60 * 1000))).toEqual(expect.any(Number));
    await resetDb(db);
    const admin2 = await createUser(db, 'admin');
    const lock = await repos.review.acquirePublishLock(admin2.id, at);
    await repos.review.releasePublishLock(lock!);
    expect(await repos.review.acquirePublishLock(admin2.id, at)).toEqual(expect.any(Number));
  });

  it('completes a publish: statuses, batch row and status changes', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    const b = await pending({ key: 'b', authorHash: 'h2' });
    for (const id of [a.id, b.id]) await repos.review.approve({ id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const statusId = await repos.review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ batchId: batchId!, commitSha: 'abc123', results: [{ id: a.id, outcome: 'applied' }, { id: b.id, outcome: 'conflict' }], statusChangeIds: [statusId] });
    expect(await repos.review.findById(a.id)).toMatchObject({ status: 'published' });
    expect(await statusOf(b.id)).toBe('conflict');
    expect(await db.prepare('SELECT commit_sha, suggestion_count FROM publish_batches').first()).toEqual({ commit_sha: 'abc123', suggestion_count: 1 });
    expect(await db.prepare('SELECT batch_id FROM suggestions WHERE id = ?').bind(a.id).first()).toEqual({ batch_id: batchId });
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
    await repos.review.completePublish({ batchId: batchId!, commitSha: 'big', results: ids.map((id) => ({ id, outcome: 'applied' as const })), statusChangeIds: statusIds });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'published'").first()).toEqual({ n: 120 });
    expect(await repos.review.listPendingStatusChanges()).toEqual([]);
  });

  it('completes a publish without a commit by dropping the batch row', async () => {
    const admin = await createUser(db, 'admin');
    const a = await pending();
    await repos.review.approve({ id: a.id, reviewerId: admin.id, proposed: 'x', formatWarning: false, now: NOW });
    const batchId = await repos.review.acquirePublishLock(admin.id, new Date(NOW));
    await repos.review.completePublish({ batchId: batchId!, commitSha: null, results: [{ id: a.id, outcome: 'superseded' }], statusChangeIds: [] });
    expect(await statusOf(a.id)).toBe('superseded');
    expect(await db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first()).toEqual({ n: 0 });
  });
});
