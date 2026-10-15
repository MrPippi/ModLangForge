import { checkGlossary } from '../glossary/check';
import type { GlossaryTerm } from '../glossary/schema';
import { checkFormat } from '../validate/formatCodes';
import { catalogModSchema, type CatalogMod } from './schema';

export interface ModIssue {
  readonly level: 'error' | 'warning';
  readonly file: 'mod.json' | 'en_us.json' | 'zh_tw.json' | 'glossary.json';
  readonly key?: string;
  readonly message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function langIssues(file: ModIssue['file'], value: unknown): ModIssue[] {
  if (!isPlainObject(value)) return [{ level: 'error', file, message: '語言檔頂層必須是物件' }];
  return Object.entries(value)
    .filter(([, v]) => typeof v !== 'string')
    .map(([key]) => ({ level: 'error', file, key, message: '值必須是字串' }));
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

function crossIssues(en: Record<string, string>, zh: Record<string, string>): ModIssue[] {
  return Object.entries(zh).flatMap(([key, target]): ModIssue[] => {
    const source = Object.hasOwn(en, key) ? en[key] : undefined;
    if (source === undefined) {
      return [{ level: 'error', file: 'zh_tw.json', key, message: 'en_us.json 中沒有此 key' }];
    }
    const issue = checkFormat(source, target);
    if (!issue) return [];
    const parts = [...issue.missing.map((t) => `缺少 ${t}`), ...issue.extra.map((t) => `多出 ${t}`)];
    return [{ level: 'warning', file: 'zh_tw.json', key, message: `格式碼不一致：${parts.join('、')}` }];
  });
}

function glossaryIssues(en: Record<string, string>, zh: Record<string, string>, terms: readonly GlossaryTerm[]): ModIssue[] {
  if (terms.length === 0) return [];
  return Object.entries(zh).flatMap(([key, target]): ModIssue[] => {
    const source = Object.hasOwn(en, key) ? en[key] : undefined;
    if (source === undefined) return [];
    return checkGlossary(source, target, terms).map(({ term, level }) => ({
      level,
      file: 'zh_tw.json',
      key,
      message: `術語「${term.en}」應譯為「${term.zh}」`,
    }));
  });
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
  return [...sourceVersionIssues(meta, enRecord), ...crossIssues(enRecord, zhRecord), ...glossaryIssues(enRecord, zhRecord, terms)];
}
