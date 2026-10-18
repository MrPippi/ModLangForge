import type { Hono } from 'hono';
import { z } from 'zod';
import { ROLES } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, idParam, invalidBody, modIdSchema, ok, parseJson } from '../http';

const roleBody = z.object({ role: z.enum(ROLES) });
const banBody = z.object({ banned: z.boolean() });
const MAX_REVIEW_MODS = 500;
const reviewModsBody = z.object({ modIds: z.array(modIdSchema).max(MAX_REVIEW_MODS) });
const MAX_USERS = 50;
const MAX_QUERY = 64;
const queryParam = z.string().max(MAX_QUERY).catch('');

function targetId(c: Ctx): number | Response {
  const parsed = idParam.safeParse(c.req.param('id'));
  if (!parsed.success) return invalidBody(c);
  if (parsed.data === c.get('user')?.id) return fail(c, 400, 'self_change', '不能變更自己的角色或停權狀態。');
  return parsed.data;
}

const notFound = (c: Ctx) => fail(c, 404, 'user_not_found', '找不到這位使用者。');

export function registerAdminUserRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/users', requirePermission('manage'), async (c) => {
    const query = queryParam.parse(c.req.query('q') ?? '').trim();
    return ok(c, { users: await c.get('repos').users.search(query, MAX_USERS) });
  });

  app.post('/api/v1/admin/users/:id/role', requireWrite, requirePermission('manage'), async (c) => {
    const id = targetId(c);
    if (id instanceof Response) return id;
    const body = await parseJson(c, roleBody);
    if (body instanceof Response) return body;
    const user = await c.get('repos').users.setRole(id, body.role);
    return user ? ok(c, { id: user.id, role: user.role }) : notFound(c);
  });

  app.post('/api/v1/admin/users/:id/review-mods', requireWrite, requirePermission('manage'), async (c) => {
    const id = targetId(c);
    if (id instanceof Response) return id;
    const body = await parseJson(c, reviewModsBody);
    if (body instanceof Response) return body;
    const repos = c.get('repos');
    if (!(await repos.users.findById(id))) return notFound(c);
    await repos.reviewScopes.replace(id, body.modIds, deps.now().toISOString());
    return ok(c, { id, reviewMods: await repos.reviewScopes.list(id) });
  });

  app.post('/api/v1/admin/users/:id/ban', requireWrite, requirePermission('manage'), async (c) => {
    const id = targetId(c);
    if (id instanceof Response) return id;
    const body = await parseJson(c, banBody);
    if (body instanceof Response) return body;
    const user = await c.get('repos').users.setBanned(id, body.banned);
    return user ? ok(c, { id: user.id, banned: user.banned }) : notFound(c);
  });
}
