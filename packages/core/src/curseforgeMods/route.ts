import { decideLink } from '../curseforgeLinks/match';
import { CURSEFORGE_MOD_CLASS } from '../modpackImport/curseforge';
import type { CurseforgeProject } from './project';

export type CurseforgeRoute = 'exists' | 'modrinth' | 'curseforge';

export interface RouteInput {
  readonly project: CurseforgeProject;
  /** 所有 mod.json／內建條目 links.curseforge 已有的 slug */
  readonly existingCurseforgeSlugs: ReadonlySet<string>;
  /** 以 CurseForge slug 在 Modrinth 查到的專案；沒有時為 null */
  readonly modrinth: { readonly slug: string; readonly title: string; readonly authors: readonly string[] } | null;
}

/**
 * 決定排行榜上的一個 CurseForge 模組怎麼處理：
 * - exists：slug 已被收錄，直接略過
 * - modrinth：Modrinth 上有確定相符的專案（沿用 curseforgeLinks 的比對規則），以 Modrinth 為準
 * - curseforge：Modrinth 上沒有（或不確定是同一個模組），從 CurseForge 收錄
 */
export function routeCurseforgeHit({ project, existingCurseforgeSlugs, modrinth }: RouteInput): CurseforgeRoute {
  if (existingCurseforgeSlugs.has(project.slug)) return 'exists';
  if (modrinth === null) return 'curseforge';
  const candidate = { id: project.id, name: project.name, slug: project.slug, classId: CURSEFORGE_MOD_CLASS, authors: project.authors.map((name) => ({ name })) };
  const target = { slug: modrinth.slug, name: modrinth.title, authors: modrinth.authors };
  return decideLink(target, [candidate], [candidate]).kind === 'matched' ? 'modrinth' : 'curseforge';
}
