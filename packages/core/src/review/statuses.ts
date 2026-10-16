/** 與 migrations/0001_initial.sql 的 suggestions.status CHECK 一致 */
export const SUGGESTION_STATUSES = ['pending', 'approved', 'rejected', 'superseded', 'conflict', 'published'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
