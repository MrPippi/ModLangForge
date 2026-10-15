import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';

const root = fileURLToPath(new URL('../../..', import.meta.url).href);

/** 依外鍵相依順序清空 */
const TABLES = ['suggestions', 'mod_status_changes', 'publish_batches', 'identities', 'users', 'rate_events', 'blocked_subjects'] as const;

let pending: Promise<PlatformProxy<{ DB: D1Database }>> | null = null;

async function createProxy(): Promise<PlatformProxy<{ DB: D1Database }>> {
  // wrangler 會檢查 assets 目錄存在；測試不需要先建置網站
  mkdirSync(join(root, 'apps', 'site', 'dist'), { recursive: true });
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(root, 'wrangler.jsonc'),
    persist: { path: mkdtempSync(join(tmpdir(), 'mlf-d1-')) },
  });
  const dir = join(root, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const statements = readFileSync(join(dir, file), 'utf8').split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
    await proxy.env.DB.batch(statements.map((s) => proxy.env.DB.prepare(s)));
  }
  return proxy;
}

/** 每個測試檔共用一個本機 D1（vitest 預設每檔隔離模組） */
export async function testDb(): Promise<D1Database> {
  pending ??= createProxy();
  return (await pending).env.DB;
}

export async function resetDb(db: D1Database): Promise<void> {
  await db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)));
}

export async function disposeTestDb(): Promise<void> {
  const current = pending;
  pending = null;
  if (current) await (await current).dispose();
}

/** 不經 UserRepo 直接建立使用者（供外鍵需要） */
export async function seedUser(db: D1Database, displayName = '測試者'): Promise<number> {
  const row = await db
    .prepare('INSERT INTO users (display_name, created_at) VALUES (?, ?) RETURNING id')
    .bind(displayName, '2026-10-15T00:00:00.000Z')
    .first<{ id: number }>();
  if (!row) throw new Error('seed user failed');
  return row.id;
}
