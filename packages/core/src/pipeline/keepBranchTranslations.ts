type Lang = Readonly<Record<string, string>>;

export interface BranchTranslationInput {
  /** 這次追蹤開始時的 main（追蹤前） */
  readonly base: Lang;
  /** 上次追蹤 PR 分支上的 zh_tw（可能有人手動補翻或修正） */
  readonly branch: Lang;
  /** 這次追蹤產生的 zh_tw */
  readonly current: Lang;
  /** 這次追蹤產生的 en_us */
  readonly en: Lang;
}

export interface BranchTranslationResult {
  readonly zh: Lang;
  /** 從分支搬回的 key（依分支檔案順序） */
  readonly kept: readonly string[];
}

/**
 * 追蹤重跑會用新結果覆蓋追蹤 PR 分支；分支上與 main 不同的譯文（手動補翻或修正）搬回新結果，以免被洗掉。
 * 只搬英文原文仍存在、且不是空字串的 key；分支上刪掉的譯文不會跟著刪（新結果照舊）。
 */
export function keepBranchTranslations({ base, branch, current, en }: BranchTranslationInput): BranchTranslationResult {
  const kept = Object.entries(branch)
    .filter(([key, text]) => text !== '' && base[key] !== text && current[key] !== text && Object.hasOwn(en, key))
    .map(([key]) => key);
  if (kept.length === 0) return { zh: current, kept };
  return { zh: { ...current, ...Object.fromEntries(kept.map((key) => [key, branch[key] ?? ''])) }, kept };
}
