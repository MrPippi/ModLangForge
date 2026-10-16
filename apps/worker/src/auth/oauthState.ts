import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { LOGIN_PROVIDERS, type LoginProvider } from '@mlf/core/review';
import type { Ctx } from '../appEnv';
import { randomToken } from './crypto';
import { COOKIE_DEFAULTS, epochSeconds } from './session';
import { signToken, verifyToken } from './signedToken';

export const OAUTH_COOKIE = 'mlf_oauth';
const OAUTH_PATH = '/api/v1/auth';
const OAUTH_TTL_SEC = 10 * 60;
const MAX_RETURN_TO = 512;

export type AuthMode = 'login' | 'link';

const stateSchema = z.object({
  typ: z.literal('oauth'),
  state: z.string().min(16),
  provider: z.enum(LOGIN_PROVIDERS),
  mode: z.enum(['login', 'link']),
  returnTo: z.string(),
  exp: z.number(),
});

export type OAuthState = z.infer<typeof stateSchema>;

/** 只接受站內相對路徑，防止開放轉址 */
export function safeReturnTo(value: string | undefined): string {
  if (!value || value.length > MAX_RETURN_TO) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if ([...value].some((ch) => ch === '\\' || ch.charCodeAt(0) < 0x20)) return '/';
  return value;
}

export function callbackUrl(siteUrl: string, provider: LoginProvider): string {
  return new URL(`/api/v1/auth/${provider}/callback`, siteUrl).href;
}

export async function issueOAuthState(c: Ctx, input: { provider: LoginProvider; mode: AuthMode; returnTo: string }, now: Date): Promise<string> {
  const state = randomToken();
  const token = await signToken({ typ: 'oauth', state, ...input, exp: epochSeconds(now) + OAUTH_TTL_SEC }, c.env.SESSION_SECRET);
  setCookie(c, OAUTH_COOKIE, token, { ...COOKIE_DEFAULTS, path: OAUTH_PATH, maxAge: OAUTH_TTL_SEC });
  return state;
}

/** 讀取並立即刪除 state cookie（一次性） */
export async function consumeOAuthState(c: Ctx, now: Date): Promise<OAuthState | null> {
  const raw = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { ...COOKIE_DEFAULTS, path: OAUTH_PATH });
  const parsed = stateSchema.safeParse(await verifyToken(raw, c.env.SESSION_SECRET, epochSeconds(now)));
  return parsed.success ? parsed.data : null;
}
