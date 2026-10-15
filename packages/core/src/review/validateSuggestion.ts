import { checkFormat } from '../validate/formatCodes';
import { SUGGESTION_LIMITS } from './limits';

export type SuggestionRejection = 'empty' | 'unchanged' | 'too_long' | 'note_too_long';

export interface SuggestionInput {
  readonly source: string;
  readonly current: string | null;
  readonly proposed: string;
  readonly note?: string;
}

export type SuggestionVerdict = { ok: true; formatWarning: boolean } | { ok: false; reason: SuggestionRejection };

export function maxProposedLength(source: string): number {
  const scaled = Math.max(source.length * SUGGESTION_LIMITS.sourceMultiplier, SUGGESTION_LIMITS.minCap);
  return Math.min(SUGGESTION_LIMITS.maxChars, scaled);
}

/** 驗證單條建議；格式碼不一致只標警告，不拒絕 */
export function validateSuggestion({ source, current, proposed, note }: SuggestionInput): SuggestionVerdict {
  if (proposed.trim() === '') return { ok: false, reason: 'empty' };
  if (proposed === current) return { ok: false, reason: 'unchanged' };
  if (proposed.length > maxProposedLength(source)) return { ok: false, reason: 'too_long' };
  if ((note?.length ?? 0) > SUGGESTION_LIMITS.maxNote) return { ok: false, reason: 'note_too_long' };
  return { ok: true, formatWarning: checkFormat(source, proposed) !== null };
}
