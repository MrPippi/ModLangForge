/**
 * 靜態資產的安全標頭（與 apps/site/public/_headers 的 `/*` 區塊逐字相同，測試會比對）。
 * Worker 自行組出的頁面（如 /contributors/<id>/ 頁殼）需手動帶上。
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc-heads.net; connect-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

/** 回傳帶上安全標頭的新 Response（不修改原物件）；Worker 產生的回應不會套用 _headers */
export function withSecurityHeaders(res: Response, status: number = res.status): Response {
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(res.body, { status, statusText: res.statusText, headers });
}
