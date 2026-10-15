import { isBootstrapAdmin, parseAdminBootstrap, type LoginProvider, type Role } from '@mlf/core/review';
import type { Ctx } from '../appEnv';
import type { UserRecord } from '../repo/types';
import type { AuthMode } from './oauthState';
import type { ProviderIdentity } from './providers';

export type AuthErrorCode = 'login_required' | 'identity_taken' | 'provider_linked' | 'banned';
export type ResolveResult = { readonly user: UserRecord } | { readonly error: AuthErrorCode };

const MAX_DISPLAY_NAME = 64;

async function linkToCurrent(c: Ctx, provider: LoginProvider, ident: ProviderIdentity, nowIso: string): Promise<ResolveResult> {
  const current = c.get('user');
  if (!current) return { error: 'login_required' };
  const users = c.get('repos').users;
  const outcome = await users.linkIdentity(current.id, { provider, providerUserId: ident.providerUserId, username: ident.username }, nowIso);
  if (outcome === 'taken') return { error: 'identity_taken' };
  if (outcome === 'provider_linked') return { error: 'provider_linked' };
  const user = await users.findById(current.id);
  return user ? { user } : { error: 'login_required' };
}

/** 登入：既有身分 → 該使用者（停權則拒絕）；新身分 → 建立使用者（ADMIN_BOOTSTRAP 者為 admin）。綁定：加到目前使用者。 */
export async function resolveUser(c: Ctx, provider: LoginProvider, ident: ProviderIdentity, mode: AuthMode, now: Date): Promise<ResolveResult> {
  const nowIso = now.toISOString();
  if (mode === 'link') return linkToCurrent(c, provider, ident, nowIso);
  const users = c.get('repos').users;
  const existing = await users.findByIdentity(provider, ident.providerUserId);
  if (existing) return existing.banned ? { error: 'banned' } : { user: existing };
  const role: Role = isBootstrapAdmin(parseAdminBootstrap(c.env.ADMIN_BOOTSTRAP), provider, ident.username) ? 'admin' : 'contributor';
  const displayName = ident.displayName.trim().slice(0, MAX_DISPLAY_NAME) || ident.username;
  const user = await users.create({ displayName, role, identity: { provider, providerUserId: ident.providerUserId, username: ident.username }, now: nowIso });
  return { user };
}
