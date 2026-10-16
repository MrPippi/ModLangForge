import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { createFakeGithub, type FakeGithubOptions } from '../github/fakeGithub';
import { MAX_PUBLISH_MODS } from '../publish/runPublish';
import { createD1Repos } from '../repo';
import type { Repos } from '../repo/types';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps, TEST_NOW } from '../testDeps';
import { testEnv } from '../testEnv';

const META = {
  modId: 'create', name: 'Create', aliases: [], summary: '機械動力。', authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  sourceVersions: [{ modVersion: '6.0.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] }],
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: ['原譯者'] },
  updatedAt: '2026-10-01',
};
const repoFiles = (meta: unknown = META): Record<string, string> => ({
  'data/mods/create/en_us.json': '{\n  "a": "Apple %s",\n  "b": "Banana"\n}\n',
  'data/mods/create/zh_tw.json': '{\n  "a": "蘋果 %s"\n}\n',
  'data/mods/create/mod.json': `${JSON.stringify(meta, null, 2)}\n`,
});

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterEach(() => vi.restoreAllMocks());
afterAll(disposeTestDb);

interface SetupOptions extends FakeGithubOptions {
  readonly files?: Record<string, string>;
  readonly repos?: (db: D1Database) => Repos;
  readonly failFetchPath?: RegExp;
}

function setup(opts: SetupOptions = {}) {
  const fake = createFakeGithub(opts.files ?? repoFiles(), opts);
  const fetch: typeof fake.fetch = (input, init) => {
    if (opts.failFetchPath?.test(String(input))) return Promise.reject(new TypeError('network down'));
    return fake.fetch(input, init);
  };
  const app = createApp(testDeps({ fetch, ...(opts.repos ? { repos: opts.repos } : {}) }));
  const publish = async (who: { id: number; sessionVersion: number }, envOver = {}) =>
    app.request('/api/v1/admin/publish', { method: 'POST', headers: await writeHeaders(who), body: '{}' }, testEnv({ DB: db, ...envOver }));
  return { fake, app, publish };
}

async function seedApproved(over: { modId?: string; key?: string; base?: string | null; proposed?: string; author?: string } = {}): Promise<number> {
  const repos = createD1Repos(db);
  const author = await createUser(db, 'contributor', over.author ?? '貢獻者');
  const s = await repos.suggestions.upsertPending({
    modId: over.modId ?? 'create', key: over.key ?? 'a', baseTarget: over.base === undefined ? '蘋果 %s' : over.base, proposed: over.proposed ?? '紅蘋果 %s',
    note: null, formatWarning: false, authorUserId: author.id, authorHash: 'h', createdAt: TEST_NOW.toISOString(),
  });
  await repos.review.approve({ id: s.id, reviewerId: author.id, proposed: s.proposed, formatWarning: false, now: TEST_NOW.toISOString() });
  return s.id;
}

const statusOf = async (id: number) => (await createD1Repos(db).review.findById(id))?.status;
const batchCount = () => db.prepare('SELECT COUNT(*) AS n FROM publish_batches').first();

describe('POST /api/v1/admin/publish', () => {
  it('commits approved changes with credits and marks them published', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const { fake, publish } = setup();
    const res = await publish(admin);
    expect(res.status).toBe(200);
    const data = (await readJson<{ commitSha: string; applied: number }>(res)).data;
    expect(data).toMatchObject({ applied: 1, conflicts: 0, superseded: 0, commitSha: fake.head() });
    expect(fake.fileAtHead('data/mods/create/zh_tw.json')).toBe('{\n  "a": "紅蘋果 %s"\n}\n');
    const meta = JSON.parse(fake.fileAtHead('data/mods/create/mod.json') ?? '{}');
    expect(meta.translation.contributors).toEqual(['原譯者', '貢獻者']);
    expect(meta.updatedAt).toBe('2026-10-15');
    expect(fake.commits().at(-1)?.message).toContain('Mods: create (1)');
    expect(await statusOf(id)).toBe('published');
    expect(await db.prepare('SELECT commit_sha, suggestion_count FROM publish_batches').first()).toEqual({ commit_sha: fake.head(), suggestion_count: 1 });
  });

  it('skips conflicts without creating an empty commit and releases the lock', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved({ base: '別的譯文' });
    const { fake, publish } = setup();
    const before = fake.head();
    const data = (await readJson(await publish(admin))).data;
    expect(data).toMatchObject({ commitSha: null, applied: 0, conflicts: 1 });
    expect(fake.head()).toBe(before);
    expect(fake.commits()).toHaveLength(1);
    expect(await statusOf(id)).toBe('conflict');
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('keeps a status change for a mod missing from the repo pending (no commit)', async () => {
    const admin = await createUser(db, 'admin');
    const review = createD1Repos(db).review;
    await review.addStatusChange({ modId: 'ghost', status: 'reviewed', createdBy: admin.id, now: TEST_NOW.toISOString() });
    const { fake, publish } = setup();
    const res = await publish(admin);
    expect(res.status).toBe(200);
    expect((await readJson(res)).data).toMatchObject({ commitSha: null, applied: 0 });
    expect(fake.commits()).toHaveLength(1);
    expect(await review.listPendingStatusChanges()).toHaveLength(1);
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('retries once when main moves and succeeds', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    const { fake, publish } = setup({ concurrentPushes: 1 });
    expect((await publish(admin)).status).toBe(200);
    expect(fake.fileAtHead('data/mods/create/zh_tw.json')).toContain('紅蘋果');
  });

  it('gives up after main moves twice, keeps everything approved and releases the lock', async () => {
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const res = await setup({ concurrentPushes: 2 }).publish(admin);
    expect(res.status).toBe(409);
    expect((await readJson(res)).error.code).toBe('main_moved');
    expect(await statusOf(id)).toBe('approved');
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('refuses a second publish while one is running', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    await createD1Repos(db).review.acquirePublishLock(admin.id, TEST_NOW);
    const res = await setup().publish(admin);
    expect(res.status).toBe(409);
    expect((await readJson(res)).error.code).toBe('publish_in_progress');
  });

  it('reports GitHub HTTP failures as 502 and releases the lock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const res = await setup({ failPath: /\/git\/trees$/ }).publish(admin);
    expect(res.status).toBe(502);
    expect((await readJson(res)).error.code).toBe('github_failed');
    expect(await statusOf(id)).toBe('approved');
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('reports a network failure as 502 without leaking internals and releases the lock', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const res = await setup({ failFetchPath: /\/git\/commits$/ }).publish(admin);
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain('github_failed');
    expect(body).not.toMatch(/network down|commits|TypeError/);
    expect(await statusOf(id)).toBe('approved');
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('aborts the whole batch when the result fails validation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const { fake, publish } = setup({ files: repoFiles({ ...META, sourceVersions: [] }) });
    const before = fake.head();
    const res = await publish(admin);
    expect(res.status).toBe(422);
    expect((await readJson(res)).error.code).toBe('invalid_data');
    expect(fake.head()).toBe(before);
    expect(await statusOf(id)).toBe('approved');
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('publishes a status-only change', async () => {
    const admin = await createUser(db, 'admin');
    await createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: TEST_NOW.toISOString() });
    const { fake, publish } = setup();
    expect((await publish(admin)).status).toBe(200);
    expect(JSON.parse(fake.fileAtHead('data/mods/create/mod.json') ?? '{}').translation.status).toBe('reviewed');
    expect(await createD1Repos(db).review.listPendingStatusChanges()).toEqual([]);
  });

  it('rejects more than MAX_PUBLISH_MODS mods before taking the lock or calling GitHub', async () => {
    const admin = await createUser(db, 'admin');
    for (let i = 0; i <= MAX_PUBLISH_MODS; i += 1) await seedApproved({ modId: `mod${i}`, author: `作者${i}` });
    const { fake, publish } = setup();
    const res = await publish(admin);
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error.code).toBe('too_many_mods');
    expect(body.error.message).toContain(String(MAX_PUBLISH_MODS));
    expect(fake.requests()).toEqual([]);
    expect(await batchCount()).toEqual({ n: 0 });
  });

  it('allows exactly MAX_PUBLISH_MODS mods through the guard', async () => {
    const admin = await createUser(db, 'admin');
    for (let i = 0; i < MAX_PUBLISH_MODS; i += 1) await seedApproved({ modId: `mod${i}`, author: `作者${i}` });
    const res = await setup().publish(admin);
    expect(res.status).toBe(200);
  });

  it('answers 409 publish_lock_lost when the lock is taken over before completion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const id = await seedApproved();
    const repos = (d: D1Database): Repos => {
      const real = createD1Repos(d);
      return {
        ...real,
        review: {
          ...real.review,
          async completePublish(input) {
            await real.review.releasePublishLock(input.lock);
            await real.review.acquirePublishLock(admin.id, new Date(TEST_NOW.getTime() + 1));
            return real.review.completePublish(input);
          },
        },
      };
    };
    const res = await setup({ repos }).publish(admin);
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error.code).toBe('publish_lock_lost');
    expect(body.error.message).toMatch(/[一-鿿]/);
    expect(await statusOf(id)).toBe('approved');
    expect(await db.prepare("SELECT COUNT(*) AS n FROM publish_batches WHERE commit_sha IS NULL").first()).toEqual({ n: 1 });
  });

  it('returns 400 when there is nothing to publish', async () => {
    const admin = await createUser(db, 'admin');
    expect((await readJson(await setup().publish(admin))).error.code).toBe('nothing_to_publish');
  });

  it('returns 500 misconfigured only when the GitHub App is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const admin = await createUser(db, 'admin');
    const res = await setup().publish(admin, { GITHUB_APP_PRIVATE_KEY: '' });
    expect(res.status).toBe(500);
    expect((await readJson(res)).error.code).toBe('misconfigured');
    expect(JSON.stringify(await res.json().catch(() => ''))).not.toContain('GITHUB');
    const summary = await setup().app.request('/api/v1/admin/publish', { headers: await writeHeaders(admin) }, testEnv({ DB: db, GITHUB_APP_PRIVATE_KEY: '' }));
    expect(summary.status).toBe(200);
  });
});

describe('GET /api/v1/admin/publish', () => {
  it('summarizes approved changes and pending status changes', async () => {
    const admin = await createUser(db, 'admin');
    await seedApproved();
    await seedApproved({ key: 'b', base: null, proposed: '香蕉', author: 'B' });
    await createD1Repos(db).review.addStatusChange({ modId: 'create', status: 'reviewed', createdBy: admin.id, now: TEST_NOW.toISOString() });
    const res = await setup().app.request('/api/v1/admin/publish', { headers: await writeHeaders(admin) }, testEnv({ DB: db }));
    expect((await readJson(res)).data).toEqual({ approved: 2, mods: [{ modId: 'create', count: 2 }], statusChanges: [{ modId: 'create', status: 'reviewed' }] });
  });
});
