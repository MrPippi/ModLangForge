import type { Hono } from 'hono';
import { z } from 'zod';
import { lookupEntry, MOD_STATUS_TARGETS, SUGGESTION_LIMITS, SUGGESTION_STATUSES, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { fail, idParam, invalidBody, modIdSchema, ok, parseJson } from '../http';
import { clientIp, hashIp } from '../ipHash';
import { REJECTION_MESSAGES } from './rejections';

const LIST_LIMIT = 500;
const proposedSchema = z.string().max(SUGGESTION_LIMITS.maxChars * 2);
const listQuery = z.object({ status: z.enum(SUGGESTION_STATUSES).default('pending'), modId: modIdSchema.optional() });
const approveBody = z.object({ proposed: proposedSchema.optional() });
const rejectBody = z.object({ reason: z.string().trim().max(SUGGESTION_LIMITS.maxNote).optional() });
const editBody = z.object({ modId: modIdSchema, key: z.string().min(1).max(256), proposed: proposedSchema });
const statusBody = z.object({ status: z.enum(MOD_STATUS_TARGETS) });

const NOT_PENDING = '這條建議已被處理。';

function actorId(c: Ctx): number {
  const user = c.get('user');
  if (!user) throw new Error('requirePermission must run before admin handlers');
  return user.id;
}

function suggestionId(c: Ctx): number | Response {
  const parsed = idParam.safeParse(c.req.param('id'));
  return parsed.success ? parsed.data : invalidBody(c);
}

/** 以 Worker 目前的靜態資產為準重新驗證；回傳現值作為 base_target */
async function checkProposal(
  c: Ctx, deps: AppDeps, modId: string, key: string, proposed: string,
): Promise<Response | { current: string | null; formatWarning: boolean }> {
  const mod = await deps.loadMod(c.env, modId);
  if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const entry = lookupEntry(mod.en, mod.zh, key);
  if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
  const verdict = validateSuggestion({ ...entry, proposed });
  if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);
  return { current: entry.current, formatWarning: verdict.formatWarning };
}

async function handleApprove(c: Ctx, deps: AppDeps): Promise<Response> {
  const id = suggestionId(c);
  if (id instanceof Response) return id;
  const body = await parseJson(c, approveBody);
  if (body instanceof Response) return body;
  const review = c.get('repos').review;
  const target = await review.findById(id);
  if (!target) return fail(c, 404, 'suggestion_not_found', '找不到這條建議。');
  if (target.status !== 'pending') return fail(c, 409, 'not_pending', NOT_PENDING);
  const proposed = body.proposed ?? target.proposed;
  const checked = await checkProposal(c, deps, target.modId, target.key, proposed);
  if (checked instanceof Response) return checked;
  const done = await review.approve({ id, reviewerId: actorId(c), proposed, formatWarning: checked.formatWarning, now: deps.now().toISOString() });
  return done ? ok(c, { id }) : fail(c, 409, 'not_pending', NOT_PENDING);
}

async function handleReject(c: Ctx, deps: AppDeps): Promise<Response> {
  const id = suggestionId(c);
  if (id instanceof Response) return id;
  const body = await parseJson(c, rejectBody);
  if (body instanceof Response) return body;
  const review = c.get('repos').review;
  if (!(await review.findById(id))) return fail(c, 404, 'suggestion_not_found', '找不到這條建議。');
  const outcome = await review.reject({ id, reviewerId: actorId(c), reason: body.reason || null, now: deps.now().toISOString() });
  if (outcome === 'publish_in_progress') return fail(c, 409, 'publish_in_progress', '發佈進行中，請稍後再退回');
  return outcome === 'rejected' ? ok(c, { id }) : fail(c, 409, 'not_pending', NOT_PENDING);
}

async function handleEdit(c: Ctx, deps: AppDeps): Promise<Response> {
  const body = await parseJson(c, editBody);
  if (body instanceof Response) return body;
  const checked = await checkProposal(c, deps, body.modId, body.key, body.proposed);
  if (checked instanceof Response) return checked;
  const id = await c.get('repos').review.createDirectEdit({
    modId: body.modId, key: body.key, baseTarget: checked.current, proposed: body.proposed, formatWarning: checked.formatWarning,
    reviewerId: actorId(c), authorHash: await hashIp(c.env.IP_HASH_SALT, clientIp(c.req.raw)), now: deps.now().toISOString(),
  });
  return ok(c, { id, formatWarning: checked.formatWarning }, 201);
}

async function handleModStatus(c: Ctx, deps: AppDeps): Promise<Response> {
  const modId = modIdSchema.safeParse(c.req.param('modId'));
  if (!modId.success) return invalidBody(c);
  const body = await parseJson(c, statusBody);
  if (body instanceof Response) return body;
  if (!(await deps.loadMod(c.env, modId.data))) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const id = await c.get('repos').review.addStatusChange({ modId: modId.data, status: body.status, createdBy: actorId(c), now: deps.now().toISOString() });
  return ok(c, { id }, 201);
}

export function registerAdminReviewRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/suggestions', requirePermission('review'), async (c) => {
    const query = listQuery.safeParse(c.req.query());
    if (!query.success) return invalidBody(c);
    const suggestions = await c.get('repos').review.list({ status: query.data.status, modId: query.data.modId ?? null, limit: LIST_LIMIT });
    return ok(c, { suggestions });
  });
  app.post('/api/v1/admin/suggestions/:id/approve', requireWrite, requirePermission('review'), (c) => handleApprove(c, deps));
  app.post('/api/v1/admin/suggestions/:id/reject', requireWrite, requirePermission('review'), (c) => handleReject(c, deps));
  app.post('/api/v1/admin/edits', requireWrite, requirePermission('review'), (c) => handleEdit(c, deps));
  app.post('/api/v1/admin/mods/:modId/status', requireWrite, requirePermission('review'), (c) => handleModStatus(c, deps));
}
