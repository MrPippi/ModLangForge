import type { ModProject, TranslationEntry } from '../../types';
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

export function projectStats(p: ModProject): ProjectStats {
  const active = p.entries.filter((e) => e.status !== 'obsolete');
  const translated = active.filter((e) => e.target !== '').length;
  const warnings = active.filter(hasWarning).length;
  const percent = active.length === 0 ? 0 : Math.round((translated / active.length) * 100);
  return { total: active.length, translated, warnings, percent };
}
