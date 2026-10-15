import { checkGlossary } from './check';
import type { GlossaryTerm } from './schema';

export interface MineEntry {
  readonly modId: string;
  readonly key: string;
  readonly source: string;
  readonly target: string;
}

export interface Variant {
  readonly target: string;
  readonly refs: readonly string[];
}

export interface Candidate {
  readonly en: string;
  readonly modCount: number;
  readonly variants: readonly Variant[];
}

export interface TermViolations {
  readonly term: GlossaryTerm;
  readonly count: number;
  readonly refs: readonly string[];
}

const MAX_WORDS = 3;
const MAX_REFS = 5;

const refOf = (e: MineEntry): string => `${e.modId}:${e.key}`;
const isTranslated = (e: MineEntry): boolean => e.target.trim() !== '' && e.target !== e.source;
const isShort = (e: MineEntry): boolean => e.source.trim().split(/\s+/).length <= MAX_WORDS;

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  return items.reduce((map, item) => {
    const key = keyOf(item);
    return map.set(key, [...(map.get(key) ?? []), item]);
  }, new Map<string, T[]>());
}

/** 找出英文原文相同（1–3 個單字、不分大小寫）但譯法不只一種的條目群組，依涉及模組數排序 */
export function findCandidates(entries: readonly MineEntry[]): Candidate[] {
  const groups = groupBy(entries.filter((e) => isTranslated(e) && isShort(e)), (e) => e.source.trim().toLowerCase());
  return [...groups.entries()]
    .map(([en, list]) => ({
      en,
      modCount: new Set(list.map((e) => e.modId)).size,
      variants: [...groupBy(list, (e) => e.target).entries()].map(([target, items]) => ({ target, refs: items.map(refOf) })),
    }))
    .filter((c) => c.variants.length >= 2)
    .sort((a, b) => b.modCount - a.modCount || a.en.localeCompare(b.en));
}

/** 統計每個術語的違規次數（以各模組合併後的術語檢查），違規多者在前 */
export function countViolations(entries: readonly MineEntry[], termsFor: (modId: string) => readonly GlossaryTerm[]): TermViolations[] {
  const hits = entries.flatMap((e) => checkGlossary(e.source, e.target, termsFor(e.modId)).map(({ term }) => ({ term, ref: refOf(e) })));
  return [...groupBy(hits, (h) => `${h.term.en.toLowerCase()}\u0000${h.term.zh}`).values()]
    .map((list) => ({ term: list[0]!.term, count: list.length, refs: list.slice(0, MAX_REFS).map((h) => h.ref) }))
    .sort((a, b) => b.count - a.count || a.term.en.localeCompare(b.term.en));
}

export function renderMineReport(candidates: readonly Candidate[], violations: readonly TermViolations[]): string {
  const candidateLines = candidates.length === 0
    ? ['沒有譯法不一致的候選。']
    : candidates.flatMap((c) => [
      `### ${c.en}（${c.modCount} 個模組）`,
      ...c.variants.map((v) => `- ${v.target}：${v.refs.slice(0, MAX_REFS).join('、')}`),
      '',
    ]);
  const violationLines = violations.length === 0
    ? ['沒有術語違規。']
    : violations.map((v) => `- ${v.term.en} → ${v.term.zh}：${v.count} 次（${v.refs.join('、')}）`);
  return ['# 術語探勘報告', '', '## 譯法不一致候選', '', ...candidateLines, '', '## 現有術語違規', '', ...violationLines, ''].join('\n');
}
