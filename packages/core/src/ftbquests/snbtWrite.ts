export type SnbtLangValue = string | readonly string[];

/** FTB Library SNBTUtils 的跳脫字元（\" \\ \t \b \n \r \f）；其餘字元原樣輸出 */
const ESCAPE_OUT: Readonly<Record<string, string>> = {
  '"': '\\"', '\\': '\\\\', '\t': '\\t', '\b': '\\b', '\n': '\\n', '\r': '\\r', '\f': '\\f',
};
const NEEDS_ESCAPE = /["\\\t\b\n\r\f]/g;

export function quoteSnbt(text: string): string {
  return `"${text.replace(NEEDS_ESCAPE, (c) => ESCAPE_OUT[c] ?? c)}"`;
}

function listText(lines: readonly string[]): string {
  return lines.length === 0 ? '[]' : `[\n${lines.map((line) => `\t\t${quoteSnbt(line)}`).join(',\n')}\n\t]`;
}

/**
 * 輸出 FTB 任務 lang 檔：key 一律加引號、項目以逗號分隔，
 * 因此同時是 FTB Library SNBT、JSON5（FTB Quests 26.x 的 lang 資料夾）與 JSON 都能讀的格式。
 */
export function writeSnbtLang(entries: readonly (readonly [string, SnbtLangValue])[]): string {
  if (entries.length === 0) return '{\n}\n';
  const body = entries.map(([key, value]) => `\t${quoteSnbt(key)}: ${typeof value === 'string' ? quoteSnbt(value) : listText(value)}`);
  return `{\n${body.join(',\n')}\n}\n`;
}
