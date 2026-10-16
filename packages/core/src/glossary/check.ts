import { findTerms } from './match';
import type { GlossaryLevel, GlossaryTerm } from './schema';

export interface GlossaryIssue {
  readonly term: GlossaryTerm;
  readonly level: GlossaryLevel;
}

/** 原文命中術語但譯文不含規定譯名時回報；譯文空白或與原文相同（未翻譯）時不檢查 */
export function checkGlossary(source: string, target: string, terms: readonly GlossaryTerm[]): GlossaryIssue[] {
  if (target.trim() === '' || target === source) return [];
  return findTerms(source, terms)
    .filter((t) => !target.includes(t.zh))
    .map((term) => ({ term, level: term.level }));
}
