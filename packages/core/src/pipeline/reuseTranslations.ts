/** 英文原文 → 同模組既有 key 的各種譯文（排除這次新增的 key 與空譯文） */
function translationsByText(
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
  added: ReadonlySet<string>,
): Map<string, Set<string>> {
  const byText = new Map<string, Set<string>>();
  for (const [key, text] of Object.entries(en)) {
    const translated = zh[key];
    if (added.has(key) || translated === undefined || translated.trim() === '') continue;
    byText.set(text, (byText.get(text) ?? new Set()).add(translated));
  }
  return byText;
}

/**
 * 新 key 的英文與同模組已翻譯的舊 key 完全相同時，沿用那筆譯文（例如 block.* 改名成 item.*、命名空間改名）。
 * 同一句英文在模組裡有兩種以上譯文時不沿用，留給人工判斷。回傳要加入 zh_tw 的項目，不修改輸入。
 */
export function reuseTranslations(
  en: Readonly<Record<string, string>>,
  zh: Readonly<Record<string, string>>,
  addedKeys: readonly string[],
): Record<string, string> {
  const byText = translationsByText(en, zh, new Set(addedKeys));
  return Object.fromEntries(
    addedKeys.flatMap((key) => {
      const options = [...(byText.get(en[key] ?? '') ?? [])];
      return options.length === 1 && options[0] !== undefined && !zh[key] ? [[key, options[0]]] : [];
    }),
  );
}
