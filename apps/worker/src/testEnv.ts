import { generateKeyPairSync } from 'node:crypto';
import type { Env } from './env';

const TEST_KEYS = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
/** 與 GitHub 下載格式相同的 PKCS#1 PEM */
export const TEST_GITHUB_KEY = TEST_KEYS.privateKey;
export const TEST_GITHUB_PUBLIC_KEY = TEST_KEYS.publicKey;

export const TEST_SESSION_SECRET = 'test-session-secret-0123456789abcdef';

/** 測試用 Env；ASSETS 回傳 `asset:<path>`，可用 overrides 覆寫 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  const assets = { fetch: async (input: RequestInfo | URL) => new Response(`asset:${new URL(String(input instanceof Request ? input.url : input)).pathname}`) };
  return {
    DB: undefined as unknown as D1Database,
    ASSETS: assets as unknown as Fetcher,
    SITE_URL: 'https://mlf.test',
    TURNSTILE_SECRET: 'test-secret',
    IP_HASH_SALT: 'test-salt',
    SESSION_SECRET: TEST_SESSION_SECRET,
    DISCORD_CLIENT_ID: 'discord-id',
    DISCORD_CLIENT_SECRET: 'discord-secret',
    GITHUB_APP_CLIENT_ID: 'github-id',
    GITHUB_APP_CLIENT_SECRET: 'github-secret',
    GITHUB_API_BASE: 'https://api.github.test',
    GITHUB_APP_ID: '1',
    GITHUB_APP_PRIVATE_KEY: TEST_GITHUB_KEY,
    GITHUB_INSTALLATION_ID: '99',
    REPO: 'MrPippi/ModLangForge',
    MOJANG_API_BASE: 'https://mojang.test',
    ...overrides,
  };
}
