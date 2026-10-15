import { Hono } from 'hono';
import type { Env } from './env';
import { missingEnv } from './env';
import { fail } from './http';
import type { ModStrings } from './modSource';
import type { SuggestionRepo } from './repo/types';
import { registerSuggestionRoutes } from './routes/suggestions';

export interface AppDeps {
  readonly repo: (env: Env) => SuggestionRepo;
  readonly verifyTurnstile: (secret: string, token: string, ip: string) => Promise<boolean>;
  readonly loadMod: (env: Env, modId: string) => Promise<ModStrings | null>;
  readonly now: () => Date;
}

export function createApp(deps: AppDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/api/*', async (c, next) => {
    const missing = missingEnv(c.env);
    if (missing.length > 0) {
      console.error('missing env', missing);
      return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
    }
    await next();
  });

  registerSuggestionRoutes(app, deps);

  app.all('/api/*', (c) => fail(c, 404, 'not_found', '找不到這個 API。'));
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
  app.onError((err, c) => {
    console.error('unhandled', err);
    return fail(c, 500, 'internal', '伺服器發生錯誤，請稍後再試。');
  });
  return app;
}
