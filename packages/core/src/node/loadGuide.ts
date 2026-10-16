import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { GUIDE_ZH_FILE, validateGuideData } from '../catalog/validateGuide';
import type { ModIssue } from '../catalog/validateMod';
import type { GlossaryTerm } from '../glossary/schema';
import { stripBom } from '../lang/types';
import { flatten } from '../patchouli/flatten';
import type { GuideFiles } from '../types';

/** 原樣手冊檔所在的子資料夾 */
export const GUIDE_DIR = 'patchouli';

export interface LoadedGuide {
  readonly files: GuideFiles;
  /** 由 files 即時攤平的英文原文 */
  readonly en: Readonly<Record<string, string>>;
  readonly zh: Readonly<Record<string, string>>;
}

export interface GuideLoad {
  readonly guide?: LoadedGuide;
  readonly issues: readonly ModIssue[];
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** 列出 root 底下所有檔案（以 / 分隔的相對路徑，排序）；資料夾不存在時回傳 null */
async function listFiles(root: string): Promise<string[] | null> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
      .sort();
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

type ZhRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly issue: ModIssue };

async function readZh(dir: string): Promise<ZhRead | null> {
  let text: string;
  try {
    text = await readFile(join(dir, GUIDE_ZH_FILE), 'utf8');
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  try {
    return { ok: true, value: JSON.parse(stripBom(text)) as unknown };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, issue: { level: 'error', file: GUIDE_ZH_FILE, message: `JSON 解析失敗：${reason}` } };
  }
}

/** 讀取模組資料夾的 patchouli/** 與 patchouli_zh_tw.json；兩者皆不存在時沒有手冊 */
export async function loadGuide(dir: string, terms: readonly GlossaryTerm[]): Promise<GuideLoad> {
  const root = join(dir, GUIDE_DIR);
  const [paths, zh] = await Promise.all([listFiles(root), readZh(dir)]);
  if ((paths === null || paths.length === 0) && zh === null) return { issues: [] };
  if (zh !== null && !zh.ok) return { issues: [zh.issue] };
  const list = paths ?? [];
  const texts = await Promise.all(list.map((p) => readFile(join(root, ...p.split('/')), 'utf8')));
  const files: GuideFiles = Object.fromEntries(list.map((p, i) => [p, texts[i] ?? '']));
  const zhValue = zh?.value ?? {};
  const issues = validateGuideData(files, zhValue, terms);
  if (issues.some((i) => i.level === 'error')) return { issues };
  const { source, order } = flatten(files);
  if (order.length === 0) return { issues };
  return { guide: { files, en: source, zh: zhValue as Record<string, string> }, issues };
}
