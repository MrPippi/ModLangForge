import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';
import { ipSubject, lookupEntry, SUGGESTION_LIMITS, validateSuggestion } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { fail, methodNotAllowed, ok, parseJson } from '../http';
import { clientIp, hashIp } from '../ipHash';

const bodySchema = z.object({
  modId: z.string().regex(MOD_ID_PATTERN).max(64),
  key: z.string().min(1).max(256),
  proposed: z.string().max(SUGGESTION_LIMITS.maxChars * 2),
  note: z.string().max(SUGGESTION_LIMITS.maxNote * 2).optional(),
  turnstileToken: z.string().min(1).max(4096),
});

type Body = z.infer<typeof bodySchema>;

const REJECTION_MESSAGES = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
} as const;

const HOUR_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;

const limitBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => fail(c, 413, 'too_large', '送出的資料太大。'),
});

/** 來源、本文、封鎖、頻率（任何通過格式檢查的嘗試都計數）、人機驗證 */
async function precheck(c: Ctx, deps: AppDeps): Promise<Response | { body: Body; ipHash: string }> {
  if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出建議。');
  const body = await parseJson(c, bodySchema);
  if (body instanceof Response) return body;
  const ip = clientIp(c.req.raw);
  const ipHash = await hashIp(c.env.IP_HASH_SALT, ip);
  const subject = ipSubject(ipHash);
  const repos = c.get('repos');
  if (await repos.blocks.isBlocked([subject])) return fail(c, 403, 'blocked', '此來源已被停止投稿。');
  if (!(await repos.suggestions.tryConsumeRate(subject, deps.now(), SUGGESTION_LIMITS.perHour, HOUR_MS))) {
    return fail(c, 429, 'rate_limited', '送出太頻繁了，請稍後再試。');
  }
  if (!(await deps.verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken, ip))) {
    return fail(c, 403, 'turnstile_failed', '人機驗證未通過，請重新整理後再試。');
  }
  return { body, ipHash };
}

async function handleSubmit(c: Ctx, deps: AppDeps): Promise<Response> {
  const pre = await precheck(c, deps);
  if (pre instanceof Response) return pre;
  const { body, ipHash } = pre;

  const mod = await deps.loadMod(c.env, body.modId);
  if (!mod) return fail(c, 404, 'mod_not_found', '找不到這個模組。');
  const entry = lookupEntry(mod.en, mod.zh, body.key);
  if (!entry) return fail(c, 404, 'key_not_found', '找不到這條譯文。');
  const verdict = validateSuggestion({ ...entry, proposed: body.proposed, note: body.note });
  if (!verdict.ok) return fail(c, 400, verdict.reason, REJECTION_MESSAGES[verdict.reason]);

  const stored = await c.get('repos').suggestions.upsertPending({
    modId: body.modId, key: body.key, baseTarget: entry.current, proposed: body.proposed,
    note: body.note?.trim() || null, formatWarning: verdict.formatWarning,
    authorUserId: null, authorHash: ipHash, createdAt: deps.now().toISOString(),
  });
  return ok(c, { id: stored.id, formatWarning: verdict.formatWarning }, 201);
}

export function registerSuggestionRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post('/api/v1/suggestions', limitBody, (c) => handleSubmit(c, deps));
  app.all('/api/v1/suggestions', methodNotAllowed(['POST']));
}
