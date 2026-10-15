import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { lookupEntry, SUGGESTION_LIMITS, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { Env } from '../env';
import { fail, ok } from '../http';
import { clientIp, hashIp } from '../ipHash';

const bodySchema = z.object({
  modId: z.string().regex(MOD_ID_PATTERN).max(64),
  key: z.string().min(1).max(256),
  proposed: z.string().max(SUGGESTION_LIMITS.maxChars * 2),
  note: z.string().max(SUGGESTION_LIMITS.maxNote * 2).optional(),
  turnstileToken: z.string().max(4096),
});

type Body = z.infer<typeof bodySchema>;
type Ctx = Context<{ Bindings: Env }>;

const REJECTION_MESSAGES = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

const HOUR_MS = 60 * 60 * 1000;

/** 前置檢查：來源、本文、封鎖、人機驗證。失敗回傳 Response，成功回傳 body 與 subject。 */
async function precheck(c: Ctx, deps: AppDeps): Promise<Response | { body: Body; subject: string }> {
  if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出建議。');
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'invalid_body', '送出的資料格式不正確。');
  const ip = clientIp(c.req.raw);
  const subject = `ip:${await hashIp(c.env.IP_HASH_SALT, ip)}`;
  if (await deps.repo(c.env).isBlocked([subject])) return fail(c, 403, 'blocked', '此來源已被停止投稿。');
  if (!(await deps.verifyTurnstile(c.env.TURNSTILE_SECRET, parsed.data.turnstileToken, ip))) {
    return fail(c, 403, 'turnstile_failed', '人機驗證未通過，請重新整理後再試。');
  }
  return { body: parsed.data, subject };
}

async function handleSubmit(c: Ctx, deps: AppDeps): Promise<Response> {
  const pre = await precheck(c, deps);
  if (pre instanceof Response) return pre;
  const { body, subject } = pre;

  const mod = await deps.loadMod(c.env, body.modId);
  if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const entry = lookupEntry(mod.en, mod.zh, body.key);
  if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
  const verdict = validateSuggestion({ ...entry, proposed: body.proposed, note: body.note });
  if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);

  const repo = deps.repo(c.env);
  const now = deps.now();
  const since = new Date(now.getTime() - HOUR_MS).toISOString();
  if ((await repo.countRateEvents(subject, since)) >= SUGGESTION_LIMITS.perHour) {
    return fail(c, 429, 'rate_limited', '送出太頻繁了，請稍後再試。');
  }
  const stored = await repo.upsertPending({
    modId: body.modId, key: body.key, baseTarget: entry.current, proposed: body.proposed,
    note: body.note?.trim() || null, formatWarning: verdict.formatWarning,
    authorUserId: null, authorHash: subject.slice(3), createdAt: now.toISOString(),
  });
  await repo.recordRateEvent(subject, now.toISOString());
  return ok(c, { id: stored.id, formatWarning: verdict.formatWarning }, 201);
}

export function registerSuggestionRoutes(app: Hono<{ Bindings: Env }>, deps: AppDeps): void {
  app.post('/api/v1/suggestions', (c) => handleSubmit(c, deps));
}
