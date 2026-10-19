import { describe, expect, it } from 'vitest';
import { catalogModSchema, groupSourceVersions, toStoredMod, type SourceVersion } from './index';

const base = {
  modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
  mcVersions: ['1.21.1'], loaders: ['forge', 'neoforge', 'fabric'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
  updatedAt: '2026-01-01',
};

const row = (loader: SourceVersion['loader'], patch: Partial<SourceVersion> = {}): SourceVersion => ({
  modVersion: '2.0', mcVersion: '1.21.1', loader, missingKeys: ['a'], ...patch,
});

describe('stored sourceVersions', () => {
  it('expands a row that lists several loaders into one row per loader', () => {
    const meta = catalogModSchema.parse({
      ...base, sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loaders: ['forge', 'fabric'], missingKeys: ['a'] }, row('neoforge')],
    });
    expect(meta.sourceVersions).toEqual([row('forge'), row('fabric'), row('neoforge')]);
  });

  it('rejects an empty or repeated loaders list', () => {
    const parse = (loaders: string[]) =>
      catalogModSchema.safeParse({ ...base, sourceVersions: [{ mcVersion: '1.21.1', loaders, missingKeys: [] }] }).success;
    expect(parse([])).toBe(false);
    expect(parse(['forge', 'forge'])).toBe(false);
  });

  it('rejects a row with both loader and loaders', () => {
    const result = catalogModSchema.safeParse({
      ...base, sourceVersions: [{ mcVersion: '1.21.1', loader: 'forge', loaders: ['fabric'], missingKeys: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('still rejects duplicates after expanding', () => {
    const result = catalogModSchema.safeParse({
      ...base, sourceVersions: [{ modVersion: '2.0', mcVersion: '1.21.1', loaders: ['forge', 'fabric'], missingKeys: [] }, row('fabric')],
    });
    expect(result.success).toBe(false);
  });
});

describe('groupSourceVersions', () => {
  it('merges adjacent rows that differ only by loader', () => {
    expect(groupSourceVersions([row('forge'), row('neoforge'), row('fabric')])).toEqual([
      { modVersion: '2.0', mcVersion: '1.21.1', loaders: ['forge', 'neoforge', 'fabric'], missingKeys: ['a'] },
    ]);
  });

  it('keeps rows apart when version, MC version or missing keys differ, or they are not adjacent', () => {
    const rows = [row('forge'), row('neoforge', { missingKeys: ['b'] }), row('fabric'), row('quilt', { modVersion: '2.1' })];
    expect(groupSourceVersions(rows)).toEqual(rows);
  });

  it('round-trips through the schema', () => {
    const rows = [row('forge', { modVersion: '1.0' }), row('forge'), row('neoforge'), row('fabric', { mcVersion: '1.20.1' })];
    const meta = catalogModSchema.parse({ ...base, mcVersions: ['1.21.1', '1.20.1'], sourceVersions: rows });
    expect(catalogModSchema.parse(toStoredMod(meta)).sourceVersions).toEqual(rows);
    expect(toStoredMod(meta).sourceVersions).toHaveLength(3);
  });
});
