import { checkTokens, extractTokens, type FormatIssue } from '../validate/formatCodes';

/** Patchouli 格式碼 $(…)：括號內不可含括號或換行，例如 $(item)、$(l:path)、$(br)、$()、$(#ff0000)、$(t:提示) */
const GUIDE_TOKEN_PATTERN = /\$\([^()\n]*\)/g;
const TOOLTIP = /^\$\(t:/i;

function normalize(token: string): string {
  if (TOOLTIP.test(token)) return '$(t:)';
  return token.startsWith('$(#') ? token.toLowerCase() : token;
}

export function extractGuideTokens(text: string): string[] {
  return (text.match(GUIDE_TOKEN_PATTERN) ?? []).map(normalize);
}

function guideAndLangTokens(text: string): string[] {
  return [...extractTokens(text), ...extractGuideTokens(text)];
}

/** 手冊文字專用檢查：既有格式碼（%s、§a、\n…）加上 Patchouli 的 $(…) */
export function checkGuideFormat(source: string, target: string): FormatIssue | null {
  return checkTokens(source, target, guideAndLangTokens);
}
