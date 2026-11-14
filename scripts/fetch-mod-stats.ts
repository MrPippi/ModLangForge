/**
 * 依各模組的追蹤平台（Modrinth 優先，其次 CurseForge）抓取下載量，寫入 data/mod-stats.json。
 * 單一模組抓取失敗只警告並保留舊數字；沒有 CurseForge 金鑰時，CurseForge 專有模組不抓、保留舊數字；
 * 下載量比上次少的模組照常寫入（平台可能真的扣除了下載數），但會警告；指定 --summary 時把清單附加到該檔（PR 摘要）。
 * 只有寫檔失敗才讓結束碼非 0。
 * 用法：npm run stats:fetch -- [--summary <path>]
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findDownloadDrops, modStatsSchema, mergeModStats, renderDownloadDrops, type ModStats, type StatsPlatform } from '@mlf/core/catalog';
import { findCurseforgeProject } from '@mlf/core/curseforgeMods';
import { redact } from '@mlf/core/modpackImport';
import { readCurseforgeKey } from './lib/curseforgeKey';
import { API, getJson, toJson } from './lib/modrinth';
import { listModIds, trackingSources, type TrackingSource } from './lib/modrinthLinks';

const STATS_FILE = resolve(import.meta.dirname, '..', 'data', 'mod-stats.json');

async function readPrevious(): Promise<ModStats> {
  try {
    return modStatsSchema.parse(JSON.parse(await readFile(STATS_FILE, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, mods: {} };
    throw err;
  }
}

function checkedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`unexpected downloads: ${String(value)}`);
  return value;
}

async function fetchModrinthDownloads(slug: string): Promise<number> {
  const project = await getJson<{ downloads: number }>(`${API}/project/${encodeURIComponent(slug)}`);
  return checkedCount(project.downloads);
}

async function fetchCurseforgeDownloads(slug: string, apiKey: string): Promise<number> {
  const project = await findCurseforgeProject(fetch, apiKey, slug);
  if (!project) throw new Error(`找不到 CurseForge 專案 ${slug}`);
  return checkedCount(project.downloadCount);
}

function fetchDownloads(source: TrackingSource, apiKey: string | undefined): Promise<number> {
  if (source.platform === 'modrinth') return fetchModrinthDownloads(source.slug);
  return fetchCurseforgeDownloads(source.slug, apiKey as string);
}

async function reportDrops(prev: ModStats, fetched: Parameters<typeof findDownloadDrops>[1], summaryPath: string | undefined): Promise<void> {
  const drops = findDownloadDrops(prev, fetched);
  if (drops.length === 0) return;
  console.warn(`${drops.length} 個模組的下載量比上次少：${drops.map((d) => `${d.modId}（${d.before} → ${d.after}）`).join('、')}`);
  if (!summaryPath) return;
  try {
    await appendFile(summaryPath, `
${renderDownloadDrops(drops)}`, 'utf8');
  } catch (err) {
    console.warn(`無法把下載量下降清單寫入摘要 ${summaryPath}`, err);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { summary: { type: 'string' } } });
  const apiKey = readCurseforgeKey();
  const sources = await trackingSources(await listModIds());
  const fetched: Record<string, { downloads: number; platform: StatsPlatform }> = {};
  let skippedNoKey = 0;
  for (const [modId, source] of sources) {
    if (source.platform === 'curseforge' && !apiKey) {
      skippedNoKey += 1;
      continue;
    }
    try {
      const downloads = await fetchDownloads(source, apiKey);
      fetched[modId] = { downloads, platform: source.platform };
      console.log(`${modId}（${source.platform}）: ${downloads}`);
    } catch (err) {
      const message = redact(err instanceof Error ? err.message : String(err), apiKey);
      console.warn(`${modId}: 抓取失敗，保留舊數字（${message}）`);
    }
  }
  if (skippedNoKey > 0) console.log(`略過 ${skippedNoKey} 個 CurseForge 專有模組：沒有 CurseForge 金鑰，保留舊數字`);
  try {
    const previous = await readPrevious();
    await reportDrops(previous, fetched, values.summary);
    const merged = mergeModStats(previous, fetched, new Set(sources.keys()), new Date().toISOString().slice(0, 10));
    await writeFile(STATS_FILE, toJson(merged));
    console.log(`已更新 ${Object.keys(fetched).length} 個模組的下載量`);
  } catch (err) {
    console.error('寫入 mod-stats.json 失敗', err);
    process.exitCode = 1;
  }
}

await main();
