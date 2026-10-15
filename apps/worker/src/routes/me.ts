import type { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ensureCsrf } from '../auth/csrf';
import { ok } from '../http';

export function registerMeRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/me', async (c) => {
    const csrfToken = ensureCsrf(c);
    const user = c.get('user');
    if (!user) return ok(c, { user: null, csrfToken });
    const identities = await c.get('repos').users.listIdentities(user.id);
    return ok(c, { user: { ...user, identities: identities.map((i) => ({ provider: i.provider, username: i.username })) }, csrfToken });
  });
}
