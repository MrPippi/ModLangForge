import type { LangFormat } from '../../types';

/** 依傳入順序序列化（不經 Object，避免整數 key 被重新排序） */
export function serializeLang(pairs: readonly (readonly [string, string])[], format: LangFormat): string {
  if (format === 'lang') {
    return pairs.map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  }
  if (pairs.length === 0) return '{}\n';
  const body = pairs.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n${body}\n}\n`;
}
