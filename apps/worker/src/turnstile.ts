import type { FetchLike } from './appEnv';

const VERIFY_TIMEOUT_MS = 5000;

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 伺服器端驗證 Turnstile token；expectedHostname 非 null 時回應的 hostname 必須相符；任何錯誤都視為未通過 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string,
  fetchImpl: FetchLike = fetch,
  expectedHostname: string | null = null,
): Promise<boolean> {
  if (token === '') return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  body.set('remoteip', ip);
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown; hostname?: unknown };
    if (data.success !== true) return false;
    return expectedHostname === null || data.hostname === expectedHostname;
  } catch (err) {
    console.error('turnstile verify failed', err);
    return false;
  }
}
