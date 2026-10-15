export interface NewSuggestion {
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly authorUserId: number | null;
  readonly authorHash: string;
  readonly createdAt: string;
}

export interface StoredSuggestion extends NewSuggestion {
  readonly id: number;
  readonly status: 'pending';
}

/** rate_events 保留 24 小時，寫入新事件時順便清除更舊的列 */
export const RATE_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SuggestionRepo {
  /** 同主體（authorUserId ?? authorHash）對同 mod/key 已有 pending 時覆蓋該列，否則新增 */
  upsertPending(s: NewSuggestion): Promise<StoredSuggestion>;
  countRateEvents(subject: string, sinceIso: string): Promise<number>;
  recordRateEvent(subject: string, atIso: string): Promise<void>;
  isBlocked(subjects: readonly string[]): Promise<boolean>;
}

/** 同一作者的判定：已登入看 user id，否則看 IP 雜湊 */
export function sameAuthor(a: NewSuggestion, b: NewSuggestion): boolean {
  return a.authorUserId !== null || b.authorUserId !== null
    ? a.authorUserId === b.authorUserId
    : a.authorHash === b.authorHash;
}
