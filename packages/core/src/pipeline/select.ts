import type { DetectedMod } from '../types';

export const MIN_KEYS = 20;
export const MAX_KEYS = 1500;
/** 內建繁中涵蓋率達此值即視為完整，不需本站翻譯 */
export const BUILTIN_COMPLETE_PERCENT = 90;

export type Selection =
  | { readonly action: 'skip'; readonly reason: 'builtin-complete' | 'too-small' | 'too-large' }
  | { readonly action: 'include'; readonly en: Readonly<Record<string, string>>; readonly builtinPercent?: number };

export interface BuiltinCoverage {
  readonly keys: readonly string[];
  readonly builtinPercent?: number;
}

/** 模組內建繁中未涵蓋的 key（保持原順序）與內建涵蓋率 */
export function uncoveredKeys(d: DetectedMod): BuiltinCoverage {
  const total = d.order.length;
  const covered = new Set(d.order.filter((k) => (d.zhTw?.[k] ?? '') !== ''));
  const builtinPercent = d.zhTw && total > 0 ? Math.round((covered.size / total) * 100) : undefined;
  const keys = d.order.filter((k) => !covered.has(k));
  return builtinPercent !== undefined ? { keys, builtinPercent } : { keys };
}

export function sourceOf(d: DetectedMod, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, d.source[k] ?? '']));
}

/**
 * 決定模組是否需要翻譯，以及要翻哪些 key。
 * 模組內建 zh_tw 時只保留內建缺少的 key（資源包會與內建語言檔逐條合併），且不收錄作者的譯文。
 */
export function selectForTranslation(d: DetectedMod): Selection {
  const { keys, builtinPercent } = uncoveredKeys(d);
  if (builtinPercent !== undefined && builtinPercent >= BUILTIN_COMPLETE_PERCENT) {
    return { action: 'skip', reason: 'builtin-complete' };
  }
  if (keys.length < MIN_KEYS) return { action: 'skip', reason: 'too-small' };
  if (keys.length > MAX_KEYS) return { action: 'skip', reason: 'too-large' };
  return { action: 'include', en: sourceOf(d, keys), ...(builtinPercent !== undefined ? { builtinPercent } : {}) };
}
