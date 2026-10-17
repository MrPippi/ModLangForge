import { checkGuideFormat } from '../patchouli/formatCodes';
import { hasQuestWarning } from '../ftbquests/formatCodes';
import { isQuestProjectId } from '../ftbquests/ids';
import type { ModProject, TranslationEntry } from '../types';
import { checkFormat } from '../validate/formatCodes';

export interface ProjectStats {
  readonly total: number;
  readonly translated: number;
  readonly warnings: number;
  readonly percent: number;
}

export function hasWarning(e: TranslationEntry): boolean {
  return checkFormat(e.source, e.target) !== null;
}

/** 手冊條目的格式碼檢查（含 Patchouli $(…)） */
export function hasGuideWarning(e: TranslationEntry): boolean {
  return checkGuideFormat(e.source, e.target) !== null;
}

function computeStats(entries: readonly TranslationEntry[], warn: (e: TranslationEntry) => boolean): ProjectStats {
  const active = entries.filter((e) => e.status !== 'obsolete');
  const translated = active.filter((e) => e.target !== '').length;
  const warnings = active.filter(warn).length;
  const percent = active.length === 0 ? 0 : Math.round((translated / active.length) * 100);
  return { total: active.length, translated, warnings, percent };
}

/** 語言檔完成度（不含手冊）；FTB 任務專案以任務格式碼判斷 warnings */
export function projectStats(p: ModProject): ProjectStats {
  return computeStats(p.entries, isQuestProjectId(p.id) ? hasQuestWarning : hasWarning);
}

/** 手冊完成度；沒有手冊時回傳 null */
export function guideStats(p: ModProject): ProjectStats | null {
  return p.guide ? computeStats(p.guide.entries, hasGuideWarning) : null;
}
