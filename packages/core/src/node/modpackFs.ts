import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KubejsTexts } from '../modpack/types';
import type { ModpackIssue } from '../modpack/validate';
import { isMissing, parseJsonText } from './fsErrors';

export async function listEntries(dir: string): Promise<Dirent[] | null> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

export type JsonRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ModpackIssue };

/** optional 為 true 時檔案不存在回傳 null；否則回報「檔案不存在」 */
export async function readJson(path: string, file: ModpackIssue['file'], optional: boolean): Promise<JsonRead | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (!isMissing(err)) throw err;
    return optional ? null : { ok: false, issue: { level: 'error', file, message: '檔案不存在' } };
  }
  const parsed = parseJsonText(text);
  return parsed.ok ? parsed : { ok: false, issue: { level: 'error', file, message: `JSON 解析失敗：${parsed.reason}` } };
}

export interface TextPairSpec {
  readonly dir: string;
  readonly enFile: string;
  readonly zhFile: string;
  /** 檔名 → ModpackIssue.file（用於問題路徑） */
  readonly fileOf: (name: string) => ModpackIssue['file'];
  /** en 檔可以不存在（任務資料夾）或必須存在（KubeJS 命名空間） */
  readonly enOptional: boolean;
  readonly validate: (en: unknown, zh: unknown) => readonly ModpackIssue[];
}

export interface TextPairLoad {
  /** en 檔存在（不論內容是否合法） */
  readonly hasEnglish: boolean;
  /** 只在沒有 error 時存在 */
  readonly texts?: KubejsTexts;
  readonly issues: readonly ModpackIssue[];
}

/** 讀取資料夾裡的 en／zh 兩個 JSON 檔：只接受這兩個檔案，讀取、驗證，有 error 時不回傳 texts */
export async function loadTextPair(spec: TextPairSpec): Promise<TextPairLoad> {
  const allowed: ReadonlySet<string> = new Set([spec.enFile, spec.zhFile]);
  const extra = ((await listEntries(spec.dir)) ?? [])
    .filter((e) => !e.isFile() || !allowed.has(e.name))
    .map((e): ModpackIssue => ({ level: 'error', file: spec.fileOf(e.name), message: '只接受 en_us.json 與 zh_tw.json' }));
  const [en, zh] = await Promise.all([
    readJson(join(spec.dir, spec.enFile), spec.fileOf(spec.enFile), spec.enOptional),
    readJson(join(spec.dir, spec.zhFile), spec.fileOf(spec.zhFile), true),
  ]);
  const readIssues = [en, zh].flatMap((r) => (r && !r.ok ? [r.issue] : []));
  const hasEnglish = en !== null;
  if (readIssues.length > 0 || !en?.ok) return { hasEnglish, issues: [...extra, ...readIssues] };
  const zhValue = zh?.ok ? zh.value : {};
  const issues = [...extra, ...spec.validate(en.value, zhValue)];
  if (issues.some((i) => i.level === 'error')) return { hasEnglish, issues };
  return { hasEnglish, texts: { en: en.value as Record<string, string>, zh: zhValue as Record<string, string> }, issues };
}
