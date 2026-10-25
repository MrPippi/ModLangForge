/**
 * 從 main 的 git 紀錄整理每天的翻譯資料變動，寫入 data/changelog/translations.json（網站「更新日誌」頁使用）。
 * 需要完整 git 歷史；淺層 clone 時請先 git fetch --unshallow。
 * 用法：npm run changelog:build
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { type DataCommit, type DayFiles, type FileStatus, groupByDay, taipeiDate, toTranslationDay, type TranslationChangelog, type VersionInfo } from '@mlf/core/changelog';
import { toJson } from './lib/modrinth';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_FILE = resolve(ROOT, 'data', 'changelog', 'translations.json');
const DATA_PATHS = ['data/mods', 'data/builtin-mods'];
const MAX_BUFFER = 512 * 1024 * 1024;

function git(args: readonly string[], input?: string): Buffer {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: MAX_BUFFER, ...(input !== undefined ? { input } : {}) });
}

const STATUSES: ReadonlySet<string> = new Set(['A', 'M', 'D']);

/** 解析 git log --name-status 的輸出（由新到舊），回傳由舊到新 */
function readCommits(): DataCommit[] {
  const text = git([
    'log', '--first-parent', '--diff-merges=first-parent', '--no-renames', '--name-status',
    '--format=@%H %P%x09%cI', 'HEAD', '--', ...DATA_PATHS,
  ]).toString('utf8');
  const commits: DataCommit[] = [];
  for (const block of text.split('\n@').map((b) => b.replace(/^@/, ''))) {
    const [header, ...lines] = block.split('\n');
    if (!header) continue;
    const [hashes = '', iso = ''] = header.split('\t');
    const [hash = '', parent] = hashes.trim().split(' ');
    const files = lines
      .map((l) => l.split('\t'))
      .filter((parts): parts is [string, string] => parts.length === 2 && STATUSES.has(parts[0] ?? ''))
      .map(([status, path]) => ({ status: status as FileStatus, path }));
    commits.push({ hash, parent: parent ?? null, date: taipeiDate(iso), files });
  }
  return commits.reverse();
}

const versionInfoSchema = z.object({
  mcVersions: z.array(z.string()),
  sourceVersions: z.array(z.object({ modVersion: z.string().optional(), mcVersion: z.string() })),
});

/** 一次用 git cat-file --batch 讀出所有需要的 mod.json；不存在或格式不符的回傳 null */
function readVersionInfos(specs: readonly string[]): (VersionInfo | null)[] {
  if (specs.length === 0) return [];
  const out = git(['cat-file', '--batch'], `${specs.join('\n')}\n`);
  const results: (VersionInfo | null)[] = [];
  let pos = 0;
  for (let i = 0; i < specs.length; i++) {
    const lineEnd = out.indexOf(0x0a, pos);
    const header = out.subarray(pos, lineEnd).toString('utf8');
    pos = lineEnd + 1;
    if (header.endsWith(' missing') || header.endsWith(' ambiguous')) {
      results.push(null);
      continue;
    }
    const size = Number(header.split(' ')[2]);
    const body = out.subarray(pos, pos + size).toString('utf8');
    pos += size + 1;
    try {
      const parsed = versionInfoSchema.safeParse(JSON.parse(body));
      results.push(parsed.success ? parsed.data : null);
    } catch {
      results.push(null);
    }
  }
  return results;
}

function versionPairs(days: readonly DayFiles[]): Map<string, Map<string, { before: VersionInfo; after: VersionInfo }>> {
  const requests = days.flatMap((day) => (day.before ? day.metaChanged.map((modId) => ({ day, modId, before: day.before })) : []));
  const infos = readVersionInfos(requests.flatMap((r) => [`${r.before}:data/mods/${r.modId}/mod.json`, `${r.day.after}:data/mods/${r.modId}/mod.json`]));
  const byDay = new Map<string, Map<string, { before: VersionInfo; after: VersionInfo }>>();
  requests.forEach((r, i) => {
    const before = infos[i * 2];
    const after = infos[i * 2 + 1];
    if (!before || !after) return;
    const map = byDay.get(r.day.date) ?? new Map();
    byDay.set(r.day.date, map.set(r.modId, { before, after }));
  });
  return byDay;
}

async function main(): Promise<void> {
  if (git(['rev-parse', '--is-shallow-repository']).toString('utf8').trim() === 'true') {
    throw new Error('需要完整的 git 歷史，請先執行 git fetch --unshallow');
  }
  const days = groupByDay(readCommits());
  const pairs = versionPairs(days);
  const changelog: TranslationChangelog = {
    version: 1,
    days: days.flatMap((day) => toTranslationDay(day, pairs.get(day.date) ?? new Map()) ?? []),
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, toJson(changelog));
  console.log(`已寫入 ${changelog.days.length} 天的翻譯更新紀錄到 data/changelog/translations.json`);
}

main().catch((err: unknown) => {
  console.error('build-changelog 執行失敗', err);
  process.exitCode = 1;
});
