import { z } from 'zod';
import type { LoginProvider } from '@mlf/core/review';
import type { FetchLike } from '../appEnv';
import type { Env } from '../env';

export interface ProviderIdentity {
  readonly providerUserId: string;
  readonly username: string;
  readonly displayName: string;
}

export interface OAuthProvider {
  readonly name: LoginProvider;
  authorizeUrl(env: Env, state: string, redirectUri: string): string;
  fetchIdentity(env: Env, code: string, redirectUri: string, fetchImpl: FetchLike): Promise<ProviderIdentity | null>;
}

const tokenSchema = z.object({ access_token: z.string().min(1) });
const discordUser = z.object({ id: z.string().regex(/^\d+$/), username: z.string().min(1), global_name: z.string().nullish() });
const githubUser = z.object({ id: z.number().int().positive(), login: z.string().min(1), name: z.string().nullish() });

const USER_AGENT = 'modlangforge';

async function readJson(res: Response): Promise<unknown> {
  return res.ok ? res.json().catch(() => null) : null;
}

const discord: OAuthProvider = {
  name: 'discord',
  authorizeUrl(env, state, redirectUri) {
    const params = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: 'identify', state, redirect_uri: redirectUri });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  },
  async fetchIdentity(env, code, redirectUri, fetchImpl) {
    const body = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const token = tokenSchema.safeParse(await readJson(await fetchImpl('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body,
    })));
    if (!token.success) return null;
    const me = discordUser.safeParse(await readJson(await fetchImpl('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.data.access_token}`, 'User-Agent': USER_AGENT },
    })));
    if (!me.success) return null;
    return { providerUserId: me.data.id, username: me.data.username, displayName: me.data.global_name || me.data.username };
  },
};

/** GitHub App 的使用者授權（只讀身分，不要求任何 scope） */
const github: OAuthProvider = {
  name: 'github',
  authorizeUrl(env, state, redirectUri) {
    const params = new URLSearchParams({ client_id: env.GITHUB_APP_CLIENT_ID, state, redirect_uri: redirectUri });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },
  async fetchIdentity(env, code, redirectUri, fetchImpl) {
    const token = tokenSchema.safeParse(await readJson(await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code, redirect_uri: redirectUri }),
    })));
    if (!token.success) return null;
    const me = githubUser.safeParse(await readJson(await fetchImpl(`${env.GITHUB_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${token.data.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT, 'X-GitHub-Api-Version': '2022-11-28' },
    })));
    if (!me.success) return null;
    return { providerUserId: String(me.data.id), username: me.data.login, displayName: me.data.name || me.data.login };
  },
};

const PROVIDERS: Readonly<Record<LoginProvider, OAuthProvider>> = { discord, github };

export function findProvider(name: string): OAuthProvider | null {
  return Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name as LoginProvider] : null;
}
