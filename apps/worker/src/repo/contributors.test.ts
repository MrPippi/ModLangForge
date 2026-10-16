import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

let seq = 0;
async function suggestion(authorId: number | null, modId: string, status = 'published'): Promise<void> {
  seq += 1;
  await db.prepare(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
                    VALUES (?, ?, 'x', ?, 'h', ?, '2026-10-15T00:00:00.000Z')`).bind(modId, `k${seq}`, authorId, status).run();
}

const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

async function seedWorld() {
  const repos = createD1Repos(db);
  const alice = await createUser(db, 'contributor', 'Alice');
  const bob = await createUser(db, 'contributor', 'Bob');
  const carol = await createUser(db, 'contributor', 'Carol');
  const dave = await createUser(db, 'contributor', 'Dave');
  for (const mod of ['create', 'create', 'jei']) await suggestion(alice.id, mod);
  await suggestion(bob.id, 'create');
  await suggestion(bob.id, 'create', 'pending');
  await suggestion(bob.id, 'create', 'approved');
  for (let i = 0; i < 5; i += 1) await suggestion(carol.id, 'create');
  for (let i = 0; i < 4; i += 1) await suggestion(dave.id, 'create');
  for (let i = 0; i < 6; i += 1) await suggestion(null, 'create');
  await repos.users.updateProfile(carol.id, { isPublic: false });
  await repos.users.setBanned(dave.id, true);
  await repos.users.setMinecraft(alice.id, { name: 'Steve', uuid: STEVE_UUID });
  return { repos, alice, bob, carol, dave };
}

describe('ContributorRepo', () => {
  it('ranks only public, unbanned authors by published count', async () => {
    const { repos, alice, bob } = await seedWorld();
    expect(await repos.contributors.ranking({ modId: null, limit: 100 })).toEqual([
      { id: alice.id, displayName: 'Alice', minecraftUuid: STEVE_UUID, published: 3, mods: 2, topMods: ['create', 'jei'] },
      { id: bob.id, displayName: 'Bob', minecraftUuid: null, published: 1, mods: 1, topMods: ['create'] },
    ]);
  });

  it('filters by mod and honours the limit', async () => {
    const { repos, alice } = await seedWorld();
    expect(await repos.contributors.ranking({ modId: 'jei', limit: 100 })).toEqual([
      { id: alice.id, displayName: 'Alice', minecraftUuid: STEVE_UUID, published: 1, mods: 1, topMods: ['jei'] },
    ]);
    expect(await repos.contributors.ranking({ modId: null, limit: 1 })).toHaveLength(1);
  });

  it('lists at most 3 top mods ordered by count then id', async () => {
    const user = await createUser(db, 'contributor', 'Many');
    for (const mod of ['d', 'c', 'b', 'a', 'a', 'a', 'c']) await suggestion(user.id, mod);
    const [row] = await createD1Repos(db).contributors.ranking({ modId: null, limit: 10 });
    expect(row?.mods).toBe(4);
    expect(row?.topMods).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by the earliest published suggestion', async () => {
    const late = await createUser(db, 'contributor', 'Late');
    const early = await createUser(db, 'contributor', 'Early');
    await suggestion(early.id, 'create');
    await suggestion(late.id, 'create');
    expect((await createD1Repos(db).contributors.ranking({ modId: null, limit: 10 })).map((c) => c.displayName)).toEqual(['Early', 'Late']);
  });

  it('builds a profile with per-mod counts and hides private, banned or empty ones', async () => {
    const { repos, alice, bob, carol, dave } = await seedWorld();
    expect(await repos.contributors.profile(alice.id, 100)).toEqual({
      id: alice.id, displayName: 'Alice', minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false,
      published: 3, mods: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
    });
    expect((await repos.contributors.profile(alice.id, 1))?.mods).toEqual([{ modId: 'create', count: 2 }]);
    expect((await repos.contributors.profile(alice.id, 1))?.published).toBe(3);
    expect((await repos.contributors.profile(bob.id, 100))?.published).toBe(1);
    expect(await repos.contributors.profile(carol.id, 100)).toBeNull();
    expect(await repos.contributors.profile(dave.id, 100)).toBeNull();
    const idle = await createUser(db, 'contributor', 'Idle');
    expect(await repos.contributors.profile(idle.id, 100)).toBeNull();
  });
});
