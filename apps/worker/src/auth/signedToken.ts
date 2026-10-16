import { fromBase64Url, hmacSign, hmacVerify, toBase64Url } from './crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `<base64url(JSON)>.<base64url(HMAC)>`；payload.exp 為 epoch 秒 */
export async function signToken(payload: { readonly exp: number; readonly [k: string]: unknown }, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

export async function verifyToken(token: string | undefined, secret: string, nowSec: number): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const parts = token.split('.');
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) return null;
  if (!(await hmacVerify(secret, body, signature))) return null;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  try {
    const payload: unknown = JSON.parse(decoder.decode(bytes));
    if (typeof payload !== 'object' || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' && exp > nowSec ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
