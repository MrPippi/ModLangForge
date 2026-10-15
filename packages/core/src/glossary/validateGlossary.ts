import { glossaryFileSchema, type GlossaryTerm } from './schema';

export type GlossaryFileResult =
  | { readonly ok: true; readonly terms: readonly GlossaryTerm[] }
  | { readonly ok: false; readonly messages: readonly string[] };

/** 驗證術語檔內容：schema 與同檔英文詞重複（不分大小寫） */
export function validateGlossaryFile(raw: unknown): GlossaryFileResult {
  const parsed = glossaryFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, messages: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}：${i.message}`) };
  }
  const keys = parsed.data.terms.map((t) => t.en.toLowerCase());
  const dupes = parsed.data.terms.filter((_, i) => keys.indexOf(keys[i]!) !== i).map((t) => `術語「${t.en}」重複`);
  return dupes.length > 0 ? { ok: false, messages: dupes } : { ok: true, terms: parsed.data.terms };
}
