import { Hono } from 'hono';
import type { Env } from './env';
import { missingEnv } from './env';
import { fail } from './http';

export interface AppDeps {
  readonly [name: string]: unknown;
}

export function createApp(_deps: AppDeps): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/api/*', async (c, next) => {
    const missing = missingEnv(c.env);
    if (missing.length > 0) {
      console.error('missing env', missing);
      return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
    }
    await next();
  });

  app.all('/api/*', (c) => fail(c, 404, 'not_found', '找不到這個 API。'));
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));
  app.onError((err, c) => {
    console.error('unhandled', err);
    return fail(c, 500, 'internal', '伺服器發生錯誤，請稍後再試。');
  });
  return app;
}
