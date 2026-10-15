import { resolve } from 'node:path';
import { catalogToProject, type CatalogMod } from '@mlf/core/catalog';
import { projectStats, type ProjectStats } from '@mlf/core/merge';
import { formatIssues, loadAllMods, type LoadedMod } from '@mlf/core/node';

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

/** 目錄摘要（首頁、列表頁、API index 共用） */
export interface ModSummary {
  readonly modId: string;
  readonly name: string;
  readonly nameZh: string | null;
  readonly summary: string;
  readonly mcVersions: readonly string[];
  readonly loaders: readonly CatalogMod['loaders'][number][];
  readonly status: CatalogMod['translation']['status'];
  readonly percent: number;
  readonly total: number;
  readonly updatedAt: string;
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

export function byUpdatedDesc(a: ModSummary, b: ModSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}
