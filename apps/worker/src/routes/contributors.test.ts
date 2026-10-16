import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { SECURITY_HEADERS } from '../securityHeaders';
import { createUser } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());
const call = (path: string, init: RequestInit = {}) => app.request(path, init, testEnv({ DB: db }));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url).href);
const readRepoFile = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

async function publishedBy(name: string, modId = 'create'): Promise<number> {
  const user = await createUser(db, 'contributor', name);
  await db.prepare(`INSERT INTO suggestions (mod_id, key, proposed, author_user_id, author_hash, status, created_at)
                    VALUES (?, ?, 'x', ?, 'h', 'published', '2026-10-15T00:00:00.000Z')`).bind(modId, `k-${name}`, user.id).run();
  return user.id;
}

describe('contributors API', () => {
  it('lists the ranking, optionally filtered by mod', async () => {
    const alice = await publishedBy('Alice');
    await publishedBy('Bob', 'jei');
    const all = await readJson<{ contributors: { id: number }[] }>(await call('/api/v1/contributors'));
    expect(all.data.contributors).toHaveLength(2);
    const create = await readJson<{ contributors: { id: number }[] }>(await call('/api/v1/contributors?modId=create'));
    expect(create.data.contributors.map((c) => c.id)).toEqual([alice]);
    expect((await call('/api/v1/contributors?modId=..%2Fx')).status).toBe(400);
  });

  it('returns a profile, 404 for hidden ones and 400 for bad ids', async () => {
    const alice = await publishedBy('Alice');
    const res = await call(`/api/v1/contributors/${alice}`);
    expect((await readJson<{ contributor: { displayName: string } }>(res)).data.contributor.displayName).toBe('Alice');
    const missing = await call('/api/v1/contributors/999');
    expect([missing.status, (await readJson(missing)).error.code]).toEqual([404, 'contributor_not_found']);
    expect((await call('/api/v1/contributors/abc')).status).toBe(400);
  });

  it('answers 405 for writes and sends no-store', async () => {
    const res = await call('/api/v1/contributors', { method: 'POST' });
    expect(res.status).toBe(405);
    expect((await call('/api/v1/contributors')).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('/contributors/<id>/ page shell', () => {
  it('serves the profile shell for numeric ids and redirects the slash-less form', async () => {
    const page = await call('/contributors/12/');
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('asset:/contributors/profile/');
    const bare = await call('/contributors/12');
    expect(bare.status).toBe(301);
    expect(bare.headers.get('Location')).toBe('/contributors/12/');
  });

  it('sends the same security headers as static assets', async () => {
    const page = await call('/contributors/12/');
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(page.headers.get(name)).toBe(value);
    expect(page.headers.get('Content-Security-Policy')).toContain("img-src 'self' data: https://mc-heads.net");
    expect(page.headers.get('X-Frame-Options')).toBe('DENY');
    expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(page.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('keeps the shared headers identical to the /* block of apps/site/public/_headers', () => {
    const block = readRepoFile('apps/site/public/_headers').split(/\r?\n\r?\n/).find((b) => /^\/\*/m.test(b)) ?? '';
    const parsed = Object.fromEntries(
      block.split(/\r?\n/).filter((l) => /^\s+\S+:\s/.test(l)).map((l) => {
        const i = l.indexOf(':');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    );
    expect(parsed).toEqual(SECURITY_HEADERS);
  });

  it('leaves other paths to static assets', async () => {
    expect(await (await call('/contributors/abc/')).text()).toBe('asset:/contributors/abc/');
    expect(await (await call('/contributors/')).text()).toBe('asset:/contributors/');
  });

  it('routes the new paths to the Worker in wrangler.jsonc', () => {
    const config = readRepoFile('wrangler.jsonc');
    for (const pattern of ['"/api/v1/contributors"', '"/api/v1/contributors/*"', '"/contributors/*"']) expect(config).toContain(pattern);
  });
});
