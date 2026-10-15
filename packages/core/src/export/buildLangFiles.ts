import type { LangFormat, ModProject } from '../types';
import { serializeLang } from '../lang';
import type { UntranslatedMode } from './types';

export function langFileName(format: LangFormat): string {
  // 1.11 起語言代碼全小寫；本站所有版本的 pack_format 皆 >= 3，因此 .lang 也用小寫
  return format === 'json' ? 'zh_tw.json' : 'zh_tw.lang';
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
