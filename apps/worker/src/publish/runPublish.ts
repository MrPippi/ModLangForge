import { planPublish, taipeiDate, type ApprovedChange, type ModFiles, type PublishPlan, type StatusChange } from '@mlf/core/review';
import type { GithubClient } from '../github/client';
import type { Repos } from '../repo/types';

/** Workers Free 方案每次請求最多 50 次子請求；5 個 mod 約 39 次 */
export const MAX_PUBLISH_MODS = 5;

export type PublishOutcome =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'too_many_mods'; readonly count: number }
  | { readonly kind: 'busy' }
  | { readonly kind: 'main_moved' }
  | { readonly kind: 'lock_lost'; readonly commitSha: string | null }
  | { readonly kind: 'done'; readonly commitSha: string | null; readonly applied: number; readonly conflicts: number; readonly superseded: number };

export interface PublishDeps {
  readonly repos: Repos;
  readonly github: () => Promise<GithubClient>;
  readonly now: Date;
  readonly userId: number;
}

type Attempt = { readonly kind: 'ready'; readonly plan: PublishPlan; readonly sha: string | null } | { readonly kind: 'moved' };

const MOD_FILES = ['en_us.json', 'zh_tw.json', 'mod.json'] as const;
const LOCK_LOST = 'publish lock lost';

const affectedMods = (changes: readonly ApprovedChange[], statusChanges: readonly StatusChange[]): string[] =>
  [...new Set([...changes, ...statusChanges].map((c) => c.modId))].sort();

async function readMod(gh: GithubClient, modId: string, ref: string): Promise<ModFiles | null> {
  const [en, zh, meta] = await Promise.all(MOD_FILES.map((f) => gh.readFile(`data/mods/${modId}/${f}`, ref)));
  return en != null && zh != null && meta != null ? { en, zh, meta } : null;
}

/** 讀檔（固定 base SHA）→ 套用 → 建 tree／commit → fast-forward；main 已前進時回 moved */
async function attempt(gh: GithubClient, changes: readonly ApprovedChange[], statusChanges: readonly StatusChange[], today: string): Promise<Attempt> {
  const base = await gh.mainSha();
  const modIds = affectedMods(changes, statusChanges);
  const mods = Object.fromEntries(await Promise.all(modIds.map(async (id) => [id, await readMod(gh, id, base)] as const)));
  const plan = planPublish({ mods, changes, statusChanges, today });
  if (plan.files.length === 0) return { kind: 'ready', plan, sha: null };
  const tree = await gh.createTree(await gh.commitTree(base), plan.files);
  const commit = await gh.createCommit(plan.message, tree, base);
  return (await gh.fastForwardMain(commit)) === 'ok' ? { kind: 'ready', plan, sha: commit } : { kind: 'moved' };
}

const countOf = (plan: PublishPlan, outcome: string) => plan.results.filter((r) => r.outcome === outcome).length;

async function publishLocked(deps: PublishDeps, changes: readonly ApprovedChange[], statusChanges: readonly StatusChange[]): Promise<PublishOutcome> {
  const review = deps.repos.review;
  const lock = await review.acquirePublishLock(deps.userId, deps.now);
  if (lock === null) return { kind: 'busy' };
  try {
    const gh = await deps.github();
    const today = taipeiDate(deps.now);
    const first = await attempt(gh, changes, statusChanges, today);
    const result = first.kind === 'moved' ? await attempt(gh, changes, statusChanges, today) : first;
    if (result.kind === 'moved') return { kind: 'main_moved' };
    const { plan, sha } = result;
    try {
      // 沒有 commit 時狀態變更維持 pending（缺 mod 的狀態變更也留在摘要裡）
      await review.completePublish({ lock, commitSha: sha, results: plan.results, statusChangeIds: sha ? plan.appliedStatusChangeIds : [] });
    } catch (err) {
      if (err instanceof Error && err.message === LOCK_LOST) return { kind: 'lock_lost', commitSha: sha };
      throw err;
    }
    return { kind: 'done', commitSha: sha, applied: countOf(plan, 'applied'), conflicts: countOf(plan, 'conflict'), superseded: countOf(plan, 'superseded') };
  } finally {
    await review.releasePublishLock(lock);
  }
}

export async function runPublish(deps: PublishDeps): Promise<PublishOutcome> {
  const review = deps.repos.review;
  const [changes, statusChanges] = await Promise.all([review.listApprovedForPublish(), review.listPendingStatusChanges()]);
  if (changes.length === 0 && statusChanges.length === 0) return { kind: 'nothing' };
  const count = affectedMods(changes, statusChanges).length;
  if (count > MAX_PUBLISH_MODS) return { kind: 'too_many_mods', count };
  return publishLocked(deps, changes, statusChanges);
}
