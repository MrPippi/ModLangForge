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
const NON_LETTER_DIGIT = /[^\p{L}\p{N}]/gu;

/** 轉小寫、移除非字母／數字字元（保留括號內文字，讓 CurseForge 的 fork、變體名稱不會誤判為相同） */
export function normalizeModName(name: string): string {
  return name.toLowerCase().replace(NON_LETTER_DIGIT, '');
}

/** 我們目錄中的模組名稱：另外去除括號內文字（如 "Roughly Enough Items (REI)"） */
export function normalizeCatalogName(name: string): string {
  return normalizeModName(name.replace(BRACKETED, ''));
}

/** 與 4b 對照規則（resolve.ts）相同的 CurseForge 模組頁網址 */
export function curseforgeModUrl(slug: string): string {
  return platformModUrl({ platform: 'curseforge', slug });
}

/** 我們的目錄名稱（已去括號）與 CurseForge 名稱正規化後必須完全相同且非空 */
function sameName(catalogName: string, cfName: string): boolean {
  const key = normalizeCatalogName(catalogName);
  return key !== '' && key === normalizeModName(cfName);
}

function isMod(m: CurseforgeMod): boolean {
  return m.classId === CURSEFORGE_MOD_CLASS;
}

function sameSlug(m: CurseforgeMod, slug: string | null): boolean {
  return slug !== null && m.slug.toLowerCase() === slug.toLowerCase();
}

/** 規則 1：slug 完全相同（不分大小寫）且名稱正規化後相同 */
export function matchBySlug(target: LinkTarget, results: readonly CurseforgeMod[]): CurseforgeMod | undefined {
  return results.find((m) => isMod(m) && sameSlug(m, target.slug) && sameName(target.name, m.name));
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
  const named = byName.filter((m) => isMod(m) && sameName(target.name, m.name));
  const only = named.length === 1 ? named[0] : undefined;
  if (only) return matched('name', only);
  const slugOnly = bySlug.filter((m) => isMod(m) && sameSlug(m, target.slug));
  const reason: ReviewReason = named.length > 1 ? 'ambiguous' : slugOnly.length > 0 ? 'name-mismatch' : 'none';
  const pool = named.length > 0 ? named : byName.filter(isMod);
  return { kind: 'review', reason, candidates: candidatesOf([...slugOnly, ...pool]) };
}
