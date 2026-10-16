import type { SearchHit } from '../translator/ui/filterEntries';
import type { AdminSuggestion } from './adminApi';
import { ownString, type ModStrings } from './modStrings';

/** 依原文順序建立翻譯表列；已核准未發佈的內容覆蓋目前譯文 */
export function buildHits(modId: string, strings: ModStrings, overrides: Readonly<Record<string, string>>, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  return Object.keys(strings.en)
    .map((key): SearchHit => {
      const target = ownString(overrides, key) ?? ownString(strings.zh, key) ?? '';
      return { modId, entry: { key, source: ownString(strings.en, key) ?? '', target, status: target === '' ? 'untranslated' : 'translated' } };
    })
    .filter((h) => q === '' || [h.entry.key, h.entry.source, h.entry.target].some((x) => x.toLowerCase().includes(q)));
}

const orderKey = (x: AdminSuggestion): string => x.reviewedAt ?? x.createdAt;

/** 與 core pickWinners 相同排序：(reviewedAt ?? createdAt, id)，最晚者勝出 */
export function latestApproved(list: readonly AdminSuggestion[]): Record<string, string> {
  const sorted = [...list].sort((a, b) => orderKey(a).localeCompare(orderKey(b)) || a.id - b.id);
  return Object.fromEntries(sorted.map((x) => [x.key, x.proposed]));
}
