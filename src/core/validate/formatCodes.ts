/** printf 佔位符、MessageFormat、§ 顏色／樣式碼、換行（字面 \n 與實際換行） */
const TOKEN_PATTERN = /%(?:\d+\$)?[-#+ 0,(]*\d*(?:\.\d+)?[sdfxXeEcbhnoS%]|\{\d+\}|§[0-9a-fk-orA-FK-OR]|\\n|\n/g;

export interface FormatIssue {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

export function extractTokens(text: string): string[] {
  return (text.match(TOKEN_PATTERN) ?? []).map((tok) => (tok.startsWith('§') ? tok.toLowerCase() : tok));
}

function countTokens(tokens: readonly string[]): Map<string, number> {
  return tokens.reduce((acc, tok) => new Map(acc).set(tok, (acc.get(tok) ?? 0) + 1), new Map<string, number>());
}

function difference(a: Map<string, number>, b: Map<string, number>): string[] {
  return [...a.entries()].flatMap(([tok, n]) => Array<string>(Math.max(0, n - (b.get(tok) ?? 0))).fill(tok));
}

/** 比對原文與譯文的格式碼多重集合；譯文為空或一致時回傳 null */
export function checkFormat(source: string, target: string): FormatIssue | null {
  if (target === '') return null;
  const src = countTokens(extractTokens(source));
  const tgt = countTokens(extractTokens(target));
  const missing = difference(src, tgt);
  const extra = difference(tgt, src);
  return missing.length === 0 && extra.length === 0 ? null : { missing, extra };
}
