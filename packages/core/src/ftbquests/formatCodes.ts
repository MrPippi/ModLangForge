import type { TranslationEntry } from '../types';
import { checkFormat, checkTokens, type FormatIssue } from '../validate/formatCodes';
import { isQuestProjectId } from './ids';

export const PAGEBREAK = '{@pagebreak}';
export const PAGEBREAK_INLINE = '{@pagebreak}（需獨立一行）';
export const JSON_LINE = '整行 JSON 文字元件';

/**
 * 行內格式碼：\&（字面 &，需先比對）、&#RRGGBB、&x 顏色／樣式碼（含 &z 彩虹）、§ 碼、
 * {@pagebreak}、{image:…}、含點的 {翻譯.key} 引用。不比對 %s 等 printf 佔位符（任務文字的 50% 不是格式碼）。
 */
const INLINE_TOKEN = /\\&|&#[0-9a-fA-F]{6}|&[0-9a-fk-orzA-FK-ORZ]|§#[0-9a-fA-F]{6}|§[0-9a-fk-orzA-FK-ORZ]|\{@pagebreak\}|\{image:[^{}\n]*\}|\{[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+\}/g;
const COLOR = /^[&§]/;
const JSON_START = /^\s*[{[]"/;

function normalize(token: string): string {
  if (token === PAGEBREAK) return PAGEBREAK_INLINE;
  return COLOR.test(token) ? token.toLowerCase() : token;
}

/** 單獨一行的 {@pagebreak} 才算換頁；以 {" 或 [" 開頭的行算一個整行 JSON 文字元件 */
function lineTokens(line: string): string[] {
  if (line.trim() === PAGEBREAK) return [PAGEBREAK];
  const json = JSON_START.test(line) ? [JSON_LINE] : [];
  return [...json, ...(line.match(INLINE_TOKEN) ?? []).map(normalize)];
}

/** 換行本身不是格式碼：中文行數可與英文不同 */
export function extractQuestTokens(text: string): string[] {
  return text.split(/\r?\n/).flatMap(lineTokens);
}

export function checkQuestFormat(source: string, target: string): FormatIssue | null {
  return checkTokens(source, target, extractQuestTokens);
}

export function hasQuestWarning(e: TranslationEntry): boolean {
  return checkQuestFormat(e.source, e.target) !== null;
}

export type FormatCheck = (source: string, target: string) => FormatIssue | null;

/** 語言檔條目的格式碼檢查：FTB 任務專案用任務格式碼，其餘用一般格式碼 */
export function formatCheckFor(projectId: string): FormatCheck {
  return isQuestProjectId(projectId) ? checkQuestFormat : checkFormat;
}
