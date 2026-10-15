import type { Hono } from 'hono';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { safeEqual } from '../auth/crypto';
import { requireWrite } from '../auth/csrf';
import { callbackUrl, consumeOAuthState, issueOAuthState, safeReturnTo, type AuthMode } from '../auth/oauthState';
import { findProvider, type OAuthProvider } from '../auth/providers';
import { resolveUser } from '../auth/resolveUser';
import { clearSession, issueSession } from '../auth/session';
import { failMisconfigured, missingEnv } from '../env';
import { fail, methodNotAllowed, ok } from '../http';
import { registerTestLogin } from './testLogin';

function redirectWithError(c: Ctx, returnTo: string, code: string): Response {
  const url = new URL(returnTo, c.env.SITE_URL);
  url.searchParams.set('auth_error', code);
  return c.redirect(`${url.pathname}${url.search}`, 302);
}

function providerOrFail(c: Ctx): OAuthProvider | Response {
  const provider = findProvider(c.req.param('provider') ?? '');
  if (!provider) return fail(c, 404, 'not_found', '找不到這個 API。');
  const missing = missingEnv(c.env, provider.name);
  return missing.length > 0 ? failMisconfigured(c, provider.name, missing) : provider;
}

async function handleStart(c: Ctx, deps: AppDeps): Promise<Response> {
  const provider = providerOrFail(c);
  if (provider instanceof Response) return provider;
  const mode: AuthMode = c.req.query('link') === '1' ? 'link' : 'login';
  const returnTo = safeReturnTo(c.req.query('returnTo'));
  if (mode === 'link' && !c.get('user')) return redirectWithError(c, returnTo, 'login_required');
  const state = await issueOAuthState(c, { provider: provider.name, mode, returnTo }, deps.now());
  return c.redirect(provider.authorizeUrl(c.env, state, callbackUrl(c.env.SITE_URL, provider.name)), 302);
}

async function handleCallback(c: Ctx, deps: AppDeps): Promise<Response> {
  const provider = providerOrFail(c);
  if (provider instanceof Response) return provider;
  const now = deps.now();
  const saved = await consumeOAuthState(c, now);
  if (!saved || saved.provider !== provider.name || !safeEqual(saved.state, c.req.query('state') ?? '')) {
    return redirectWithError(c, '/', 'bad_state');
  }
  const code = c.req.query('code');
  if (!code) return redirectWithError(c, saved.returnTo, 'cancelled');
  const ident = await provider
    .fetchIdentity(c.env, code, callbackUrl(c.env.SITE_URL, provider.name), deps.fetch)
    .catch((err: unknown) => {
      console.error('oauth identity failed', provider.name, err instanceof Error ? err.message : 'unknown error');
      return null;
    });
  if (!ident) return redirectWithError(c, saved.returnTo, 'provider_failed');
  const result = await resolveUser(c, provider.name, ident, saved.mode, now);
  if ('error' in result) return redirectWithError(c, saved.returnTo, result.error);
  await issueSession(c, result.user, now);
  return c.redirect(saved.returnTo, 302);
}

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/auth/:provider/start', (c) => handleStart(c, deps));
  app.get('/api/v1/auth/:provider/callback', (c) => handleCallback(c, deps));
  app.post('/api/v1/auth/logout', requireWrite, (c) => {
    clearSession(c);
    return ok(c, { loggedOut: true });
  });
  app.all('/api/v1/auth/logout', methodNotAllowed(['POST']));
  registerTestLogin(app, deps);
}
