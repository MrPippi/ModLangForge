import type { LangFormat, ModProject } from '../../types';
import { serializeLang } from '../lang';
import type { UntranslatedMode } from './types';

export function langFileName(format: LangFormat): string {
  return format === 'json' ? 'zh_tw.json' : 'zh_TW.lang';
}

export function buildLangPairs(p: ModProject, mode: UntranslatedMode): [string, string][] {
  return p.entries
    .filter((e) => e.status !== 'obsolete')
    .filter((e) => mode === 'keep-source' || e.target !== '')
    .map((e) => [e.key, e.target !== '' ? e.target : e.source]);
}

export function buildLangText(p: ModProject, mode: UntranslatedMode): string {
  return serializeLang(buildLangPairs(p, mode), p.format);
}
