import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { createD1Repo } from './d1Repo';
import { repoContract } from './repo.contract';

const root = fileURLToPath(new URL('../../../..', import.meta.url).href);
const disposers: (() => Promise<void>)[] = [];
afterAll(async () => { await Promise.all(disposers.map((d) => d())); });

async function freshDb(): Promise<D1Database> {
  // wrangler validates the assets dir; do not require a site build for tests
  mkdirSync(join(root, 'apps', 'site', 'dist'), { recursive: true });
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(root, 'wrangler.jsonc'),
    persist: { path: mkdtempSync(join(tmpdir(), 'mlf-d1-')) },
  });
  disposers.push(proxy.dispose);
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
    await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  }
  return proxy.env.DB;
}

repoContract('d1', async () => createD1Repo(await freshDb()));

describe('d1 repo blocking', () => {
  it('reads blocked_subjects', async () => {
    const db = await freshDb();
    await db.prepare('INSERT INTO blocked_subjects (subject, created_at) VALUES (?, ?)').bind('ip:bad', '2026-10-15').run();
    expect(await createD1Repo(db).isBlocked(['user:1', 'ip:bad'])).toBe(true);
  });
});
