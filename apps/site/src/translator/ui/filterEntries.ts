import { hasWarning } from '@mlf/core/merge';
import type { ModProject, TranslationEntry } from '@mlf/core';

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
}

const STATUS_TESTS: Readonly<Record<StatusFilter, (e: TranslationEntry) => boolean>> = {
  all: () => true,
  untranslated: (e) => e.target === '',
  translated: (e) => e.target !== '',
  warning: hasWarning,
  new: (e) => e.status === 'new',
};

function matchesQuery(e: TranslationEntry, q: string): boolean {
  return q === '' || [e.key, e.source, e.target].some((s) => s.toLowerCase().includes(q));
}

export function filterEntries(mods: readonly ModProject[], opts: FilterOptions): SearchHit[] {
  const q = opts.query.trim().toLowerCase();
  const scoped = opts.scope === 'all' ? mods : mods.filter((m) => m.id === opts.activeModId);
  const test = STATUS_TESTS[opts.status];
  return scoped.flatMap((m) =>
    m.entries
      .filter((e) => e.status !== 'obsolete' && test(e) && matchesQuery(e, q))
      .map((entry) => ({ modId: m.id, entry })),
  );
}
