export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly SITE_URL: string;
  readonly TURNSTILE_SECRET: string;
  readonly IP_HASH_SALT: string;
}

const REQUIRED: readonly (keyof Env)[] = ['DB', 'ASSETS', 'SITE_URL', 'TURNSTILE_SECRET', 'IP_HASH_SALT'];

/** 回傳缺少的設定名稱（只供伺服器端記錄，不回傳給前端） */
export function missingEnv(env: Partial<Env>): string[] {
  return REQUIRED.filter((name) => !env[name]);
}
