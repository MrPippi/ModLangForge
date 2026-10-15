import { checkFormat } from '../validate/formatCodes';
import { catalogModSchema } from './schema';

export interface ModIssue {
  readonly level: 'error' | 'warning';
  readonly file: 'mod.json' | 'en_us.json' | 'zh_tw.json';
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
  return [];
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

/** 驗證單一模組資料夾的內容；回傳空陣列代表完全合法 */
export function validateModData(dirName: string, metaRaw: unknown, en: unknown, zh: unknown): ModIssue[] {
  const base = [...metaIssues(dirName, metaRaw), ...langIssues('en_us.json', en), ...langIssues('zh_tw.json', zh)];
  if (base.some((i) => i.level === 'error')) return base;
  return crossIssues(en as Record<string, string>, zh as Record<string, string>);
}
