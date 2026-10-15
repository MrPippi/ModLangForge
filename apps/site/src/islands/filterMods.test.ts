import { describe, expect, it } from 'vitest';
import type { ModSummary } from '../lib/summary';
import { ALL, filterMods, sortMods } from './filterMods';

const mod = (modId: string, over: Partial<ModSummary> = {}): ModSummary => ({
  modId, name: modId, nameZh: null, summary: '', mcVersions: ['1.20.1'], loaders: ['forge'],
  status: 'partial', percent: 50, total: 2, updatedAt: '2026-10-01', ...over,
});

const NONE = { loader: ALL, version: ALL, status: ALL };

describe('filterMods', () => {
  const mods = [
    mod('alpha', { loaders: ['fabric'], status: 'reviewed' }),
    mod('beta', { mcVersions: ['1.21.1', '1.20.1'] }),
    mod('gamma', { mcVersions: ['1.12.2'], status: 'machine' }),
  ];

  it('returns all mods with no filter', () => {
    expect(filterMods(mods, NONE).map((m) => m.modId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('filters by loader and version', () => {
    expect(filterMods(mods, { ...NONE, loader: 'forge' }).map((m) => m.modId)).toEqual(['beta', 'gamma']);
    expect(filterMods(mods, { ...NONE, loader: 'forge', version: '1.20.1' }).map((m) => m.modId)).toEqual(['beta']);
  });

  it('filters by status', () => {
    expect(filterMods(mods, { ...NONE, status: 'machine' }).map((m) => m.modId)).toEqual(['gamma']);
  });
});

describe('sortMods', () => {
  const mods = [
    mod('beta', { percent: 80, updatedAt: '2026-10-03' }),
    mod('alpha', { percent: 80, updatedAt: '2026-10-01' }),
    mod('gamma', { percent: 100, updatedAt: '2026-10-02' }),
  ];

  it('sorts by name', () => {
    expect(sortMods(mods, 'name').map((m) => m.modId)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('sorts by most recently updated', () => {
    expect(sortMods(mods, 'updated').map((m) => m.modId)).toEqual(['beta', 'gamma', 'alpha']);
  });

  it('sorts by percent descending, ties by name', () => {
    expect(sortMods(mods, 'percent').map((m) => m.modId)).toEqual(['gamma', 'alpha', 'beta']);
  });

  it('does not mutate the input', () => {
    const before = mods.map((m) => m.modId);
    sortMods(mods, 'name');
    expect(mods.map((m) => m.modId)).toEqual(before);
  });
});
