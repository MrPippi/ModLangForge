import type { Role } from '@mlf/core/review';
import { CSRF_COOKIE, CSRF_HEADER } from './auth/csrf';
import { SESSION_COOKIE, sessionToken } from './auth/session';
import { createD1Repos } from './repo';
import type { UserRecord } from './repo/types';
import { TEST_NOW } from './testDeps';
import { TEST_SESSION_SECRET } from './testEnv';

export const TEST_ORIGIN = 'https://mlf.test';
export const TEST_CSRF = 'c'.repeat(43);

export async function createUser(db: D1Database, role: Role = 'contributor', displayName = '測試者'): Promise<UserRecord> {
  const id = crypto.randomUUID();
  return createD1Repos(db).users.create({
    displayName, role, identity: { provider: 'github', providerUserId: id, username: `u-${id.slice(0, 8)}` }, now: TEST_NOW.toISOString(),
  });
}

export async function sessionCookie(user: { readonly id: number; readonly sessionVersion: number }): Promise<string> {
  return `${SESSION_COOKIE}=${await sessionToken(user, TEST_SESSION_SECRET, TEST_NOW)}`;
}

/** 寫入請求需要的 header：Origin、CSRF cookie 與 header，及可選的 session */
export async function writeHeaders(user?: { readonly id: number; readonly sessionVersion: number }): Promise<Record<string, string>> {
  const cookies = [`${CSRF_COOKIE}=${TEST_CSRF}`, ...(user ? [await sessionCookie(user)] : [])];
  return { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, Cookie: cookies.join('; '), [CSRF_HEADER]: TEST_CSRF };
}

export function setCookieValue(res: Response, name: string): string | null {
  const header = res.headers.getSetCookie().find((h) => h.startsWith(`${name}=`));
  return header === undefined ? null : (header.slice(name.length + 1).split(';')[0] ?? '');
}
