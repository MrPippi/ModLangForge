import { type QuestApiBody, questStats } from '@mlf/core/ftbquests';
import type { ProjectStats } from '@mlf/core/merge';
import {
  type CatalogModpack, includedModIds, kubejsProjects, kubejsStats, type ModpackMod, modpackRef, resolveModpackMods, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import type { LoadedModpack } from '@mlf/core/node';
import type { SiteMod } from './data';
import type { IncludedMod, ModpackSummary, QuestSummary } from './modpackSummary';

export interface SiteModpack extends LoadedModpack {
  /** 整合包的每個模組＋對照到的 modId */
  readonly resolved: readonly ResolvedModpackMod[];
  readonly included: readonly IncludedMod[];
  readonly missing: readonly ModpackMod[];
  /** KubeJS 進度（各命名空間合計）；沒有 KubeJS 文字時為 null */
  readonly kubejsStats: ProjectStats | null;
  /** FTB 任務進度；沒有 supported 任務文字時為 null */
  readonly questStats: ProjectStats | null;
}

/** 建置時以 slug 對照已收錄模組並計算 KubeJS 與 FTB 任務進度 */
export function toSiteModpack(pack: LoadedModpack, catalog: readonly Pick<SiteMod, 'meta' | 'stats'>[]): SiteModpack {
  const resolved = resolveModpackMods(pack.meta.mods, catalog.map((m) => ({ modId: m.meta.modId, links: m.meta.links })));
  const byId = new Map(catalog.map((m) => [m.meta.modId, m]));
  const included = includedModIds(resolved).flatMap((modId): IncludedMod[] => {
    const mod = byId.get(modId);
    return mod ? [{ modId, name: mod.meta.name, nameZh: mod.meta.nameZh ?? null, percent: mod.stats.percent }] : [];
  });
  const missing = resolved.filter((m) => m.modId === null).map(({ modId: _modId, ...rest }): ModpackMod => rest);
  const ref = modpackRef(pack.meta);
  const stats = kubejsStats(kubejsProjects(ref, pack.kubejs, 0));
  const quests = pack.quests ? questStats(ref, pack.quests) : null;
  return { ...pack, resolved, included, missing, kubejsStats: stats, questStats: quests };
}

function questSummary(p: Pick<SiteModpack, 'meta' | 'questStats'>): QuestSummary | null {
  const status = p.meta.ftbquests?.status;
  if (status === 'unsupported-version') return { status };
  if (status === 'supported' && p.questStats) {
    const { total, translated, percent } = p.questStats;
    return { status, total, translated, percent };
  }
  return null;
}

export function toModpackSummary(p: SiteModpack): ModpackSummary {
  const { meta, kubejsStats: stats } = p;
  return {
    id: meta.id,
    name: meta.name,
    nameZh: meta.nameZh ?? null,
    summary: meta.summary,
    mcVersion: meta.source.mcVersion,
    loader: meta.source.loader,
    status: meta.translation.status,
    includedMods: p.resolved.filter((m) => m.modId !== null).length,
    totalMods: meta.mods.length,
    kubejs: stats ? { total: stats.total, translated: stats.translated, percent: stats.percent } : null,
    ftbquests: questSummary(p),
    updatedAt: meta.updatedAt,
  };
}

export function byModpackName(a: ModpackSummary, b: ModpackSummary): number {
  return a.name.localeCompare(b.name);
}

/** /api/v1/modpacks/<id>.json 的內容 */
export interface ModpackApiBody {
  readonly version: 1;
  readonly meta: CatalogModpack;
  readonly mods: readonly ResolvedModpackMod[];
  readonly kubejs: Readonly<Record<string, { readonly en_us: Readonly<Record<string, string>>; readonly zh_tw: Readonly<Record<string, string>> }>>;
  /** FTB 任務；整合包沒有任務檔時省略 */
  readonly ftbquests?: QuestApiBody;
}

function questApi(p: Pick<SiteModpack, 'meta' | 'quests'>): { readonly ftbquests?: QuestApiBody } {
  const meta = p.meta.ftbquests;
  if (meta?.status === 'unsupported-version') return { ftbquests: { status: meta.status } };
  if (meta?.status === 'supported' && p.quests) {
    return { ftbquests: { status: meta.status, layout: p.quests.layout, en_us: p.quests.en, zh_tw: p.quests.zh } };
  }
  return {};
}

export function toModpackApiBody(p: Pick<SiteModpack, 'meta' | 'resolved' | 'kubejs' | 'quests'>): ModpackApiBody {
  return {
    version: 1,
    meta: p.meta,
    mods: p.resolved,
    kubejs: Object.fromEntries(Object.entries(p.kubejs).map(([ns, texts]) => [ns, { en_us: texts.en, zh_tw: texts.zh }])),
    ...questApi(p),
  };
}
