import type { DetectedMod } from '../types';

export const MIN_KEYS = 20;
export const MAX_KEYS = 1500;

export type Selection =
  | { readonly action: 'builtin' }
  | { readonly action: 'skip'; readonly reason: 'too-small' | 'too-large' }
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
 * 模組內建 zh_tw 時只保留內建缺少的 key（資源包會與內建語言檔逐條合併），且不收錄作者的譯文；
 * 全部涵蓋則只建內建條目，缺任何 key 都照一般模組收錄（不套 MIN_KEYS）。
 */
export function selectForTranslation(d: DetectedMod): Selection {
  const { keys, builtinPercent } = uncoveredKeys(d);
  const hasBuiltin = builtinPercent !== undefined;
  if (hasBuiltin && keys.length === 0) return { action: 'builtin' };
  if (!hasBuiltin && keys.length < MIN_KEYS) return { action: 'skip', reason: 'too-small' };
  if (keys.length > MAX_KEYS) return { action: 'skip', reason: 'too-large' };
  return { action: 'include', en: sourceOf(d, keys), ...(hasBuiltin ? { builtinPercent } : {}) };
}
