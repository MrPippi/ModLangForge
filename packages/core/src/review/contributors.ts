import { sanitizeName } from './profile';

/** 附加新名字到尾端：清理（控制字元、雙向字元、空白）、去重、略過空值，保留既有順序 */
export function mergeContributors(existing: readonly string[], incoming: readonly (string | null)[]): string[] {
  return incoming.reduce<string[]>((acc, raw) => {
    const name = raw === null ? '' : sanitizeName(raw);
    return name === '' || acc.includes(name) ? acc : [...acc, name];
  }, [...existing]);
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 台灣日期（UTC+8，無日光節約） */
export function taipeiDate(now: Date): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}
