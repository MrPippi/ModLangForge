import type { Hono } from 'hono';
import type { AppDeps } from '../app';
import type { AppEnv } from '../appEnv';
import { ensureCsrf } from '../auth/csrf';
import { methodNotAllowed, ok } from '../http';
import { clientIp, hashIp } from '../ipHash';
import { registerProfileRoutes } from './meProfile';

const MY_SUGGESTIONS_LIMIT = 50;

export function registerMeRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/me', async (c) => {
    const csrfToken = ensureCsrf(c);
    const user = c.get('user');
    if (!user) return ok(c, { user: null, csrfToken });
    const identities = await c.get('repos').users.listIdentities(user.id);
    return ok(c, { user: { ...user, identities: identities.map((i) => ({ provider: i.provider, username: i.username })) }, csrfToken });
  });
  app.all('/api/v1/me', methodNotAllowed(['GET']));

  app.get('/api/v1/me/suggestions', async (c) => {
    const user = c.get('user');
    const author = user ? { userId: user.id } : { hash: await hashIp(c.env.IP_HASH_SALT, clientIp(c.req.raw)) };
    return ok(c, { suggestions: await c.get('repos').suggestions.listByAuthor(author, MY_SUGGESTIONS_LIMIT) });
  });
  app.all('/api/v1/me/suggestions', methodNotAllowed(['GET']));

  registerProfileRoutes(app, deps);
}
