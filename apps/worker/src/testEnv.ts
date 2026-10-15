import type { Env } from './env';

/** 測試用 Env；ASSETS 回傳 `asset:<path>`，可用 overrides 覆寫 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  const assets = { fetch: async (input: RequestInfo | URL) => new Response(`asset:${new URL(String(input instanceof Request ? input.url : input)).pathname}`) };
  return {
    DB: undefined as unknown as D1Database,
    ASSETS: assets as unknown as Fetcher,
    SITE_URL: 'https://mlf.test',
    TURNSTILE_SECRET: 'test-secret',
    IP_HASH_SALT: 'test-salt',
    ...overrides,
  };
}
