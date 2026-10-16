import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, seedUser, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewSuggestion, Repos } from './types';

const sample = (over: Partial<NewSuggestion> = {}): NewSuggestion => ({
  modId: 'create', key: 'block.create.cogwheel', baseTarget: '齒輪', proposed: '小齒輪', note: null,
  formatWarning: false, authorUserId: null, authorHash: 'h1', createdAt: '2026-10-15T00:00:00.000Z', ...over,
});

const HOUR = 60 * 60 * 1000;
const AT = new Date('2026-10-15T12:00:00.000Z');

let db: D1Database;
let repos: Repos;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const countRows = async (sql: string) => (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;

describe('SuggestionRepo.upsertPending', () => {
  it('inserts a pending suggestion', async () => {
    expect(await repos.suggestions.upsertPending(sample())).toMatchObject({ id: expect.any(Number), status: 'pending', proposed: '小齒輪' });
  });

  it('overwrites the same anonymous author pending suggestion for the same key', async () => {
    const first = await repos.suggestions.upsertPending(sample());
    const second = await repos.suggestions.upsertPending(sample({ proposed: '大齒輪' }));
    expect(second.id).toBe(first.id);
    expect(await countRows(`SELECT COUNT(*) AS n FROM suggestions WHERE proposed = '大齒輪'`)).toBe(1);
  });

  it('keeps separate rows for different authors or keys', async () => {
    const a = await repos.suggestions.upsertPending(sample());
    const b = await repos.suggestions.upsertPending(sample({ authorHash: 'h2' }));
    const c = await repos.suggestions.upsertPending(sample({ key: 'other' }));
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it('treats a logged-in author as one author across IP hashes', async () => {
    const uid = await seedUser(db);
    const a = await repos.suggestions.upsertPending(sample({ authorUserId: uid, authorHash: 'h1' }));
    const b = await repos.suggestions.upsertPending(sample({ authorUserId: uid, authorHash: 'h2', proposed: '大齒輪' }));
    expect(b.id).toBe(a.id);
  });

  it('does not merge a logged-in author with an anonymous one on the same IP', async () => {
    const uid = await seedUser(db);
    const anon = await repos.suggestions.upsertPending(sample());
    const user = await repos.suggestions.upsertPending(sample({ authorUserId: uid }));
    expect(user.id).not.toBe(anon.id);
  });

  it('does not overwrite suggestions that are no longer pending', async () => {
    const first = await repos.suggestions.upsertPending(sample());
    await db.prepare(`UPDATE suggestions SET status = 'rejected' WHERE id = ?`).bind(first.id).run();
    const second = await repos.suggestions.upsertPending(sample({ proposed: '大齒輪' }));
    expect(second.id).not.toBe(first.id);
  });

  it('keeps exactly one pending row under concurrent upserts', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => repos.suggestions.upsertPending(sample({ proposed: `齒輪${n}` }))));
    expect(await countRows(`SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'`)).toBe(1);
  });
});

describe('SuggestionRepo.tryConsumeRate', () => {
  it('allows up to the limit within the window, per subject', async () => {
    for (let i = 0; i < 3; i += 1) expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)).toBe(true);
    expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)).toBe(false);
    expect(await repos.suggestions.tryConsumeRate('ip:h2', AT, 3, HOUR)).toBe(true);
  });

  it('ignores events outside the window', async () => {
    expect(await repos.suggestions.tryConsumeRate('ip:h1', new Date(AT.getTime() - 2 * HOUR), 1, HOUR)).toBe(true);
    expect(await repos.suggestions.tryConsumeRate('ip:h1', AT, 1, HOUR)).toBe(true);
  });

  it('never exceeds the limit under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => repos.suggestions.tryConsumeRate('ip:h1', AT, 3, HOUR)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it('purges events older than 24h', async () => {
    await repos.suggestions.tryConsumeRate('ip:old', new Date(AT.getTime() - 25 * HOUR), 30, HOUR);
    await repos.suggestions.tryConsumeRate('ip:h1', AT, 30, HOUR);
    expect(await countRows('SELECT COUNT(*) AS n FROM rate_events')).toBe(1);
  });
});

describe('SuggestionRepo.listByAuthor', () => {
  it('lists a user suggestions newest first', async () => {
    const uid = await seedUser(db);
    await repos.suggestions.upsertPending(sample({ authorUserId: uid }));
    await repos.suggestions.upsertPending(sample({ authorUserId: uid, key: 'k2' }));
    await repos.suggestions.upsertPending(sample({ key: 'anon' }));
    const mine = await repos.suggestions.listByAuthor({ userId: uid }, 10);
    expect(mine.map((s) => s.key)).toEqual(['k2', 'block.create.cogwheel']);
    expect(mine[0]).toMatchObject({ status: 'pending', reviewNote: null, reviewedAt: null });
  });

  it('lists anonymous suggestions by hash only, excluding logged-in rows from the same IP', async () => {
    const uid = await seedUser(db);
    await repos.suggestions.upsertPending(sample({ authorUserId: uid, key: 'mine-logged-in' }));
    await repos.suggestions.upsertPending(sample({ key: 'anon' }));
    expect((await repos.suggestions.listByAuthor({ hash: 'h1' }, 10)).map((s) => s.key)).toEqual(['anon']);
  });
});

describe('BlockRepo', () => {
  it('adds, updates the reason, lists, checks and removes subjects', async () => {
    await repos.blocks.add('ip:bad', '洗版', '2026-10-15T00:00:00.000Z');
    await repos.blocks.add('ip:bad', '重複洗版', '2026-10-15T01:00:00.000Z');
    expect(await repos.blocks.isBlocked(['user:1', 'ip:bad'])).toBe(true);
    expect(await repos.blocks.isBlocked([])).toBe(false);
    expect(await repos.blocks.list(10)).toEqual([{ subject: 'ip:bad', reason: '重複洗版', createdAt: '2026-10-15T00:00:00.000Z' }]);
    expect(await repos.blocks.remove('ip:bad')).toBe(true);
    expect(await repos.blocks.remove('ip:bad')).toBe(false);
  });
});
