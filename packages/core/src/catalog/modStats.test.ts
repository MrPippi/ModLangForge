import { describe, expect, it } from 'vitest';
import { checkModStats, mergeModStats } from './modStats';

describe('modStats', () => {
  const ok = { version: 1, mods: { create: { downloads: 98400000, fetchedAt: '2026-10-17' } } };
  it('accepts valid data for known mods', () => expect(checkModStats(ok, new Set(['create']))).toEqual([]));
  it('rejects unknown modIds', () => expect(checkModStats(ok, new Set(['jei']))[0]).toContain('create'));
  it('rejects negative or fractional downloads', () => {
    expect(checkModStats({ version: 1, mods: { create: { downloads: -1, fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
    expect(checkModStats({ version: 1, mods: { create: { downloads: 1.5, fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
  });
  it('merges new numbers and keeps mods that were not fetched', () => {
    const prev = { version: 1 as const, mods: { create: { downloads: 1, fetchedAt: '2026-10-10' }, jei: { downloads: 2, fetchedAt: '2026-10-10' } } };
    const next = mergeModStats(prev, { create: 5 }, new Set(['create', 'jei']), '2026-10-17');
    expect(next.mods).toEqual({ create: { downloads: 5, fetchedAt: '2026-10-17' }, jei: { downloads: 2, fetchedAt: '2026-10-10' } });
    expect(prev.mods.create.downloads).toBe(1);
  });
  it('drops old values of mods that no longer have a Modrinth link or were removed', () => {
    const prev = { version: 1 as const, mods: { create: { downloads: 1, fetchedAt: '2026-10-10' }, jei: { downloads: 2, fetchedAt: '2026-10-10' }, gone: { downloads: 3, fetchedAt: '2026-10-10' } } };
    const next = mergeModStats(prev, {}, new Set(['create']), '2026-10-17');
    expect(Object.keys(next.mods)).toEqual(['create']);
    expect(Object.keys(prev.mods)).toHaveLength(3);
  });
  it('sorts mod keys so the file diff stays stable', () => {
    expect(Object.keys(mergeModStats({ version: 1, mods: {} }, { zeta: 1, alpha: 2 }, new Set(['zeta', 'alpha']), '2026-10-17').mods)).toEqual(['alpha', 'zeta']);
  });
});
