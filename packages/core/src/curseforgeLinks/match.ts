import { platformModUrl } from '../modpack/resolve';
import { CURSEFORGE_MOD_CLASS, type CurseforgeMod } from '../modpackImport/curseforge';

/** 比對依據：Modrinth slug（沒有 Modrinth 連結時為 null）與 mod.json 的英文名稱 */
export interface LinkTarget {
  readonly slug: string | null;
  readonly name: string;
}

export interface LinkCandidate {
  readonly name: string;
  readonly slug: string;
  readonly url: string;
}

/** none＝沒有同名結果；ambiguous＝多個同名；name-mismatch＝只有 slug 相同但名稱不同 */
export type ReviewReason = 'none' | 'ambiguous' | 'name-mismatch';

export type LinkMatch =
  | { readonly kind: 'matched'; readonly via: 'slug' | 'name'; readonly slug: string; readonly url: string }
  | { readonly kind: 'review'; readonly reason: ReviewReason; readonly candidates: readonly LinkCandidate[] };

export const MAX_CANDIDATES = 5;
const BRACKETED = /\([^)]*\)/g;
const NON_ALNUM = /[^a-z0-9]/g;

/** 轉小寫、去除括號內文字、移除非字母數字字元 */
export function normalizeModName(name: string): string {
  return name.toLowerCase().replace(BRACKETED, '').replace(NON_ALNUM, '');
}

/** 與 4b 對照規則（resolve.ts）相同的 CurseForge 模組頁網址 */
export function curseforgeModUrl(slug: string): string {
  return platformModUrl({ platform: 'curseforge', slug });
}

function sameName(a: string, b: string): boolean {
  const n = normalizeModName(a);
  return n !== '' && n === normalizeModName(b);
}

function isMod(m: CurseforgeMod): boolean {
  return m.classId === CURSEFORGE_MOD_CLASS;
}

function sameSlug(m: CurseforgeMod, slug: string | null): boolean {
  return slug !== null && m.slug.toLowerCase() === slug.toLowerCase();
}

/** 規則 1：slug 完全相同（不分大小寫）且名稱正規化後相同 */
export function matchBySlug(target: LinkTarget, results: readonly CurseforgeMod[]): CurseforgeMod | undefined {
  return results.find((m) => isMod(m) && sameSlug(m, target.slug) && sameName(m.name, target.name));
}

function candidatesOf(list: readonly CurseforgeMod[]): LinkCandidate[] {
  const unique = [...new Map(list.map((m) => [m.id, m])).values()];
  return unique.slice(0, MAX_CANDIDATES).map((m) => ({ name: m.name, slug: m.slug, url: curseforgeModUrl(m.slug) }));
}

function matched(via: 'slug' | 'name', m: CurseforgeMod): LinkMatch {
  return { kind: 'matched', via, slug: m.slug, url: curseforgeModUrl(m.slug) };
}

/** 規則 1 → 規則 2（名稱正規化後完全相同的結果恰好一個）→ 其餘列為需要人工確認，附上候選 */
export function decideLink(target: LinkTarget, bySlug: readonly CurseforgeMod[], byName: readonly CurseforgeMod[]): LinkMatch {
  const slugHit = matchBySlug(target, bySlug);
  if (slugHit) return matched('slug', slugHit);
  const named = byName.filter((m) => isMod(m) && sameName(m.name, target.name));
  const only = named.length === 1 ? named[0] : undefined;
  if (only) return matched('name', only);
  const slugOnly = bySlug.filter((m) => isMod(m) && sameSlug(m, target.slug));
  const reason: ReviewReason = named.length > 1 ? 'ambiguous' : slugOnly.length > 0 ? 'name-mismatch' : 'none';
  const pool = named.length > 0 ? named : byName.filter(isMod);
  return { kind: 'review', reason, candidates: candidatesOf([...slugOnly, ...pool]) };
}
