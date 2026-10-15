/** 社群建議的內容與頻率限制（規格 §5.1、§7） */
export const SUGGESTION_LIMITS = {
  maxChars: 1000,
  sourceMultiplier: 4,
  minCap: 50,
  maxNote: 500,
  perHour: 30,
} as const;
