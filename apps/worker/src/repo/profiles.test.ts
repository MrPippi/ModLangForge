import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { createD1Repos } from './index';
import type { Repos } from './types';

const NOW = '2026-10-15T00:00:00.000Z';
const STEVE_UUID = '8667ba71b85a4004af54457a9734eed7';

let repos: Repos;
beforeEach(async () => {
  const db = await testDb();
  await resetDb(db);
  repos = createD1Repos(db);
});
afterAll(disposeTestDb);

const newUser = () => repos.users.create({
  displayName: '史蒂夫', role: 'contributor', identity: { provider: 'github', providerUserId: '1', username: 'steve' }, now: NOW,
});

describe('UserRepo profile', () => {
  it('reads the default profile and returns null for unknown ids', async () => {
    const user = await newUser();
    expect(await repos.users.getProfile(user.id)).toEqual({
      id: user.id, displayName: '史蒂夫', isPublic: true, minecraftName: null, minecraftUuid: null, minecraftVerified: false,
    });
    expect(await repos.users.getProfile(999)).toBeNull();
  });

  it('updates only the given fields and keeps the session version', async () => {
    const user = await newUser();
    expect((await repos.users.updateProfile(user.id, { isPublic: false }))?.isPublic).toBe(false);
    expect(await repos.users.updateProfile(user.id, { displayName: '艾力克斯' })).toMatchObject({ displayName: '艾力克斯', isPublic: false });
    expect((await repos.users.findById(user.id))?.sessionVersion).toBe(0);
    expect(await repos.users.updateProfile(999, { isPublic: true })).toBeNull();
  });

  it('sets and clears the Minecraft profile, always unverified', async () => {
    const user = await newUser();
    expect(await repos.users.setMinecraft(user.id, { name: 'Steve', uuid: STEVE_UUID }))
      .toMatchObject({ minecraftName: 'Steve', minecraftUuid: STEVE_UUID, minecraftVerified: false });
    expect(await repos.users.setMinecraft(user.id, null)).toMatchObject({ minecraftName: null, minecraftUuid: null, minecraftVerified: false });
    expect(await repos.users.setMinecraft(999, null)).toBeNull();
  });
});
