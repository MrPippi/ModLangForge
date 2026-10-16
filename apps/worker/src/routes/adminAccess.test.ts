// apps/worker/src/routes/adminAccess.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@mlf/core/review';
import { createApp } from '../app';
import { createUser, writeHeaders } from '../testAuth';
import { disposeTestDb, resetDb, testDb } from '../testDb';
import { readJson, testDeps } from '../testDeps';
import { testEnv } from '../testEnv';

interface Endpoint {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly route: string;
  readonly path: string;
  readonly body?: unknown;
  readonly minRole: 'reviewer' | 'admin';
}

/** 每支 admin API 都必須列在這裡；第一個測試會比對 app.routes，漏列即失敗 */
const ADMIN_ENDPOINTS: readonly Endpoint[] = [
  { method: 'GET', route: '/api/v1/admin/users', path: '/api/v1/admin/users', minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/users/:id/role', path: '/api/v1/admin/users/999/role', body: { role: 'reviewer' }, minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/users/:id/ban', path: '/api/v1/admin/users/999/ban', body: { banned: true }, minRole: 'admin' },
  { method: 'GET', route: '/api/v1/admin/blocks', path: '/api/v1/admin/blocks', minRole: 'admin' },
  { method: 'POST', route: '/api/v1/admin/blocks', path: '/api/v1/admin/blocks', body: { subject: 'user:999' }, minRole: 'admin' },
  { method: 'DELETE', route: '/api/v1/admin/blocks/:subject', path: '/api/v1/admin/blocks/user%3A999', minRole: 'admin' },
  { method: 'GET', route: '/api/v1/admin/suggestions', path: '/api/v1/admin/suggestions', minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/suggestions/:id/approve', path: '/api/v1/admin/suggestions/999/approve', body: {}, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/suggestions/:id/reject', path: '/api/v1/admin/suggestions/999/reject', body: {}, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/edits', path: '/api/v1/admin/edits', body: { modId: 'create', key: 'a', proposed: '新' }, minRole: 'reviewer' },
  { method: 'POST', route: '/api/v1/admin/mods/:modId/status', path: '/api/v1/admin/mods/create/status', body: { status: 'reviewed' }, minRole: 'reviewer' },
];

let db: D1Database;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(disposeTestDb);

const app = createApp(testDeps());

async function call(e: Endpoint, role: Role | null, headerOver: Record<string, string> = {}): Promise<Response> {
  const user = role ? await createUser(db, role) : undefined;
  const headers = { ...(await writeHeaders(user)), ...headerOver };
  return app.request(e.path, { method: e.method, headers, body: e.body === undefined ? undefined : JSON.stringify(e.body) }, testEnv({ DB: db }));
}

describe('admin API access control', () => {
  it('lists every registered admin route', () => {
    const registered = new Set(app.routes.filter((r) => r.path.startsWith('/api/v1/admin/') && r.method !== 'ALL').map((r) => `${r.method} ${r.path}`));
    expect(registered).toEqual(new Set(ADMIN_ENDPOINTS.map((e) => `${e.method} ${e.route}`)));
  });

  describe.each(ADMIN_ENDPOINTS)('$method $route', (e) => {
    it('rejects anonymous visitors with 401', async () => {
      const res = await call(e, null);
      expect(res.status).toBe(401);
      expect((await readJson(res)).error.code).toBe('login_required');
    });

    it('rejects contributors with 403', async () => {
      const res = await call(e, 'contributor');
      expect(res.status).toBe(403);
      expect((await readJson(res)).error.code).toBe('forbidden');
    });

    it.runIf(e.minRole === 'admin')('rejects reviewers with 403', async () => {
      expect((await call(e, 'reviewer')).status).toBe(403);
    });

    it.runIf(e.method !== 'GET')('rejects writes with a bad CSRF token even for admins', async () => {
      const res = await call(e, 'admin', { 'X-CSRF-Token': 'x'.repeat(43) });
      expect((await readJson(res)).error.code).toBe('bad_csrf');
    });

    it.runIf(e.method !== 'GET')('rejects writes from another origin even for admins', async () => {
      const res = await call(e, 'admin', { Origin: 'https://evil.test' });
      expect((await readJson(res)).error.code).toBe('bad_origin');
    });
  });
});
