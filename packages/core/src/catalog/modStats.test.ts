import { describe, expect, it } from 'vitest';
import { checkModStats, findDownloadDrops, mergeModStats, modStatsSchema, renderDownloadDrops } from './modStats';

describe('modStats', () => {
  const ok = { version: 2, mods: { create: { downloads: 98400000, platform: 'modrinth', fetchedAt: '2026-10-17' } } };
  it('accepts valid data for known mods', () => expect(checkModStats(ok, new Set(['create']))).toEqual([]));
  it('rejects unknown modIds', () => expect(checkModStats(ok, new Set(['jei']))[0]).toContain('create'));
  it('rejects negative or fractional downloads', () => {
    expect(checkModStats({ version: 2, mods: { create: { downloads: -1, platform: 'modrinth', fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
    expect(checkModStats({ version: 2, mods: { create: { downloads: 1.5, platform: 'modrinth', fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
  });
  it('rejects version 1 files and unknown platforms', () => {
    expect(modStatsSchema.safeParse({ version: 1, mods: {} }).success).toBe(false);
    expect(checkModStats({ version: 2, mods: { create: { downloads: 1, platform: 'github', fetchedAt: '2026-10-17' } } }, new Set(['create']))).not.toEqual([]);
  });
  it('merges new numbers and keeps mods that were not fetched', () => {
    const prev = { version: 2 as const, mods: { create: { downloads: 1, platform: 'modrinth' as const, fetchedAt: '2026-10-10' }, jei: { downloads: 2, platform: 'modrinth' as const, fetchedAt: '2026-10-10' } } };
    const next = mergeModStats(prev, { create: { downloads: 5, platform: 'modrinth' } }, new Set(['create', 'jei']), '2026-10-17');
    expect(next.mods).toEqual({ create: { downloads: 5, platform: 'modrinth', fetchedAt: '2026-10-17' }, jei: { downloads: 2, platform: 'modrinth', fetchedAt: '2026-10-10' } });
    expect(prev.mods.create.downloads).toBe(1);
  });
  it('writes the platform of each fetched number', () => {
    const next = mergeModStats({ version: 2, mods: {} }, { ae2: { downloads: 9, platform: 'curseforge' } }, new Set(['ae2']), '2026-10-17');
    expect(next.mods.ae2).toEqual({ downloads: 9, platform: 'curseforge', fetchedAt: '2026-10-17' });
  });
  it('drops old values of mods that are no longer tracked or were removed', () => {
    const prev = { version: 2 as const, mods: { create: { downloads: 1, platform: 'modrinth' as const, fetchedAt: '2026-10-10' }, jei: { downloads: 2, platform: 'modrinth' as const, fetchedAt: '2026-10-10' }, gone: { downloads: 3, platform: 'modrinth' as const, fetchedAt: '2026-10-10' } } };
    const next = mergeModStats(prev, {}, new Set(['create']), '2026-10-17');
    expect(Object.keys(next.mods)).toEqual(['create']);
    expect(Object.keys(prev.mods)).toHaveLength(3);
  });
  it('sorts mod keys so the file diff stays stable', () => {
    const fetched = { zeta: { downloads: 1, platform: 'modrinth' as const }, alpha: { downloads: 2, platform: 'curseforge' as const } };
    expect(Object.keys(mergeModStats({ version: 2, mods: {} }, fetched, new Set(['zeta', 'alpha']), '2026-10-17').mods)).toEqual(['alpha', 'zeta']);
  });
});

describe('findDownloadDrops', () => {
  const at = (downloads: number) => ({ downloads, platform: 'modrinth' as const, fetchedAt: '2026-10-10' });
  const prev = { version: 2 as const, mods: { a: at(1000), b: at(1000), c: at(1000) } };

  it('lists mods whose count went down, biggest relative drop first', () => {
    const fetched = { a: { downloads: 990, platform: 'modrinth' as const }, b: { downloads: 500, platform: 'modrinth' as const }, c: { downloads: 1200, platform: 'modrinth' as const } };
    expect(findDownloadDrops(prev, fetched)).toEqual([
      { modId: 'b', before: 1000, after: 500 },
      { modId: 'a', before: 1000, after: 990 },
    ]);
  });

  it('ignores new mods and mods whose platform changed', () => {
    const fetched = { a: { downloads: 10, platform: 'curseforge' as const }, d: { downloads: 1, platform: 'modrinth' as const } };
    expect(findDownloadDrops(prev, fetched)).toEqual([]);
  });
});

describe('renderDownloadDrops', () => {
  it('is empty when nothing dropped', () => expect(renderDownloadDrops([])).toBe(''));

  it('lists the biggest drops and counts the rest', () => {
    const drops = Array.from({ length: 12 }, (_, i) => ({ modId: `m${i}`, before: 1000000, after: 900000 + i }));
    const md = renderDownloadDrops(drops, 10);
    expect(md).toContain('## 下載量下降');
    expect(md).toContain('12 個模組');
    expect(md).toContain('- m0：1,000,000 → 900,000（-10.0%）');
    expect(md).not.toContain('- m10：');
    expect(md).toContain('其餘 2 個');
  });
});
