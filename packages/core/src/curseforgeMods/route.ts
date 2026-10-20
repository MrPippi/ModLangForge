import { decideLink, normalizeModName } from '../curseforgeLinks/match';
import { CURSEFORGE_MOD_CLASS } from '../modpackImport/curseforge';
import type { CurseforgeProject } from './project';

export type CurseforgeRoute = 'exists' | 'modrinth' | 'curseforge' | 'review';

export interface ModrinthCandidate {
  readonly slug: string;
  readonly title: string;
  readonly authors: readonly string[];
}

export interface RouteInput {
  readonly project: CurseforgeProject;
  /** 所有 mod.json／內建條目 links.curseforge 已有的 slug */
  readonly existingCurseforgeSlugs: ReadonlySet<string>;
  /** 在 Modrinth 找到的可能對應專案（先以相同 slug 查，查不到再以名稱搜尋）；沒有時為 null */
  readonly modrinth: ModrinthCandidate | null;
}

const authorKey = (name: string): string => name.trim().toLowerCase();

function sharesAuthor(a: readonly string[], b: readonly string[]): boolean {
  const ours = new Set(a.map(authorKey).filter((k) => k !== ''));
  return b.some((name) => ours.has(authorKey(name)));
}

function isSameMod(project: CurseforgeProject, modrinth: ModrinthCandidate): boolean {
  const overlap = sharesAuthor(project.authors, modrinth.authors);
  // slug 相同且作者相同：CurseForge 名稱常帶 Fabric／Forge 等標示，不比對名稱
  if (overlap && project.slug.toLowerCase() === modrinth.slug.toLowerCase()) return true;
  // 名稱（去除符號後）相同且作者有交集
  if (overlap && normalizeModName(project.name) === normalizeModName(modrinth.title)) return true;
  const candidate = { id: project.id, name: project.name, slug: project.slug, classId: CURSEFORGE_MOD_CLASS, authors: project.authors.map((name) => ({ name })) };
  const target = { slug: modrinth.slug, name: modrinth.title, authors: modrinth.authors };
  return decideLink(target, [candidate], [candidate]).kind === 'matched';
}

/**
 * 決定排行榜上的一個 CurseForge 模組怎麼處理：
 * - exists：slug 已被收錄，直接略過
 * - modrinth：Modrinth 上有確定相符的專案，以 Modrinth 為準
 * - review：Modrinth 上有可能是同一個模組的專案但無法確定，略過並請人工確認（不可當成 CurseForge 專有模組收錄）
 * - curseforge：Modrinth 上找不到任何候選，從 CurseForge 收錄
 */
export function routeCurseforgeHit({ project, existingCurseforgeSlugs, modrinth }: RouteInput): CurseforgeRoute {
  if (existingCurseforgeSlugs.has(project.slug)) return 'exists';
  if (modrinth === null) return 'curseforge';
  return isSameMod(project, modrinth) ? 'modrinth' : 'review';
}
