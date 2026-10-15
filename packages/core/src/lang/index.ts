import type { LangFormat } from '../types';
import { parseJsonLang } from './parseJson';
import { parseLangFile } from './parseLang';
import type { ParsedLang } from './types';

export { parseJsonLang } from './parseJson';
export { parseLangFile } from './parseLang';
export { serializeLang } from './serialize';
export { LangParseError, type ParsedLang } from './types';

export function parseLangText(text: string, format: LangFormat): ParsedLang {
  return format === 'json' ? parseJsonLang(text) : parseLangFile(text);
}
