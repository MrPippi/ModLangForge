import { type ParsedLang, stripBom } from './types';

/** 解析 1.12 以前的 .lang（key=value）格式 */
export function parseLangFile(text: string): ParsedLang {
  const entries = new Map<string, string>();
  const warnings: string[] = [];
  const lines = stripBom(text).split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const eq = raw.indexOf('=');
    if (eq <= 0) {
      warnings.push(`第 ${index + 1} 行格式錯誤，已略過`);
      return;
    }
    entries.set(raw.slice(0, eq).trim(), raw.slice(eq + 1));
  });
  return { entries: Object.fromEntries(entries), order: [...entries.keys()], warnings };
}
