import { topLevelKeyOrder } from './jsonKeyOrder';
import { LangParseError, type ParsedLang, stripBom } from './types';

export function parseJsonLang(text: string): ParsedLang {
  const clean = stripBom(text);
  let data: unknown;
  try {
    data = JSON.parse(clean);
  } catch (err) {
    throw new LangParseError(err instanceof Error ? err.message : String(err));
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new LangParseError('語言檔頂層必須是物件');
  }
  const record = data as Record<string, unknown>;
  const pairs: [string, string][] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const key of topLevelKeyOrder(clean)) {
    if (seen.has(key)) continue;
    seen.add(key);
    const value = record[key];
    if (typeof value === 'string') pairs.push([key, value]);
    else warnings.push(`略過非字串值：${key}`);
  }
  return { entries: Object.fromEntries(pairs), order: pairs.map(([k]) => k), warnings };
}
