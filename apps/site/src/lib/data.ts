import { resolve } from 'node:path';
import { catalogToProject } from '@mlf/core/catalog';
import { projectStats, type ProjectStats } from '@mlf/core/merge';
import { formatIssues, loadAllMods, type LoadedMod } from '@mlf/core/node';
import type { ModSummary } from './summary';

export type { ModSummary } from './summary';
export { byUpdatedDesc } from './summary';

export interface SiteMod extends LoadedMod {
  readonly stats: ProjectStats;
}

/** 建置時讀取的資料目錄；可用 MLF_DATA_DIR 覆寫 */
const DATA_DIR = process.env.MLF_DATA_DIR ?? resolve(process.cwd(), '../../data');

let cache: Promise<readonly SiteMod[]> | null = null;

async function load(): Promise<readonly SiteMod[]> {
  const { mods, issues } = await loadAllMods(DATA_DIR);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    throw new Error(`翻譯資料驗證失敗：\n${formatIssues(errors, 'data').join('\n')}`);
  }
  return mods.map((m) => ({ ...m, stats: projectStats(catalogToProject(m.meta, m.en, m.zh)) }));
}

export function getCatalog(): Promise<readonly SiteMod[]> {
  cache ??= load();
  return cache;
}

export async function getMod(modId: string): Promise<SiteMod | undefined> {
  return (await getCatalog()).find((m) => m.meta.modId === modId);
}

export function toSummary(m: SiteMod): ModSummary {
  return {
    modId: m.meta.modId,
    name: m.meta.name,
    nameZh: m.meta.nameZh ?? null,
    summary: m.meta.summary,
    mcVersions: m.meta.mcVersions,
    loaders: m.meta.loaders,
    status: m.meta.translation.status,
    percent: m.stats.percent,
    total: m.stats.total,
    updatedAt: m.meta.updatedAt,
  };
}
