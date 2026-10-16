import type { SuggestionRejection } from '@mlf/core/review';

export const REJECTION_MESSAGES: Readonly<Record<SuggestionRejection, string>> = {
  empty: '譯文不能是空白。',
  unchanged: '建議內容與目前譯文相同。',
  too_long: '譯文太長了。',
  note_too_long: '備註太長了。',
};
