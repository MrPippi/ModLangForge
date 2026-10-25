import type { SiteChangelogEntry, TranslationDay } from '@mlf/core/changelog';

export interface ModRef {
  readonly modId: string;
  readonly name: string;
  /** 已不在網站上的模組沒有連結 */
  readonly href: string | null;
}

export interface TranslationSummary {
  readonly added: readonly ModRef[];
  readonly removed: readonly ModRef[];
  readonly translated: readonly ModRef[];
  /** 依 Minecraft 版本（由新到舊）列出新支援的模組 */
  readonly newMc: readonly { readonly mcVersion: string; readonly mods: readonly ModRef[] }[];
  readonly updated: readonly ModRef[];
}

export interface ChangelogDay {
  readonly date: string;
  readonly site: readonly SiteChangelogEntry[];
  readonly translation: TranslationSummary | null;
}

/** 數字逐段比較，較新的版本排前面 */
export function compareMcDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function byName(a: ModRef, b: ModRef): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

function summarize(day: TranslationDay, ref: (modId: string) => ModRef): TranslationSummary {
  const refs = (ids: readonly string[]) => ids.map(ref).sort(byName);
  const versions = new Map<string, string[]>();
  for (const { modId, mcVersions } of day.newMc) for (const v of mcVersions) versions.set(v, [...(versions.get(v) ?? []), modId]);
  return {
    added: refs(day.added),
    removed: refs(day.removed),
    translated: refs(day.translated),
    newMc: [...versions.entries()].sort(([a], [b]) => compareMcDesc(a, b)).map(([mcVersion, ids]) => ({ mcVersion, mods: refs(ids) })),
    updated: refs(day.updated),
  };
}

/** 把網站功能與翻譯更新依日期合併，由新到舊；names 是目前網站上有的模組（含內建繁中條目） */
export function buildChangelog(
  site: readonly SiteChangelogEntry[],
  translations: readonly TranslationDay[],
  names: ReadonlyMap<string, string>,
): ChangelogDay[] {
  const ref = (modId: string): ModRef => {
    const name = names.get(modId);
    return name === undefined ? { modId, name: modId, href: null } : { modId, name, href: `/mods/${modId}/` };
  };
  const dates = [...new Set([...site.map((e) => e.date), ...translations.map((d) => d.date)])].sort().reverse();
  return dates.map((date) => {
    const day = translations.find((d) => d.date === date);
    return { date, site: site.filter((e) => e.date === date), translation: day ? summarize(day, ref) : null };
  });
}

/** 2026-10-25 → 2026 年 10 月 25 日 */
export function formatChangelogDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}
