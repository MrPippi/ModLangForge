export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') || 'unknown';
}

/** SHA-256(salt + ip) 的 hex；不保存原始 IP */
export async function hashIp(salt: string, ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
