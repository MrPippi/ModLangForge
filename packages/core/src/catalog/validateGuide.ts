import { checkGlossary } from '../glossary/check';
import type { GlossaryTerm } from '../glossary/schema';
import { stripBom } from '../lang/types';
import { isPlainObject } from '../patchouli/fields';
import { flatten } from '../patchouli/flatten';
import { checkGuideFormat } from '../patchouli/formatCodes';
import { parseGuidePath } from '../patchouli/paths';
import type { GuideFiles } from '../types';
import { formatIssueMessage, langIssues, type ModIssue } from './validateMod';

/** 手冊譯文檔名（相對模組資料夾） */
export const GUIDE_ZH_FILE = 'patchouli_zh_tw.json';

function fileIssue(path: string, message: string): ModIssue {
  const file: ModIssue['file'] = `patchouli/${path}`;
  return { level: 'error', file, message };
}

function rawFileIssues(path: string, text: string): ModIssue[] {
  if (!parseGuidePath(path)) return [fileIssue(path, '手冊檔必須是 patchouli/<手冊>/en_us/ 下的 .json（templates/ 除外）')];
  let data: unknown;
  try {
    data = JSON.parse(stripBom(text));
  } catch (err) {
    return [fileIssue(path, `JSON 解析失敗：${err instanceof Error ? err.message : String(err)}`)];
  }
  return isPlainObject(data) ? [] : [fileIssue(path, '手冊檔頂層必須是物件')];
}

function translationIssues(source: Readonly<Record<string, string>>, zh: Record<string, string>, terms: readonly GlossaryTerm[]): ModIssue[] {
  return Object.entries(zh).flatMap(([key, target]): ModIssue[] => {
    const original = Object.hasOwn(source, key) ? source[key] : undefined;
    if (original === undefined) return [{ level: 'error', file: GUIDE_ZH_FILE, key, message: '手冊原文中沒有此 key' }];
    const format = checkGuideFormat(original, target);
    const formatIssues: ModIssue[] = format ? [{ level: 'warning', file: GUIDE_ZH_FILE, key, message: formatIssueMessage(format) }] : [];
    const termIssues = checkGlossary(original, target, terms).map(({ term, level }): ModIssue => ({
      level, file: GUIDE_ZH_FILE, key, message: `術語「${term.en}」應譯為「${term.zh}」`,
    }));
    return [...formatIssues, ...termIssues];
  });
}

/** 驗證手冊原樣檔與譯文；zh 為 patchouli_zh_tw.json 的內容（不存在時傳 {}）；回傳空陣列代表完全合法 */
export function validateGuideData(files: GuideFiles, zh: unknown, terms: readonly GlossaryTerm[] = []): ModIssue[] {
  const base = [...Object.entries(files).flatMap(([path, text]) => rawFileIssues(path, text)), ...langIssues(GUIDE_ZH_FILE, zh)];
  if (base.some((i) => i.level === 'error')) return base;
  return translationIssues(flatten(files).source, zh as Record<string, string>, terms);
}
