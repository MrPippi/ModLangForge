import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogToProject } from '@mlf/core/catalog';
import { guideStats, projectStats, type ProjectStats } from '@mlf/core/merge';
import type { GlossaryTerm } from '@mlf/core/glossary';
import { formatIssues, loadAllMods, type LoadedMod } from '@mlf/core/node';
import { modIconUrl } from './modIcon';
import type { ModSummary } from './summary';

export type { ModSummary } from './summary';
export { byUpdatedDesc } from './summary';

export interface SiteMod extends LoadedMod {
  readonly stats: ProjectStats;
  /** 手冊完成度；沒有手冊時為 null */
  readonly guideStats: ProjectStats | null;
}

/** 語言檔與手冊分別統計 */
export function toSiteMod(m: LoadedMod): SiteMod {
  const project = catalogToProject(m.meta, m.en, m.zh, m.guide);
  return { ...m, stats: projectStats(project), guideStats: guideStats(project) };
}

/** 建置時讀取的資料目錄；可用 MLF_DATA_DIR 覆寫 */
const DATA_DIR = process.env.MLF_DATA_DIR ?? resolve(process.cwd(), '../../data');

/** npm run icons:fetch 下載的模組圖示 */
const ICON_DIR = resolve(process.cwd(), 'public/mod-icons');

let icons: ReadonlySet<string> | null = null;

function availableIcons(): ReadonlySet<string> {
  icons ??= new Set((existsSync(ICON_DIR) ? readdirSync(ICON_DIR) : []).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -'.webp'.length)));
  return icons;
}

export function modIcon(modId: string): string | null {
  return modIconUrl(modId, availableIcons());
}

interface SiteData {
  readonly mods: readonly SiteMod[];
  readonly glossary: readonly GlossaryTerm[];
}

let cache: Promise<SiteData> | null = null;

async function load(): Promise<SiteData> {
  const { mods, issues, glossary } = await loadAllMods(DATA_DIR);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    throw new Error(`翻譯資料驗證失敗：\n${formatIssues(errors, 'data').join('\n')}`);
  }
  return { mods: mods.map(toSiteMod), glossary };
}

function siteData(): Promise<SiteData> {
  cache ??= load();
  return cache;
}

export async function getCatalog(): Promise<readonly SiteMod[]> {
  return (await siteData()).mods;
}

export interface GlossaryPayload {
  readonly version: 1;
  readonly global: readonly GlossaryTerm[];
  readonly mods: Readonly<Record<string, readonly GlossaryTerm[]>>;
}

/** 只收錄有模組術語表的模組 */
export function toGlossaryPayload(mods: readonly Pick<SiteMod, 'meta' | 'glossary'>[], global: readonly GlossaryTerm[]): GlossaryPayload {
  return {
    version: 1,
    global,
    mods: Object.fromEntries(mods.filter((m) => m.glossary.length > 0).map((m) => [m.meta.modId, m.glossary])),
  };
}

export async function getGlossary(): Promise<GlossaryPayload> {
  const { mods, glossary } = await siteData();
  return toGlossaryPayload(mods, glossary);
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
    icon: modIcon(m.meta.modId),
    hasGuide: m.guide !== undefined,
  };
}
