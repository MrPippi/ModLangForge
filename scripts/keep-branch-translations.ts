/**
 * 追蹤重跑前，把上次追蹤 PR 分支上手動補翻或修正的 zh_tw 譯文搬回這次的結果，以免強制推送時被洗掉。
 * 以這次追蹤開始時的 HEAD（main）為基準：分支上與 main 不同、英文原文仍存在的譯文才搬回。
 * 只動 data/mods/<modId>/zh_tw.json；分支上刪掉的譯文不跟著刪。
 * 用法：npm run track:keep-branch -- --ref origin/auto/track-versions [--summary <path>]
 */
import { execFileSync } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { keepBranchTranslations } from '@mlf/core/pipeline';
import { MODS_DIR, toJson } from './lib/modrinth';

const ROOT = join(MODS_DIR, '..', '..');
const LANG_FILE = /^data\/mods\/([^/]+)\/zh_tw\.json$/;
const MAX_BUFFER = 64 * 1024 * 1024;

type Lang = Record<string, string>;

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER });
}

function existsAt(ref: string, path: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${path}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 讀 git 版本中的 JSON 語言檔；該版本沒有這個檔案時回傳空物件 */
function langAt(ref: string, path: string): Lang {
  return existsAt(ref, path) ? parseLang(git(['show', `${ref}:${path}`]), `${ref}:${path}`) : {};
}

function parseLang(text: string, where: string): Lang {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.values(value).some((v) => typeof v !== 'string')) {
    throw new Error(`語言檔格式錯誤：${where}`);
  }
  return value as Lang;
}

async function readLang(path: string): Promise<Lang | null> {
  try {
    return parseLang(await readFile(path, 'utf8'), path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** 單一模組：回傳搬回的 key 數 */
async function keepFor(ref: string, modId: string): Promise<number> {
  const dir = join(MODS_DIR, modId);
  const [en, current] = await Promise.all([readLang(join(dir, 'en_us.json')), readLang(join(dir, 'zh_tw.json'))]);
  if (!en) return 0;
  const path = `data/mods/${modId}/zh_tw.json`;
  const { zh, kept } = keepBranchTranslations({ base: langAt('HEAD', path), branch: langAt(ref, path), current: current ?? {}, en });
  if (kept.length === 0) return 0;
  await writeFile(join(dir, 'zh_tw.json'), toJson(zh), 'utf8');
  return kept.length;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { ref: { type: 'string' }, summary: { type: 'string' } } });
  const ref = values.ref;
  if (!ref) throw new Error('需要 --ref <分支>');
  const modIds = git(['ls-tree', '-r', '--name-only', ref, '--', 'data/mods'])
    .split('\n')
    .flatMap((line) => LANG_FILE.exec(line)?.[1] ?? []);
  const counts: [string, number][] = [];
  for (const modId of modIds) {
    const n = await keepFor(ref, modId);
    if (n > 0) counts.push([modId, n]);
  }
  if (counts.length === 0) {
    console.log('追蹤分支上沒有手動修改的譯文');
    return;
  }
  const lines = counts.map(([modId, n]) => `- ${modId}：${n} 條`);
  console.log(`已從 ${ref} 搬回手動修改的譯文：\n${lines.join('\n')}`);
  if (values.summary) {
    await appendFile(values.summary, `\n## 沿用追蹤 PR 上手動修改的譯文\n\n${lines.join('\n')}\n`, 'utf8');
  }
}

await main();
