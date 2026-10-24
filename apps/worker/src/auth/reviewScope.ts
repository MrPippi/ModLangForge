import type { Ctx } from '../appEnv';
import { fail } from '../http';

/** 可審核的模組；null 代表全部（管理員，或沒有指定負責模組的審核者） */
export async function reviewScope(c: Ctx): Promise<ReadonlySet<string> | null> {
  const user = c.get('user');
  if (!user) throw new Error('requirePermission must run before reviewScope');
  if (user.role !== 'reviewer') return null;
  const mods = await c.get('repos').reviewScopes.list(user.id);
  return mods.length === 0 ? null : new Set(mods);
}

/** 不在負責範圍時回 403，否則回 null */
export async function denyOutOfScope(c: Ctx, modId: string): Promise<Response | null> {
  const scope = await reviewScope(c);
  return scope === null || scope.has(modId) ? null : fail(c, 403, 'mod_not_assigned', '你沒有負責這個模組。');
}
