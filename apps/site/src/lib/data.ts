import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogToProject, type BuiltinMod, modStatsSchema, type ModStats } from '@mlf/core/catalog';
import { guideStats, projectStats, type ProjectStats } from '@mlf/core/merge';
import type { GlossaryTerm } from '@mlf/core/glossary';
import { formatIssues, formatModpackIssues, loadAllBuiltinMods, loadAllModpacks, loadAllMods, type LoadedMod } from '@mlf/core/node';
import { modBannerUrl } from './modBanner';
import { modIconUrl } from './modIcon';
import { type SiteModpack, toSiteModpack } from './modpacks';
import type { ModDownloads, ModSummary } from './summary';

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

/** 工具下載的模組橫幅 */
const BANNER_DIR = resolve(process.cwd(), 'public/mod-banners');

let banners: ReadonlySet<string> | null = null;

function availableBanners(): ReadonlySet<string> {
  banners ??= new Set((existsSync(BANNER_DIR) ? readdirSync(BANNER_DIR) : []).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -'.webp'.length)));
  return banners;
}

let disabledBanners: ReadonlySet<string> | null = null;

/** data/banners-disabled.json 列出的模組不顯示橫幅；檔案不存在視為沒有停用 */
function bannersDisabled(): ReadonlySet<string> {
  if (disabledBanners) return disabledBanners;
  const file = resolve(DATA_DIR, 'banners-disabled.json');
  const raw: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string')) throw new Error('banners-disabled.json 必須是 modId 字串陣列');
  disabledBanners = new Set(raw as string[]);
  return disabledBanners;
}

export function modBanner(modId: string): string | null {
  return modBannerUrl(modId, availableBanners(), bannersDisabled());
}

let stats: ModStats | null = null;

/** 讀取 mod-stats.json；檔案不存在視為沒有資料，格式錯誤則讓建置失敗 */
function modStats(): ModStats | null {
  if (stats) return stats;
  const file = resolve(DATA_DIR, 'mod-stats.json');
  if (!existsSync(file)) return null;
  const parsed = modStatsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`mod-stats.json 格式錯誤：${parsed.error.message}`);
  stats = parsed.data;
  return stats;
}

export function modDownloads(modId: string): ModDownloads | null {
  const entry = modStats()?.mods[modId];
  return entry ? { count: entry.downloads, platform: entry.platform } : null;
}

interface SiteData {
  readonly mods: readonly SiteMod[];
  readonly builtinMods: readonly BuiltinMod[];
  readonly glossary: readonly GlossaryTerm[];
  readonly modpacks: readonly SiteModpack[];
}

let cache: Promise<SiteData> | null = null;

async function load(): Promise<SiteData> {
  const { mods, issues, glossary } = await loadAllMods(DATA_DIR);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length > 0) {
    throw new Error(`翻譯資料驗證失敗：\n${formatIssues(errors, 'data').join('\n')}`);
  }
  const builtin = await loadAllBuiltinMods(DATA_DIR);
  const builtinErrors = builtin.issues.filter((i) => i.level === 'error');
  if (builtinErrors.length > 0) {
    throw new Error(`內建繁中模組資料驗證失敗：\n${formatIssues(builtinErrors, 'data').join('\n')}`);
  }
  modStats(); // 提早驗證，格式錯誤時在載入階段就失敗
  const siteMods = mods.map(toSiteMod);
  const packs = await loadAllModpacks(DATA_DIR, glossary);
  const packErrors = packs.issues.filter((i) => i.level === 'error');
  // 有錯誤的整合包已由 loadAllModpacks 排除、不出現在網站；CI 的 validate:data 會擋下這類資料
  if (packErrors.length > 0) console.warn(`整合包資料有誤，已略過：\n${formatModpackIssues(packErrors, 'data').join('\n')}`);
  return { mods: siteMods, builtinMods: builtin.mods, glossary, modpacks: packs.modpacks.map((p) => toSiteModpack(p, siteMods, builtin.mods)) };
}

function siteData(): Promise<SiteData> {
  cache ??= load();
  return cache;
}

export async function getCatalog(): Promise<readonly SiteMod[]> {
  return (await siteData()).mods;
}

export async function getBuiltinMods(): Promise<readonly BuiltinMod[]> {
  return (await siteData()).builtinMods;
}

export async function getModpacks(): Promise<readonly SiteModpack[]> {
  return (await siteData()).modpacks;
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
    translated: m.stats.translated,
    updatedAt: m.meta.updatedAt,
    icon: modIcon(m.meta.modId),
    banner: modBanner(m.meta.modId),
    downloads: modDownloads(m.meta.modId),
    hasGuide: m.guide !== undefined,
    builtinPercent: m.meta.translation.builtinPercent ?? null,
  };
}

/** 內建繁中條目：沒有翻譯條數，涵蓋率恆為 100 */
export function builtinToSummary(b: BuiltinMod): ModSummary {
  return {
    modId: b.modId,
    name: b.name,
    nameZh: null,
    summary: b.summary,
    mcVersions: b.mcVersions,
    loaders: b.loaders,
    status: 'builtin',
    percent: 100,
    total: 0,
    translated: 0,
    updatedAt: b.updatedAt,
    icon: modIcon(b.modId),
    banner: modBanner(b.modId),
    downloads: modDownloads(b.modId),
    hasGuide: false,
    builtinPercent: 100,
  };
}

/** 一般＋內建條目，供列表、首頁與 index API 共用 */
export async function getAllSummaries(): Promise<ModSummary[]> {
  const [mods, builtin] = await Promise.all([getCatalog(), getBuiltinMods()]);
  return [...mods.map(toSummary), ...builtin.map(builtinToSummary)];
}
