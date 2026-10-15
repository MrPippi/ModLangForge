import type { Hono, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { LOGIN_PROVIDERS } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { resolveUser } from '../auth/resolveUser';
import { issueSession } from '../auth/session';
import type { Env } from '../env';
import { fail, ok, parseJson } from '../http';
import { isLocalSite } from '../siteUrl';

const bodySchema = z.object({
  provider: z.enum(LOGIN_PROVIDERS),
  providerUserId: z.string().min(1).max(64),
  username: z.string().min(1).max(64),
  displayName: z.string().min(1).max(64).optional(),
});

/** 只在本機且明確開啟時存在；E2E 用來代替真實 OAuth */
export function testLoginAllowed(env: Env): boolean {
  return env.TEST_LOGIN_ENABLED === 'true' && isLocalSite(env.SITE_URL);
}

/** 先於 Origin／CSRF 檢查，未開啟時一律 404，不洩漏路由存在 */
const hideUnlessAllowed: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!testLoginAllowed(c.env)) return fail(c, 404, 'not_found', '找不到這個 API。');
  await next();
};

export function registerTestLogin(app: Hono<AppEnv>, deps: AppDeps): void {
  app.post('/api/v1/auth/test-login', hideUnlessAllowed, requireWrite, async (c) => {
    const body = await parseJson(c, bodySchema);
    if (body instanceof Response) return body;
    const now = deps.now();
    const ident = { providerUserId: body.providerUserId, username: body.username, displayName: body.displayName ?? body.username };
    const result = await resolveUser(c, body.provider, ident, 'login', now);
    if ('error' in result) return fail(c, 403, result.error, '無法登入。');
    await issueSession(c, result.user, now);
    return ok(c, { id: result.user.id, role: result.user.role });
  });
}
