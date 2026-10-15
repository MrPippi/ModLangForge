import { sameAuthor, type NewSuggestion, type StoredSuggestion, type LegacySuggestionRepo } from './types';

import { RATE_RETENTION_MS } from './types';

/** 測試與本機用的記憶體實作；內部陣列以替換方式更新 */
export function createMemoryRepo(opts: { blocked?: readonly string[] } = {}): LegacySuggestionRepo {
  let rows: readonly StoredSuggestion[] = [];
  let events: readonly { subject: string; at: string }[] = [];
  const blocked = new Set(opts.blocked ?? []);

  return {
    async upsertPending(s: NewSuggestion) {
      const existing = rows.find((r) => r.modId === s.modId && r.key === s.key && sameAuthor(r, s));
      const row: StoredSuggestion = { ...s, id: existing?.id ?? rows.length + 1, status: 'pending' };
      rows = existing ? rows.map((r) => (r.id === existing.id ? row : r)) : [...rows, row];
      return row;
    },
    async countRateEvents(subject, sinceIso) {
      return events.filter((e) => e.subject === subject && e.at >= sinceIso).length;
    },
    async recordRateEvent(subject, atIso) {
      const cutoff = new Date(Date.parse(atIso) - RATE_RETENTION_MS).toISOString();
      events = [...events.filter((e) => e.at >= cutoff), { subject, at: atIso }];
    },
    async isBlocked(subjects) {
      return subjects.some((s) => blocked.has(s));
    },
  };
}
