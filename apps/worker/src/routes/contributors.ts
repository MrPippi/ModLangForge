import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Ctx } from '../appEnv';
import { fail, invalidBody, idParam, methodNotAllowed, modIdSchema, ok } from '../http';
import { SECURITY_HEADERS } from '../securityHeaders';

export const RANKING_LIMIT = 100;
const PROFILE_MOD_LIMIT = 200;
/** /contributors/<id>/ 共用的靜態頁殼（apps/site/src/pages/contributors/profile.astro） */
export const PROFILE_SHELL_PATH = '/contributors/profile/';

const rankingQuery = z.object({ modId: modIdSchema.optional() });

/** 以頁殼內容回應任意 /contributors/<id>/；資料由 island 依網址向 API 取得，並補上與靜態資產相同的安全標頭 */
async function serveProfileShell(c: Ctx): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(new Request(new URL(PROFILE_SHELL_PATH, c.req.url), { headers: c.req.raw.headers }));
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(asset.body, { status: asset.ok ? 200 : asset.status, headers });
}

export function registerContributorRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/contributors', async (c) => {
    const query = rankingQuery.safeParse(c.req.query());
    if (!query.success) return invalidBody(c);
    const contributors = await c.get('repos').contributors.ranking({ modId: query.data.modId ?? null, limit: RANKING_LIMIT });
    return ok(c, { contributors });
  });
  app.all('/api/v1/contributors', methodNotAllowed(['GET']));

  app.get('/api/v1/contributors/:id', async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return invalidBody(c);
    const contributor = await c.get('repos').contributors.profile(id.data, PROFILE_MOD_LIMIT);
    return contributor ? ok(c, { contributor }) : fail(c, 404, 'contributor_not_found', '找不到這位貢獻者。');
  });
  app.all('/api/v1/contributors/:id', methodNotAllowed(['GET']));

  app.get('/contributors/:id{[0-9]+}/', (c) => serveProfileShell(c));
  app.get('/contributors/:id{[0-9]+}', (c) => c.redirect(`/contributors/${c.req.param('id')}/`, 301));
}
