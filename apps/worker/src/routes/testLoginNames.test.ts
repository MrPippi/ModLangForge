import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createD1Repos } from '../repo';
import { writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

const LOCAL = 'http://localhost:8787';
let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

async function login(providerUserId: string, username: string, displayName: string): Promise<number> {
  const res = await createApp(testDeps()).request('/api/v1/auth/test-login', {
    method: 'POST',
    headers: { ...(await writeHeaders()), Origin: LOCAL },
    body: JSON.stringify({ provider: 'discord', providerUserId, username, displayName }),
  }, testEnv({ DB: db, SITE_URL: LOCAL, TEST_LOGIN_ENABLED: 'true' }));
  expect(res.status).toBe(200);
  return (await readJson<{ id: number }>(res)).data.id;
}

describe('new user display names', () => {
  it('stores a sanitized provider display name', async () => {
    const id = await login('n1', 'eve', 'Eve\nCo-authored-by: x\u202e');
    expect((await createD1Repos(db).users.findById(id))?.displayName).toBe('Eve Co-authored-by: x');
  });

  it('falls back to the username when the display name is only whitespace', async () => {
    const id = await login('n2', 'bob', ' \u200b ');
    expect((await createD1Repos(db).users.findById(id))?.displayName).toBe('bob');
  });
});
