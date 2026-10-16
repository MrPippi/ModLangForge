const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalSite(siteUrl: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

/** Turnstile siteverify 回傳的 hostname 應等於本站；本機開發（測試金鑰回 example.com）不比對 */
export function turnstileHostname(siteUrl: string): string | null {
  return isLocalSite(siteUrl) ? null : new URL(siteUrl).hostname;
}
