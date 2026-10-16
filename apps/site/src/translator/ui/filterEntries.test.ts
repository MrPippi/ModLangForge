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
  const base = { scope: 'current' as const, activeModId: 'alpha', query: '', status: 'all' as const, section: 'lang' as const };

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

const GUIDE_FILES = {
  'guide/en_us/entries/a.json': JSON.stringify({ name: 'Guide Apple', pages: [{ type: 'patchouli:text', text: 'Use $(item)it$()' }] }),
};
const gamma = updateEntry(
  buildProject({ ...d('gamma', { g: 'Gamma' }), guide: { files: GUIDE_FILES, skipped: [] } }, 1),
  'guide/entries/a.json#pages/0/text', '使用', 2, 'guide',
);
const guideKeys = (opts: Parameters<typeof filterEntries>[1]) => filterEntries([alpha, gamma], opts).map((h) => `${h.modId}:${h.entry.key}`);

describe('filterEntries guide section', () => {
  const base = { scope: 'current' as const, activeModId: 'gamma', query: '', status: 'all' as const, section: 'guide' as const };

  it('lists guide entries of the active mod and keeps lang entries in the lang section', () => {
    expect(guideKeys(base)).toEqual(['gamma:guide/entries/a.json#name', 'gamma:guide/entries/a.json#pages/0/text']);
    expect(guideKeys({ ...base, section: 'lang' })).toEqual(['gamma:g']);
  });

  it('uses Patchouli format checks for the warning filter and searches guide text', () => {
    expect(guideKeys({ ...base, status: 'warning' })).toEqual(['gamma:guide/entries/a.json#pages/0/text']);
    expect(guideKeys({ ...base, query: 'guide apple' })).toEqual(['gamma:guide/entries/a.json#name']);
  });

  it('returns nothing for projects without a guide (e.g. restored from older IndexedDB data)', () => {
    expect(guideKeys({ ...base, activeModId: 'alpha' })).toEqual([]);
    expect(guideKeys({ ...base, scope: 'all' })).toEqual(['gamma:guide/entries/a.json#name', 'gamma:guide/entries/a.json#pages/0/text']);
  });

  it('returns nothing for a guide whose entries are all obsolete', () => {
    const stale = { ...gamma, guide: { ...gamma.guide!, entries: gamma.guide!.entries.map((e) => ({ ...e, status: 'obsolete' as const })) } };
    expect(filterEntries([stale], base)).toEqual([]);
  });
});
