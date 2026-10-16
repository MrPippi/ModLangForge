import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { cleanName, DISPLAY_NAME_MAX, isMinecraftName, validateDisplayName, type DisplayNameRejection } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requireLogin } from '../auth/guard';
import { envGuard } from '../env';
import { fail, methodNotAllowed, ok, parseJson } from '../http';
import { lookupMinecraftName } from '../mojang/client';
import type { ProfilePatch, UserProfile } from '../repo/types';

export const MOJANG_LOOKUPS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const MAX_BODY_BYTES = 4 * 1024;
const limitBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => fail(c, 413, 'too_large', '送出的資料太大。'),
});
/** 原始輸入上限；清理後的長度另由 validateDisplayName 判斷 */
const RAW_NAME_MAX = 200;

const profileBody = z
  .object({ displayName: z.string().max(RAW_NAME_MAX).optional(), isPublic: z.boolean().optional() })
  .refine((b) => b.displayName !== undefined || b.isPublic !== undefined);
const minecraftBody = z.object({ name: z.string().trim().max(32).nullable() });

const NAME_ERRORS: Readonly<Record<DisplayNameRejection, string>> = {
  empty: '顯示名稱不能空白。',
  too_long: `顯示名稱最多 ${DISPLAY_NAME_MAX} 個字。`,
};

function userId(c: Ctx): number {
  const user = c.get('user');
  if (!user) throw new Error('requireLogin must run before profile handlers');
  return user.id;
}

/** 使用者在請求途中被刪除時視同未登入 */
const respondProfile = (c: Ctx, profile: UserProfile | null): Response =>
  profile ? ok(c, { profile }) : fail(c, 401, 'login_required', '請先登入。');

/** 顯示名稱沒有改動時不重新驗證長度（登入來源給的名稱最長可到 64 字），否則會擋住只想改公開設定的人 */
async function isStoredName(c: Ctx, raw: string): Promise<boolean> {
  const current = await c.get('repos').users.getProfile(userId(c));
  return current !== null && cleanName(raw) === current.displayName;
}

async function handleProfile(c: Ctx): Promise<Response> {
  const body = await parseJson(c, profileBody);
  if (body instanceof Response) return body;
  const verdict = body.displayName === undefined ? null : validateDisplayName(body.displayName);
  const unchanged = verdict && !verdict.ok && verdict.reason === 'too_long' && (await isStoredName(c, body.displayName ?? ''));
  if (verdict && !verdict.ok && !unchanged) return fail(c, 400, `display_name_${verdict.reason}`, NAME_ERRORS[verdict.reason]);
  const patch: ProfilePatch = {
    ...(verdict?.ok ? { displayName: verdict.name } : {}),
    ...(body.isPublic === undefined ? {} : { isPublic: body.isPublic }),
  };
  return respondProfile(c, await c.get('repos').users.updateProfile(userId(c), patch));
}

async function handleMinecraft(c: Ctx, deps: AppDeps): Promise<Response> {
  const body = await parseJson(c, minecraftBody);
  if (body instanceof Response) return body;
  const users = c.get('repos').users;
  const id = userId(c);
  if (body.name === null || body.name === '') return respondProfile(c, await users.setMinecraft(id, null));
  if (!isMinecraftName(body.name)) return fail(c, 400, 'invalid_minecraft_name', 'Minecraft 名稱只能有英文字母、數字與底線，最多 16 字。');
  const current = await users.getProfile(id);
  if (current?.minecraftName?.toLowerCase() === body.name.toLowerCase()) return respondProfile(c, current);
  if (!(await c.get('repos').suggestions.tryConsumeRate(`mc:user:${id}`, deps.now(), MOJANG_LOOKUPS_PER_HOUR, HOUR_MS))) {
    return fail(c, 429, 'rate_limited', '查詢太頻繁了，請稍後再試。');
  }
  const found = await lookupMinecraftName(deps.fetch, c.env.MOJANG_API_BASE, body.name);
  switch (found.kind) {
    case 'found':
      return respondProfile(c, await users.setMinecraft(id, { name: found.name, uuid: found.uuid }));
    case 'not_found':
      return fail(c, 404, 'minecraft_not_found', '找不到這個 Minecraft 名稱。');
    case 'rate_limited':
      return fail(c, 503, 'mojang_busy', 'Mojang 查詢服務忙碌中，請稍後再試。');
    case 'failed':
      console.error('mojang lookup failed', found.status);
      return fail(c, 502, 'mojang_failed', '暫時無法連線到 Mojang，請稍後再試。');
  }
}

export function registerProfileRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/me/profile', requireLogin, async (c) => respondProfile(c, await c.get('repos').users.getProfile(userId(c))));
  app.post('/api/v1/me/profile', requireWrite, requireLogin, limitBody, (c) => handleProfile(c));
  app.all('/api/v1/me/profile', methodNotAllowed(['GET', 'POST']));
  app.post('/api/v1/me/minecraft', requireWrite, requireLogin, envGuard('mojang'), limitBody, (c) => handleMinecraft(c, deps));
  app.all('/api/v1/me/minecraft', methodNotAllowed(['POST']));
}
