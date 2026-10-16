import { Hono } from 'hono';
import type { AppEnv, FetchLike } from './appEnv';
import { envGuard, type Env } from './env';
import { fail } from './http';
import type { ModStrings } from './modSource';
import { withSecurityHeaders } from './securityHeaders';
import type { Repos } from './repo/types';
import { loadSessionUser } from './auth/session';
import { registerAdminBlockRoutes } from './routes/adminBlocks';
import { registerAdminPublishRoutes } from './routes/adminPublish';
import { registerAdminReviewRoutes } from './routes/adminReview';
import { registerAdminUserRoutes } from './routes/adminUsers';
import { registerAuthRoutes } from './routes/auth';
import { registerContributorRoutes } from './routes/contributors';
import { registerMeRoutes } from './routes/me';
import { registerSuggestionRoutes } from './routes/suggestions';

export interface AppDeps {
  readonly repos: (db: D1Database) => Repos;
  readonly verifyTurnstile: (secret: string, token: string, ip: string, expectedHostname: string | null) => Promise<boolean>;
  readonly loadMod: (env: Env, modId: string) => Promise<ModStrings | null>;
  readonly now: () => Date;
  /** 對外 HTTP（OAuth、GitHub）；測試注入假實作 */
  readonly fetch: FetchLike;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // 最先註冊，確保 envGuard 的 500 也帶 no-store
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use('/api/*', envGuard('core'));
  app.use('/api/*', async (c, next) => {
    c.set('repos', deps.repos(c.env.DB));
    c.set('user', await loadSessionUser(c, deps.now()));
    await next();
  });

  registerAuthRoutes(app, deps);
  registerMeRoutes(app, deps);
  registerSuggestionRoutes(app, deps);
  registerAdminUserRoutes(app);
  registerAdminBlockRoutes(app, deps);
  registerAdminReviewRoutes(app, deps);
  registerAdminPublishRoutes(app, deps);
  registerContributorRoutes(app);

  app.all('/api/*', (c) => fail(c, 404, 'not_found', '找不到這個 API。'));
  // Worker 轉出的靜態資產不會套用 _headers，需手動補上安全標頭
  app.all('*', async (c) => withSecurityHeaders(await c.env.ASSETS.fetch(c.req.raw)));
  app.onError((err, c) => {
    console.error('unhandled', err);
    return fail(c, 500, 'internal', '伺服器發生錯誤，請稍後再試。');
  });
  return app;
}
