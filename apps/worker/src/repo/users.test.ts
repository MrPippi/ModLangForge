import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { NewIdentity, Repos } from './types';

const NOW = '2026-10-15T00:00:00.000Z';
const gh = (id: string, username: string | null = `gh${id}`): NewIdentity => ({ provider: 'github', providerUserId: id, username });
const dc = (id: string): NewIdentity => ({ provider: 'discord', providerUserId: id, username: `dc${id}` });

let repos: Repos;
beforeEach(async () => {
  const db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

describe('UserRepo', () => {
  it('creates a user with its first identity', async () => {
    const user = await repos.users.create({ displayName: '史蒂夫', role: 'contributor', identity: gh('1'), now: NOW });
    expect(user).toMatchObject({ displayName: '史蒂夫', role: 'contributor', isPublic: true, banned: false, sessionVersion: 0 });
    expect(await repos.users.findById(user.id)).toEqual(user);
    expect(await repos.users.findByIdentity('github', '1')).toEqual(user);
    expect(await repos.users.findByIdentity('discord', '1')).toBeNull();
    expect(await repos.users.listIdentities(user.id)).toEqual([{ ...gh('1'), linkedAt: NOW }]);
  });

  it('returns the same user when two first logins race', async () => {
    const [a, b] = await Promise.all([
      repos.users.create({ displayName: 'A', role: 'contributor', identity: gh('9'), now: NOW }),
      repos.users.create({ displayName: 'A', role: 'contributor', identity: gh('9'), now: NOW }),
    ]);
    expect(a.id).toBe(b.id);
  });

  it('links a second provider and reports conflicts', async () => {
    const alice = await repos.users.create({ displayName: 'Alice', role: 'contributor', identity: gh('1'), now: NOW });
    const bob = await repos.users.create({ displayName: 'Bob', role: 'contributor', identity: gh('2'), now: NOW });
    expect(await repos.users.linkIdentity(alice.id, dc('10'), NOW)).toBe('linked');
    expect(await repos.users.linkIdentity(alice.id, dc('10'), NOW)).toBe('already');
    expect(await repos.users.linkIdentity(bob.id, dc('10'), NOW)).toBe('taken');
    expect(await repos.users.linkIdentity(alice.id, dc('11'), NOW)).toBe('provider_linked');
    expect((await repos.users.findByIdentity('discord', '10'))?.id).toBe(alice.id);
  });

  it('links at most one identity per provider when linking races', async () => {
    const alice = await repos.users.create({ displayName: 'Alice', role: 'contributor', identity: gh('1'), now: NOW });
    const outcomes = await Promise.all([
      repos.users.linkIdentity(alice.id, dc('20'), NOW),
      repos.users.linkIdentity(alice.id, dc('21'), NOW),
    ]);
    expect(outcomes.filter((o) => o === 'linked')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'provider_linked')).toHaveLength(1);
  });

  it('bumps session_version when changing role or ban state', async () => {
    const user = await repos.users.create({ displayName: 'C', role: 'contributor', identity: gh('3'), now: NOW });
    const promoted = await repos.users.setRole(user.id, 'reviewer');
    expect(promoted).toMatchObject({ role: 'reviewer', sessionVersion: 1 });
    const banned = await repos.users.setBanned(user.id, true);
    expect(banned).toMatchObject({ banned: true, sessionVersion: 2 });
    expect(await repos.users.setRole(9999, 'admin')).toBeNull();
    expect(await repos.users.setBanned(9999, true)).toBeNull();
  });

  it('searches by display name or identity username, with identities attached', async () => {
    await repos.users.create({ displayName: '史蒂夫', role: 'contributor', identity: gh('1', 'steve'), now: NOW });
    await repos.users.create({ displayName: 'Alex', role: 'admin', identity: dc('2'), now: NOW });
    expect((await repos.users.search('', 10)).map((u) => u.displayName)).toEqual(['史蒂夫', 'Alex']);
    expect((await repos.users.search('STEVE', 10))[0]).toMatchObject({ displayName: '史蒂夫', identities: [{ provider: 'github', username: 'steve' }] });
    expect((await repos.users.search('ale', 10)).map((u) => u.displayName)).toEqual(['Alex']);
    expect(await repos.users.search('%', 10)).toEqual([]);
  });
});
