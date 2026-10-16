import type { GlossaryTerm } from './schema';

const keyOf = (t: GlossaryTerm): string => t.en.toLowerCase();

/** 模組術語覆蓋同名（不分大小寫）的全域術語並保留其位置，模組獨有的術語附加在後 */
export function mergeGlossaries(global: readonly GlossaryTerm[], mod: readonly GlossaryTerm[]): GlossaryTerm[] {
  const overrides = new Map(mod.map((t) => [keyOf(t), t] as const));
  const globalKeys = new Set(global.map(keyOf));
  return [...global.map((t) => overrides.get(keyOf(t)) ?? t), ...mod.filter((t) => !globalKeys.has(keyOf(t)))];
}
