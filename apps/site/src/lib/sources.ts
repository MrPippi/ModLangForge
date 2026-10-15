interface TranslationSource {
  readonly source: { readonly name: string; readonly url: string | null };
  readonly license: string;
}

/** 依「名稱＋網址＋授權」去重，保留首次出現順序 */
export function uniqueSources<T extends TranslationSource>(list: readonly T[]): T[] {
  const byKey = new Map<string, T>();
  for (const item of list) {
    const key = JSON.stringify([item.source.name, item.source.url, item.license]);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}
