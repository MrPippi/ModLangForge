import { checkGlossary } from '../glossary/check';
import type { GlossaryTerm } from '../glossary/schema';
import { checkFormat, type FormatIssue } from '../validate/formatCodes';
import { catalogModSchema, type CatalogMod } from './schema';

export interface ModIssue {
  readonly level: 'error' | 'warning';
  readonly file: 'mod.json' | 'en_us.json' | 'zh_tw.json' | 'glossary.json' | 'patchouli_zh_tw.json' | 'builtin.json' | `patchouli/${string}`;
  readonly key?: string;
  readonly message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function langIssues<F extends string>(file: F, value: unknown): { level: 'error'; file: F; key?: string; message: string }[] {
  if (!isPlainObject(value)) return [{ level: 'error', file, message: '語言檔頂層必須是物件' }];
  return Object.entries(value)
    .filter(([, v]) => typeof v !== 'string')
    .map(([key]) => ({ level: 'error' as const, file, key, message: '值必須是字串' }));
}

function metaIssues(dirName: string, metaRaw: unknown): ModIssue[] {
  const parsed = catalogModSchema.safeParse(metaRaw);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      level: 'error',
      file: 'mod.json',
      message: `${i.path.join('.') || '(root)'}：${i.message}`,
    }));
  }
  if (parsed.data.modId !== dirName) {
    return [{ level: 'error', file: 'mod.json', message: `modId「${parsed.data.modId}」與資料夾名稱「${dirName}」不一致` }];
  }
  if (isPlainObject(metaRaw) && Object.hasOwn(metaRaw, 'modVersion')) {
    return [{ level: 'error', file: 'mod.json', message: 'modVersion 已改為 sourceVersions，請移除 modVersion' }];
  }
  return [];
}

function duplicates(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const k of list) (seen.has(k) ? dupes : seen).add(k);
  return [...dupes];
}

function sourceVersionIssues(meta: CatalogMod, en: Record<string, string>): ModIssue[] {
  const list = meta.sourceVersions;
  const perVersion = list.flatMap((v, i): ModIssue[] => {
    const prefix = `sourceVersions.${i}.missingKeys`;
    const unknown = v.missingKeys
      .filter((k) => !Object.hasOwn(en, k))
      .map((key): ModIssue => ({ level: 'error', file: 'mod.json', key, message: `${prefix}：en_us.json 中沒有此 key` }));
    const dupes = duplicates(v.missingKeys).map((key): ModIssue => ({ level: 'error', file: 'mod.json', key, message: `${prefix}：key 重複` }));
    return [...unknown, ...dupes];
  });
  const missingSets = list.map((v) => new Set(v.missingKeys));
  const orphans = Object.keys(en)
    .filter((k) => missingSets.every((s) => s.has(k)))
    .map((key): ModIssue => ({ level: 'error', file: 'en_us.json', key, message: '所有來源版本都沒有此 key' }));
  return [...perVersion, ...orphans];
}

/** 格式碼不一致的說明文字 */
export function formatIssueMessage(issue: FormatIssue): string {
  const parts = [...issue.missing.map((t) => `缺少 ${t}`), ...issue.extra.map((t) => `多出 ${t}`)];
  return `格式碼不一致：${parts.join('、')}`;
}

/** zh 中每個 key 的問題（未知 key → error、格式碼 → warning、術語 → 術語等級）；check 預設為一般格式碼檢查；不含 file */
export function translationKeyIssues(
  en: Record<string, string>,
  zh: Record<string, string>,
  terms: readonly GlossaryTerm[],
  check: (source: string, target: string) => FormatIssue | null = checkFormat,
): { level: 'error' | 'warning'; key: string; message: string }[] {
  const entries = Object.entries(zh).map(([key, target]) => ({ key, target, source: Object.hasOwn(en, key) ? en[key] : undefined }));
  const formatPass = entries.flatMap(({ key, target, source }): { level: 'error' | 'warning'; key: string; message: string }[] => {
    if (source === undefined) return [{ level: 'error', key, message: 'en_us.json 中沒有此 key' }];
    const issue = check(source, target);
    return issue ? [{ level: 'warning', key, message: formatIssueMessage(issue) }] : [];
  });
  const termPass = entries.flatMap(({ key, target, source }) =>
    source === undefined
      ? []
      : checkGlossary(source, target, terms).map(({ term, level }) => ({ level, key, message: `術語「${term.en}」應譯為「${term.zh}」` })),
  );
  return [...formatPass, ...termPass];
}

/** 驗證單一模組資料夾的內容；terms 為合併後的術語（全域＋模組）；回傳空陣列代表完全合法 */
export function validateModData(
  dirName: string,
  metaRaw: unknown,
  en: unknown,
  zh: unknown,
  terms: readonly GlossaryTerm[] = [],
): ModIssue[] {
  const base = [...metaIssues(dirName, metaRaw), ...langIssues('en_us.json', en), ...langIssues('zh_tw.json', zh)];
  if (base.some((i) => i.level === 'error')) return base;
  const enRecord = en as Record<string, string>;
  const zhRecord = zh as Record<string, string>;
  const meta = catalogModSchema.parse(metaRaw);
  return [
    ...sourceVersionIssues(meta, enRecord),
    ...translationKeyIssues(enRecord, zhRecord, terms).map((i): ModIssue => ({ ...i, file: 'zh_tw.json' })),
  ];
}
