import type { GlossaryTerm } from './schema';

interface Hit {
  readonly term: GlossaryTerm;
  readonly start: number;
  readonly end: number;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 每個術語的正規表示式只編譯一次；matchAll 會複製 regex，重複使用安全 */
const patterns = new WeakMap<GlossaryTerm, RegExp>();

/** 前後以 lookaround 判斷整字（\b 遇到以 +、) 結尾的術語會失效） */
function patternOf(term: GlossaryTerm): RegExp {
  const cached = patterns.get(term);
  if (cached) return cached;
  const words = term.en.split(/\s+/).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\w])${words.join('\\s+')}(?:e?s)?(?![\\w])`, 'gi');
  patterns.set(term, pattern);
  return pattern;
}

function hitsOf(source: string, term: GlossaryTerm): Hit[] {
  return [...source.matchAll(patternOf(term))].map((m) => ({ term, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

const coveredBy = (inner: Hit, outer: Hit): boolean =>
  outer.start <= inner.start && inner.end <= outer.end && outer.end - outer.start > inner.end - inner.start;

/** 回傳原文命中的術語：不分大小寫、整字比對、最後一字可加 s/es，較長命中覆蓋其內的較短命中；依首次出現排序並去重 */
export function findTerms(source: string, terms: readonly GlossaryTerm[]): GlossaryTerm[] {
  const hits = terms.flatMap((t) => hitsOf(source, t));
  const kept = hits.filter((h) => !hits.some((o) => coveredBy(h, o))).sort((a, b) => a.start - b.start);
  return [...new Set(kept.map((h) => h.term))];
}
