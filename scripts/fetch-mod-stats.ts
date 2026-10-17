/**
 * 從 Modrinth 抓取各模組的下載量，寫入 data/modrinth-stats.json。
 * 單一模組抓取失敗只警告並保留舊數字；只有寫檔失敗才讓結束碼非 0。
 * 用法：npm run stats:fetch
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { modStatsSchema, mergeModStats, type ModStats } from '@mlf/core/catalog';
import { API, getJson, toJson } from './lib/modrinth';
import { listModIds, modrinthSlugs } from './lib/modrinthLinks';

const STATS_FILE = resolve(import.meta.dirname, '..', 'data', 'modrinth-stats.json');

async function readPrevious(): Promise<ModStats> {
  try {
    return modStatsSchema.parse(JSON.parse(await readFile(STATS_FILE, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, mods: {} };
    throw err;
  }
}

async function fetchDownloads(slug: string): Promise<number> {
  const project = await getJson<{ downloads: number }>(`${API}/project/${encodeURIComponent(slug)}`);
  if (!Number.isInteger(project.downloads) || project.downloads < 0) throw new Error(`unexpected downloads: ${String(project.downloads)}`);
  return project.downloads;
}

async function main(): Promise<void> {
  const slugs = await modrinthSlugs(await listModIds());
  const fetched: Record<string, number> = {};
  for (const [modId, slug] of slugs) {
    try {
      const downloads = await fetchDownloads(slug);
      fetched[modId] = downloads;
      console.log(`${modId}: ${downloads}`);
    } catch (err) {
      console.warn(`${modId}: 抓取失敗，保留舊數字（${err instanceof Error ? err.message : String(err)}）`);
    }
  }
  try {
    const merged = mergeModStats(await readPrevious(), fetched, new Set(slugs.keys()), new Date().toISOString().slice(0, 10));
    await writeFile(STATS_FILE, toJson(merged));
    console.log(`已更新 ${Object.keys(fetched).length} 個模組的下載量`);
  } catch (err) {
    console.error('寫入 modrinth-stats.json 失敗', err);
    process.exitCode = 1;
  }
}

await main();
