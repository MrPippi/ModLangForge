function ownString(record: Readonly<Record<string, unknown>>, key: string): string | null {
  if (!Object.hasOwn(record, key)) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

/** 取得某 key 的原文與目前譯文；原文不存在時回傳 null */
export function lookupEntry(
  en: Readonly<Record<string, unknown>>,
  zh: Readonly<Record<string, unknown>>,
  key: string,
): { source: string; current: string | null } | null {
  const source = ownString(en, key);
  return source === null ? null : { source, current: ownString(zh, key) };
}
