import type { MiddlewareHandler } from 'hono';
import { can, type Action } from '@mlf/core/review';
import type { AppEnv } from '../appEnv';
import { fail } from '../http';

/** 集中權限檢查（規格 §6）；每支 admin 路由都必須掛上 */
export function requirePermission(action: Action): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return fail(c, 401, 'login_required', '請先登入。');
    if (!can(user.role, action)) return fail(c, 403, 'forbidden', '你沒有權限執行這個動作。');
    await next();
  };
}

/** 只需登入（任何角色）；未登入回 401 */
export const requireLogin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return fail(c, 401, 'login_required', '請先登入。');
  await next();
};
