import type { ApplyResult } from './applyVersion';
import type { ModTarget } from './trackPlan';
import type { TrackEntry } from './trackSummary';

/** 每次寫入上限的倍數，限制失敗目標拖長執行時間 */
const ATTEMPT_MULTIPLIER = 3;

/**
 * 依序套用已排序的目標，直到成功寫入 maxWrites 個或用完嘗試次數。
 * 只有成功寫入才計入上限，持續失敗（衝突、無 jar）的目標不會占滿每次的名額。
 */
export async function runWithinBudget(
  sorted: readonly ModTarget[],
  maxWrites: number,
  apply: (item: ModTarget) => Promise<ApplyResult>,
  maxAttempts: number = maxWrites * ATTEMPT_MULTIPLIER,
): Promise<{ entries: TrackEntry[]; deferred: number }> {
  const entries: TrackEntry[] = [];
  let writes = 0;
  for (const item of sorted) {
    if (writes >= maxWrites || entries.length >= maxAttempts) break;
    const result = await apply(item);
    entries.push({ ...item, result });
    if (result.kind === 'written') writes += 1;
  }
  return { entries, deferred: sorted.length - entries.length };
}
