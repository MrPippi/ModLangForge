import { hasGuideWarning, hasWarning } from '@mlf/core/merge';
import type { EntrySection, ModProject, TranslationEntry } from '@mlf/core';

export type StatusFilter = 'all' | 'untranslated' | 'translated' | 'warning' | 'new';
export type SearchScope = 'current' | 'all';

export interface SearchHit {
  readonly modId: string;
  readonly entry: TranslationEntry;
}

export interface FilterOptions {
  readonly scope: SearchScope;
  readonly activeModId: string | null;
  readonly query: string;
  readonly status: StatusFilter;
  /** 語言檔或手冊條目 */
  readonly section: EntrySection;
}

type EntryTest = (e: TranslationEntry) => boolean;

const STATUS_TESTS: Readonly<Record<Exclude<StatusFilter, 'warning'>, EntryTest>> = {
  all: () => true,
  untranslated: (e) => e.target === '',
  translated: (e) => e.target !== '',
  new: (e) => e.status === 'new',
};

function statusTest(status: StatusFilter, section: EntrySection): EntryTest {
  if (status === 'warning') return section === 'guide' ? hasGuideWarning : hasWarning;
  return STATUS_TESTS[status];
}

/** 沒有手冊的專案（含 IndexedDB 舊資料）在手冊區塊沒有條目 */
function sectionEntries(m: ModProject, section: EntrySection): readonly TranslationEntry[] {
  return section === 'guide' ? (m.guide?.entries ?? []) : m.entries;
}

function matchesQuery(e: TranslationEntry, q: string): boolean {
  return q === '' || [e.key, e.source, e.target].some((s) => s.toLowerCase().includes(q));
}

export function filterEntries(mods: readonly ModProject[], opts: FilterOptions): SearchHit[] {
  const q = opts.query.trim().toLowerCase();
  const scoped = opts.scope === 'all' ? mods : mods.filter((m) => m.id === opts.activeModId);
  const test = statusTest(opts.status, opts.section);
  return scoped.flatMap((m) =>
    sectionEntries(m, opts.section)
      .filter((e) => e.status !== 'obsolete' && test(e) && matchesQuery(e, q))
      .map((entry) => ({ modId: m.id, entry })),
  );
}
