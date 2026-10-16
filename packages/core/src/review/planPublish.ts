import { applyToMod, type ModApplyResult } from './applyMod';
import { buildCommitMessage } from './commitMessage';
import { mergeContributors } from './contributors';
import type { ApprovedChange, ModFiles, PublishPlan, StatusChange } from './publishTypes';

const changeKey = (c: ApprovedChange): string => `${c.modId}\u0000${c.key}`;

/** 同一 mod/key 只保留最晚核准者（reviewedAt，再比 id） */
export function pickWinners(changes: readonly ApprovedChange[]): { winners: ApprovedChange[]; superseded: number[] } {
  const sorted = [...changes].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id - b.id);
  const latest = new Map(sorted.map((c) => [changeKey(c), c] as const));
  const winners = [...latest.values()].sort((a, b) => a.id - b.id);
  const winnerIds = new Set(winners.map((w) => w.id));
  return { winners, superseded: changes.filter((c) => !winnerIds.has(c.id)).map((c) => c.id) };
}

export interface PlanInput {
  readonly mods: Readonly<Record<string, ModFiles | null>>;
  readonly changes: readonly ApprovedChange[];
  readonly statusChanges: readonly StatusChange[];
  readonly today: string;
}

interface ModPlan {
  readonly modId: string;
  readonly result: ModApplyResult;
  readonly status: StatusChange | null;
  readonly statusIds: number[];
}

function latestStatus(list: readonly StatusChange[]): StatusChange | null {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).at(-1) ?? null;
}

function planMod(modId: string, input: PlanInput, winners: readonly ApprovedChange[]): ModPlan {
  const files = Object.hasOwn(input.mods, modId) ? input.mods[modId] ?? null : null;
  const changes = winners.filter((c) => c.modId === modId);
  if (!files) {
    const results = changes.map((c) => ({ id: c.id, outcome: 'conflict' as const }));
    return { modId, result: { files: [], results, appliedCount: 0, credits: [] }, status: null, statusIds: [] };
  }
  const statuses = input.statusChanges.filter((s) => s.modId === modId);
  const status = latestStatus(statuses);
  const result = applyToMod({ modId, files, changes, status, today: input.today });
  return { modId, result, status, statusIds: statuses.map((s) => s.id) };
}

/** 純函式：由 repo 檔案原文與待發佈變更產生要寫入的檔案、每條建議的結果與 commit 訊息 */
export function planPublish(input: PlanInput): PublishPlan {
  const { winners, superseded } = pickWinners(input.changes);
  const modIds = [...new Set([...winners.map((c) => c.modId), ...input.statusChanges.map((s) => s.modId)])].sort();
  const mods = modIds.map((modId) => planMod(modId, input, winners));
  const message = buildCommitMessage({
    perMod: mods.filter((m) => m.result.appliedCount > 0).map((m) => ({ modId: m.modId, count: m.result.appliedCount })),
    statuses: mods.flatMap((m) => (m.status ? [{ modId: m.modId, status: m.status.status }] : [])),
    contributors: mergeContributors([], mods.flatMap((m) => m.result.credits)),
  });
  return {
    files: mods.flatMap((m) => m.result.files),
    results: [...superseded.map((id) => ({ id, outcome: 'superseded' as const })), ...mods.flatMap((m) => m.result.results)],
    appliedStatusChangeIds: mods.flatMap((m) => m.statusIds),
    message,
  };
}
