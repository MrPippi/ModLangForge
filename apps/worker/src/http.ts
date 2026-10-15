import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json({ ok: true, data }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ ok: false, error: { code, message } }, status);
}
