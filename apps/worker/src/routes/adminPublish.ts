import type { Hono } from 'hono';
import { PublishValidationError } from '@mlf/core/review';
import type { AppDeps } from '../app';
import type { AppEnv, Ctx } from '../appEnv';
import { requireWrite } from '../auth/csrf';
import { requirePermission } from '../auth/guard';
import { envGuard } from '../env';
import { createGithubClient, githubConfig, GithubError } from '../github/client';
import { fail, ok } from '../http';
import { MAX_PUBLISH_MODS, runPublish, type PublishOutcome } from '../publish/runPublish';

function respond(c: Ctx, outcome: PublishOutcome): Response {
  switch (outcome.kind) {
    case 'nothing':
      return fail(c, 400, 'nothing_to_publish', '沒有可發佈的變更。');
    case 'too_many_mods':
      return fail(c, 400, 'too_many_mods', `一次最多發佈 ${MAX_PUBLISH_MODS} 個模組（目前 ${outcome.count} 個），請分批發佈。`);
    case 'busy':
      return fail(c, 409, 'publish_in_progress', '另一個發佈正在進行，請稍後再試。');
    case 'main_moved':
      return fail(c, 409, 'main_moved', 'main 分支同時有其他更新，未發佈任何變更，請稍後再試。');
    case 'lock_lost':
      console.error('publish lock lost after push', outcome.commitSha);
      return fail(c, 409, 'publish_lock_lost', '發佈鎖已被其他發佈接管，結果未寫入資料庫，請檢查 GitHub 上的提交後再處理。');
    case 'done':
      return ok(c, { commitSha: outcome.commitSha, applied: outcome.applied, conflicts: outcome.conflicts, superseded: outcome.superseded });
  }
}

async function handlePublish(c: Ctx, deps: AppDeps): Promise<Response> {
  const user = c.get('user');
  if (!user) return fail(c, 401, 'login_required', '請先登入。');
  const now = deps.now();
  try {
    const outcome = await runPublish({ repos: c.get('repos'), github: () => createGithubClient(githubConfig(c.env, deps.fetch, now)), now, userId: user.id });
    return respond(c, outcome);
  } catch (err) {
    if (err instanceof PublishValidationError) {
      console.error('publish validation failed', err.modId, err.issues);
      return fail(c, 422, 'invalid_data', `模組 ${err.modId} 套用後資料驗證失敗，未發佈任何變更。`);
    }
    if (err instanceof GithubError) {
      console.error('publish github failed', err.status, err.endpoint);
      return fail(c, 502, 'github_failed', 'GitHub 連線失敗，未發佈任何變更。');
    }
    throw err;
  }
}

async function handleSummary(c: Ctx): Promise<Response> {
  const review = c.get('repos').review;
  const [changes, statusChanges] = await Promise.all([review.listApprovedForPublish(), review.listPendingStatusChanges()]);
  const counts = changes.reduce<Record<string, number>>((acc, ch) => ({ ...acc, [ch.modId]: (acc[ch.modId] ?? 0) + 1 }), {});
  return ok(c, {
    approved: changes.length,
    mods: Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([modId, count]) => ({ modId, count })),
    statusChanges: statusChanges.map((s) => ({ modId: s.modId, status: s.status })),
  });
}

export function registerAdminPublishRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  app.get('/api/v1/admin/publish', requirePermission('publish'), handleSummary);
  app.post('/api/v1/admin/publish', requireWrite, requirePermission('publish'), envGuard('githubApp'), (c) => handlePublish(c, deps));
}
