import { z } from 'zod';
import { modrinthSlug } from '../pipeline/modrinth';
import { type ModpackMod, modpackModSchema, type ModpackPlatform } from './schema';

const CURSEFORGE_MOD_URL = /^https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)\/?$/;

export function curseforgeSlug(url: string | undefined): string | null {
  return url?.match(CURSEFORGE_MOD_URL)?.[1] ?? null;
}

/** 平台上的模組頁 */
export function platformModUrl(m: Pick<ModpackMod, 'platform' | 'slug'>): string {
  const slug = encodeURIComponent(m.slug);
  return m.platform === 'modrinth' ? `https://modrinth.com/mod/${slug}` : `https://www.curseforge.com/minecraft/mc-mods/${slug}`;
}

/** 平台上的整合包頁 */
export function platformModpackUrl(platform: ModpackPlatform, slug: string): string {
  const encoded = encodeURIComponent(slug);
  return platform === 'modrinth' ? `https://modrinth.com/modpack/${encoded}` : `https://www.curseforge.com/minecraft/modpacks/${encoded}`;
}

/** 對照用的模組資料（mod.json 的 modId 與 links） */
export interface CatalogModLinks {
  readonly modId: string;
  readonly links: { readonly modrinth?: string; readonly curseforge?: string };
}

export const resolvedModpackModSchema = modpackModSchema.extend({ modId: z.string().nullable() });

/** 整合包使用的模組＋對照到的本站 modId（未收錄為 null） */
export type ResolvedModpackMod = z.infer<typeof resolvedModpackModSchema>;

const SLUG_OF: Readonly<Record<ModpackPlatform, (links: CatalogModLinks['links']) => string | null>> = {
  modrinth: (links) => modrinthSlug(links.modrinth),
  curseforge: (links) => curseforgeSlug(links.curseforge),
};

function slugIndex(catalog: readonly CatalogModLinks[], platform: ModpackPlatform): ReadonlyMap<string, string> {
  const sorted = [...catalog].sort((a, b) => (a.modId < b.modId ? -1 : a.modId > b.modId ? 1 : 0));
  const index = new Map<string, string>();
  for (const mod of sorted) {
    const slug = SLUG_OF[platform](mod.links)?.toLowerCase();
    if (slug && !index.has(slug)) index.set(slug, mod.modId);
  }
  return index;
}

/**
 * 以平台 slug 對照已收錄模組。slug 不分大小寫；不跨平台對照；
 * 多個模組連到同一 slug 時取 modId 排序最前者，結果固定。
 */
export function resolveModpackMods(mods: readonly ModpackMod[], catalog: readonly CatalogModLinks[]): ResolvedModpackMod[] {
  const indexes: Readonly<Record<ModpackPlatform, ReadonlyMap<string, string>>> = {
    modrinth: slugIndex(catalog, 'modrinth'),
    curseforge: slugIndex(catalog, 'curseforge'),
  };
  return mods.map((m) => ({ ...m, modId: indexes[m.platform].get(m.slug.toLowerCase()) ?? null }));
}

/** 已對上的 modId（去除重複，保留整合包中的順序） */
export function includedModIds(resolved: readonly ResolvedModpackMod[]): string[] {
  return [...new Set(resolved.flatMap((m) => (m.modId === null ? [] : [m.modId])))];
}
