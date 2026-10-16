import type { Hono } from 'hono';
import { z } from 'zod';
import { isSubject } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, invalidBody, ok, parseJson } from '../http';

const subjectSchema = z.string().refine(isSubject);
const blockBody = z.object({
  subject: subjectSchema,
  reason: z.string().trim().max(200).optional(),
});
const MAX_BLOCKS = 200;

export function registerAdminBlockRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/blocks', requirePermission('manage'), async (c) => ok(c, { blocks: await c.get('repos').blocks.list(MAX_BLOCKS) }));

  app.post('/api/v1/admin/blocks', requireWrite, requirePermission('manage'), async (c) => {
    const body = await parseJson(c, blockBody);
    if (body instanceof Response) return body;
    await c.get('repos').blocks.add(body.subject, body.reason || null, deps.now().toISOString());
    return ok(c, { subject: body.subject }, 201);
  });

  app.delete('/api/v1/admin/blocks/:subject', requireWrite, requirePermission('manage'), async (c) => {
    const subject = subjectSchema.safeParse(c.req.param('subject'));
    if (!subject.success) return invalidBody(c);
    const removed = await c.get('repos').blocks.remove(subject.data);
    return removed ? ok(c, { removed: true }) : fail(c, 404, 'block_not_found', '找不到這筆封鎖。');
  });
}
