import { describe, expect, it } from 'vitest';
import { buildProject, mergeProject, updateEntry } from '@mlf/core/merge';
import type { DetectedMod } from '@mlf/core';
import { filterEntries } from './filterEntries';

const d = (modId: string, source: Record<string, string>): DetectedMod => ({
  modId, name: modId, version: '1', jarName: `${modId}.jar`, format: 'json', source, order: Object.keys(source),
});

let alpha = buildProject(d('alpha', { a: 'Apple %s', b: 'Banana', c: 'Cherry' }), 1);
alpha = updateEntry(alpha, 'a', '蘋果', 2);
alpha = updateEntry(alpha, 'b', '香蕉', 2);
alpha = mergeProject(alpha, d('alpha', { a: 'Apple %s', b: 'Banana', c: 'Cherry', n: 'New' }), 3);
const beta = updateEntry(buildProject(d('beta', { x: 'Banana bread', gone: 'Old' }), 1), 'x', '香蕉麵包', 2);
const betaMerged = mergeProject(beta, d('beta', { x: 'Banana bread' }), 3);
const mods = [alpha, betaMerged];

const keys = (opts: Parameters<typeof filterEntries>[1]) => filterEntries(mods, opts).map((h) => `${h.modId}:${h.entry.key}`);

describe('filterEntries', () => {
  const base = { scope: 'current' as const, activeModId: 'alpha', query: '', status: 'all' as const };

  it('returns active mod entries in order', () => {
    expect(keys(base)).toEqual(['alpha:a', 'alpha:b', 'alpha:c', 'alpha:n']);
  });

  it('filters by status', () => {
    expect(keys({ ...base, status: 'untranslated' })).toEqual(['alpha:c', 'alpha:n']);
    expect(keys({ ...base, status: 'translated' })).toEqual(['alpha:a', 'alpha:b']);
    expect(keys({ ...base, status: 'new' })).toEqual(['alpha:n']);
    expect(keys({ ...base, status: 'warning' })).toEqual(['alpha:a']);
  });

  it('matches key, source and target case-insensitively', () => {
    expect(keys({ ...base, query: 'BANANA' })).toEqual(['alpha:b']);
    expect(keys({ ...base, query: '蘋果' })).toEqual(['alpha:a']);
    expect(keys({ ...base, query: 'n' })).toContain('alpha:n');
  });

  it('searches across all mods and excludes obsolete entries', () => {
    expect(keys({ ...base, scope: 'all', query: 'banana' })).toEqual(['alpha:b', 'beta:x']);
    expect(keys({ ...base, scope: 'all', query: 'old' })).toEqual([]);
  });

  it('returns nothing when no active mod in current scope', () => {
    expect(keys({ ...base, activeModId: null })).toEqual([]);
  });
});
