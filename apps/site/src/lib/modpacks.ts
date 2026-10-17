import type { ProjectStats } from '@mlf/core/merge';
import {
  type CatalogModpack, includedModIds, kubejsProjects, kubejsStats, type ModpackMod, modpackRef, resolveModpackMods, type ResolvedModpackMod,
} from '@mlf/core/modpack';
import type { LoadedModpack } from '@mlf/core/node';
import type { SiteMod } from './data';
import type { IncludedMod, ModpackSummary } from './modpackSummary';

export interface SiteModpack extends LoadedModpack {
  /** 整合包的每個模組＋對照到的 modId */
  readonly resolved: readonly ResolvedModpackMod[];
  readonly included: readonly IncludedMod[];
  readonly missing: readonly ModpackMod[];
  /** KubeJS 進度（各命名空間合計）；沒有 KubeJS 文字時為 null */
  readonly kubejsStats: ProjectStats | null;
}

/** 建置時以 slug 對照已收錄模組並計算 KubeJS 進度 */
export function toSiteModpack(pack: LoadedModpack, catalog: readonly Pick<SiteMod, 'meta' | 'stats'>[]): SiteModpack {
  const resolved = resolveModpackMods(pack.meta.mods, catalog.map((m) => ({ modId: m.meta.modId, links: m.meta.links })));
  const byId = new Map(catalog.map((m) => [m.meta.modId, m]));
  const included = includedModIds(resolved).flatMap((modId): IncludedMod[] => {
    const mod = byId.get(modId);
    return mod ? [{ modId, name: mod.meta.name, nameZh: mod.meta.nameZh ?? null, percent: mod.stats.percent }] : [];
  });
  const missing = resolved.filter((m) => m.modId === null).map(({ modId: _modId, ...rest }): ModpackMod => rest);
  const stats = kubejsStats(kubejsProjects(modpackRef(pack.meta), pack.kubejs, 0));
  return { ...pack, resolved, included, missing, kubejsStats: stats };
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
}

export function toModpackApiBody(p: Pick<SiteModpack, 'meta' | 'resolved' | 'kubejs'>): ModpackApiBody {
  return {
    version: 1,
    meta: p.meta,
    mods: p.resolved,
    kubejs: Object.fromEntries(Object.entries(p.kubejs).map(([ns, texts]) => [ns, { en_us: texts.en, zh_tw: texts.zh }])),
  };
}
