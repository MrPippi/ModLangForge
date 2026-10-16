import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { MOD_ID_PATTERN } from '@mlf/core/catalog';

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json({ ok: true, data }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ ok: false, error: { code, message } }, status);
}

/** 註冊在正確方法之後，攔下其他方法 */
export function methodNotAllowed(allow: readonly string[]) {
  return (c: Context): Response => {
    c.header('Allow', allow.join(', '));
    return fail(c, 405, 'method_not_allowed', '不支援這個請求方式。');
  };
}

export const idParam = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const modIdSchema = z.string().regex(MOD_ID_PATTERN).max(64);

export const invalidBody = (c: Context): Response => fail(c, 400, 'invalid_body', '送出的資料格式不正確。');

/** 解析並驗證 JSON 本文；失敗回 400 Response */
export async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : invalidBody(c);
}
