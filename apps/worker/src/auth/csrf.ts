import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Ctx } from '../appEnv';
import { fail } from '../http';
import { randomToken, safeEqual } from './crypto';
import { COOKIE_DEFAULTS, SESSION_TTL_SEC } from './session';

export const CSRF_COOKIE = 'mlf_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 取得或建立 CSRF token（HttpOnly cookie；前端由 GET /api/v1/me 取得值） */
export function ensureCsrf(c: Ctx): string {
  const existing = getCookie(c, CSRF_COOKIE);
  if (existing && TOKEN_PATTERN.test(existing)) return existing;
  const token = randomToken();
  setCookie(c, CSRF_COOKIE, token, { ...COOKIE_DEFAULTS, maxAge: SESSION_TTL_SEC });
  return token;
}

/** 所有寫入 API：Origin 必須等於 SITE_URL，header 與 cookie 的 CSRF token 必須一致 */
export const requireWrite: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.header('Origin') !== c.env.SITE_URL) return fail(c, 403, 'bad_origin', '請從本站送出請求。');
  const cookie = getCookie(c, CSRF_COOKIE) ?? '';
  const header = c.req.header(CSRF_HEADER) ?? '';
  if (cookie === '' || !safeEqual(cookie, header)) return fail(c, 403, 'bad_csrf', '頁面已過期，請重新整理後再試。');
  await next();
};
