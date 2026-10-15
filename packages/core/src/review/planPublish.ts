import type { ApprovedChange } from './publishTypes';

const changeKey = (c: ApprovedChange): string => `${c.modId}\u0000${c.key}`;

/** 同一 mod/key 只保留最晚核准者（reviewedAt，再比 id） */
export function pickWinners(changes: readonly ApprovedChange[]): { winners: ApprovedChange[]; superseded: number[] } {
  const sorted = [...changes].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id - b.id);
  const latest = new Map(sorted.map((c) => [changeKey(c), c] as const));
  const winners = [...latest.values()].sort((a, b) => a.id - b.id);
  const winnerIds = new Set(winners.map((w) => w.id));
  return { winners, superseded: changes.filter((c) => !winnerIds.has(c.id)).map((c) => c.id) };
}
