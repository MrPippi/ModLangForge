import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './appEnv';
import { fail } from './http';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly SITE_URL: string;
  readonly TURNSTILE_SECRET: string;
  readonly IP_HASH_SALT: string;
  readonly SESSION_SECRET: string;
  readonly DISCORD_CLIENT_ID: string;
  readonly DISCORD_CLIENT_SECRET: string;
  readonly GITHUB_APP_CLIENT_ID: string;
  readonly GITHUB_APP_CLIENT_SECRET: string;
  readonly GITHUB_API_BASE: string;
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY: string;
  readonly GITHUB_INSTALLATION_ID: string;
  /** owner/name */
  readonly REPO: string;
  readonly ADMIN_BOOTSTRAP?: string;
  readonly TEST_LOGIN_ENABLED?: string;
}

/** 依功能分組的必要設定；缺少時只有該功能回 500，名稱只寫入 log */
export const ENV_GROUPS = {
  core: ['DB', 'ASSETS', 'SITE_URL', 'TURNSTILE_SECRET', 'IP_HASH_SALT', 'SESSION_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  github: ['GITHUB_APP_CLIENT_ID', 'GITHUB_APP_CLIENT_SECRET', 'GITHUB_API_BASE'],
  githubApp: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_INSTALLATION_ID', 'GITHUB_API_BASE', 'REPO'],
} as const satisfies Readonly<Record<string, readonly (keyof Env)[]>>;

export type EnvGroup = keyof typeof ENV_GROUPS;

const MIN_SESSION_SECRET = 32;

/** 回傳缺少的設定名稱（只供伺服器端記錄，不回傳給前端） */
export function missingEnv(env: Partial<Env>, group: EnvGroup = 'core'): string[] {
  const missing: string[] = ENV_GROUPS[group].filter((name) => !env[name]);
  const weak = group === 'core' && env.SESSION_SECRET && env.SESSION_SECRET.length < MIN_SESSION_SECRET ? ['SESSION_SECRET(too short)'] : [];
  const badUrl = group === 'core' && env.SITE_URL && !isOrigin(env.SITE_URL) ? ['SITE_URL(invalid)'] : [];
  return [...missing, ...weak, ...badUrl];
}

function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** 記錄缺少的設定名稱並回 500 misconfigured（名稱不回傳給前端） */
export function failMisconfigured(c: Context, group: EnvGroup, missing: readonly string[]): Response {
  console.error('missing env', group, missing);
  return fail(c, 500, 'misconfigured', '伺服器設定有誤，請稍後再試。');
}

export function envGuard(group: EnvGroup): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const missing = missingEnv(c.env, group);
    if (missing.length > 0) return failMisconfigured(c, group, missing);
    await next();
  };
}
