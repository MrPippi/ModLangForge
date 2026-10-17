import type { BackfillDone, BackfillEntry } from './backfill';
import type { ReviewReason } from './match';

export const REVIEW_REASON_TEXT: Readonly<Record<ReviewReason, string>> = {
  none: 'CurseForge 上找不到同名模組',
  ambiguous: '有多個同名模組',
  'name-mismatch': 'slug 相同但名稱不同',
};

const VIA_TEXT = { slug: 'slug 與名稱相同', name: '名稱唯一相同' } as const;

function ofKind<K extends BackfillEntry['kind']>(entries: readonly BackfillEntry[], kind: K): Extract<BackfillEntry, { kind: K }>[] {
  return entries.filter((e): e is Extract<BackfillEntry, { kind: K }> => e.kind === kind);
}

/** 腳本輸出：已寫入（或 dry-run 將寫入）、需要人工確認（附候選）、查詢失敗、略過，各附數量 */
export function renderBackfillReport(result: BackfillDone): string[] {
  const written = ofKind(result.entries, 'written');
  const review = ofKind(result.entries, 'review');
  const failed = ofKind(result.entries, 'failed');
  const skipped = ofKind(result.entries, 'skipped');
  return [
    `${result.dryRun ? '將寫入（--dry-run，未寫檔）' : '已寫入'}：${written.length} 個`,
    ...written.map((e) => `  ${e.modId}  ${e.url}（${VIA_TEXT[e.via]}）`),
    `需要人工確認：${review.length} 個`,
    ...review.flatMap((e) => [
      `  ${e.modId}（${e.name}）：${REVIEW_REASON_TEXT[e.reason]}`,
      ...e.candidates.map((c) => `    候選：${c.name}  ${c.url}`),
    ]),
    `查詢失敗：${failed.length} 個`,
    ...failed.map((e) => `  ${e.modId}：${e.message}`),
    `已有連結、略過：${skipped.length} 個`,
  ];
}
