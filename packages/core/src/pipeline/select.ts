import type { DetectedMod } from '../types';

export const MIN_KEYS = 20;
export const MAX_KEYS = 1500;
/** 內建繁中涵蓋率達此值即視為完整，不需本站翻譯 */
export const BUILTIN_COMPLETE_PERCENT = 90;

export type Selection =
  | { readonly action: 'skip'; readonly reason: 'builtin-complete' | 'too-small' | 'too-large' }
  | { readonly action: 'include'; readonly en: Readonly<Record<string, string>>; readonly builtinPercent?: number };

/**
 * 決定模組是否需要翻譯，以及要翻哪些 key。
 * 模組內建 zh_tw 時只保留內建缺少的 key（資源包會與內建語言檔逐條合併），且不收錄作者的譯文。
 */
export function selectForTranslation(d: DetectedMod): Selection {
  const total = d.order.length;
  const covered = new Set(d.order.filter((k) => (d.zhTw?.[k] ?? '') !== ''));
  const builtinPercent = d.zhTw && total > 0 ? Math.round((covered.size / total) * 100) : undefined;
  if (builtinPercent !== undefined && builtinPercent >= BUILTIN_COMPLETE_PERCENT) {
    return { action: 'skip', reason: 'builtin-complete' };
  }
  const keys = d.order.filter((k) => !covered.has(k));
  if (keys.length < MIN_KEYS) return { action: 'skip', reason: 'too-small' };
  if (keys.length > MAX_KEYS) return { action: 'skip', reason: 'too-large' };
  const en = Object.fromEntries(keys.map((k) => [k, d.source[k] ?? '']));
  return { action: 'include', en, ...(builtinPercent !== undefined ? { builtinPercent } : {}) };
}
