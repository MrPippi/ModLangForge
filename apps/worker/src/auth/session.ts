import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { Ctx, SessionUser } from '../appEnv';
import { signToken, verifyToken } from './signedToken';

export const SESSION_COOKIE = 'mlf_session';
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
export const COOKIE_DEFAULTS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

const payloadSchema = z.object({
  typ: z.literal('session'),
  uid: z.number().int().positive(),
  sv: z.number().int().min(0),
  exp: z.number(),
});

export const epochSeconds = (d: Date): number => Math.floor(d.getTime() / 1000);

export async function sessionToken(user: { readonly id: number; readonly sessionVersion: number }, secret: string, now: Date): Promise<string> {
  return signToken({ typ: 'session', uid: user.id, sv: user.sessionVersion, exp: epochSeconds(now) + SESSION_TTL_SEC }, secret);
}

export async function issueSession(c: Ctx, user: { readonly id: number; readonly sessionVersion: number }, now: Date): Promise<void> {
  setCookie(c, SESSION_COOKIE, await sessionToken(user, c.env.SESSION_SECRET, now), { ...COOKIE_DEFAULTS, maxAge: SESSION_TTL_SEC });
}

export function clearSession(c: Ctx): void {
  deleteCookie(c, SESSION_COOKIE, { ...COOKIE_DEFAULTS, path: '/' });
}

/** 簽章、到期、session_version、停權任一不符都視為未登入 */
export async function loadSessionUser(c: Ctx, now: Date): Promise<SessionUser | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const parsed = payloadSchema.safeParse(await verifyToken(raw, c.env.SESSION_SECRET, epochSeconds(now)));
  if (!parsed.success) return null;
  const user = await c.get('repos').users.findById(parsed.data.uid);
  if (!user || user.banned || user.sessionVersion !== parsed.data.sv) return null;
  return { id: user.id, displayName: user.displayName, role: user.role };
}
