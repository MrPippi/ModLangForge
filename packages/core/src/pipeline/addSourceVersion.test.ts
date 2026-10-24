import { describe, expect, it } from 'vitest';
import { catalogModSchema, type SourceVersion } from '../catalog/schema';
import {
  addSourceVersion, DuplicateSourceVersionError, migrateMeta, modrinthSlug, pickVersionFor, resolveSourceRef, withSourceVersions,
  type ModrinthVersion,
} from './index';

const v121: SourceVersion = { modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] };
const current = Object.freeze({
  en: Object.freeze({ a: 'Apple', b: 'Banana %s' }),
  sourceVersions: Object.freeze([Object.freeze(v121)]),
});
const ref120 = { modVersion: '1.5', mcVersion: '1.20.1', loader: 'forge' } as const;

describe('addSourceVersion', () => {
  it('appends new keys and records missing keys in both directions', () => {
    const r = addSourceVersion(current, ref120, { b: 'Banana %s', c: 'Cherry' });
    expect(r.en).toEqual({ a: 'Apple', b: 'Banana %s', c: 'Cherry' });
    expect(Object.keys(r.en)).toEqual(['a', 'b', 'c']);
    expect(r.addedKeys).toEqual(['c']);
    expect(r.sourceVersions).toEqual([
      { ...v121, missingKeys: ['c'] },
      { ...ref120, missingKeys: ['a'] },
    ]);
    expect(r.conflicts).toEqual([]);
  });

  it('keeps existing text and reports a plain text conflict', () => {
    const r = addSourceVersion(current, ref120, { a: 'Red Apple', b: 'Banana %s' });
    expect(r.en.a).toBe('Apple');
    expect(r.conflicts).toEqual([{ key: 'a', existing: 'Apple', incoming: 'Red Apple', formatChanged: false }]);
  });

  it('flags format changes', () => {
    const r = addSourceVersion(current, ref120, { a: 'Apple', b: 'Banana %s of %s' });
    expect(r.conflicts).toEqual([{ key: 'b', existing: 'Banana %s', incoming: 'Banana %s of %s', formatChanged: true }]);
  });

  it('rejects a duplicate source version', () => {
    const ref = { modVersion: '2.0', mcVersion: '1.21.1', loader: 'neoforge' } as const;
    expect(() => addSourceVersion(current, ref, { a: 'Apple' })).toThrow(DuplicateSourceVersionError);
  });
});

describe('addSourceVersion format conflicts', () => {
  it('treats %s and %1$s as the same argument', () => {
    const r = addSourceVersion(current, ref120, { b: 'Banana %1$s!' });
    expect(r.conflicts).toEqual([expect.objectContaining({ key: 'b', formatChanged: false })]);
  });

  it('ignores § color code and line break changes', () => {
    const r = addSourceVersion(current, ref120, { b: '§aBanana %s\\n' });
    expect(r.conflicts).toEqual([expect.objectContaining({ key: 'b', formatChanged: false })]);
  });

  it('still flags reordered or retyped arguments', () => {
    const base = { en: { a: '%s of %d' }, sourceVersions: [v121] };
    expect(addSourceVersion(base, ref120, { a: '%d of %s' }).conflicts[0]?.formatChanged).toBe(true);
    expect(addSourceVersion(base, ref120, { a: '%2$s of %1$d' }).conflicts[0]?.formatChanged).toBe(true);
    expect(addSourceVersion(base, ref120, { a: '%1$s of %2$d' }).conflicts[0]?.formatChanged).toBe(false);
    expect(addSourceVersion(base, ref120, { a: '%s of %d %s' }).conflicts[0]?.formatChanged).toBe(true);
  });
});

describe('addSourceVersion newer build of the same mc version and loader', () => {
  const newer = { modVersion: '2.1', mcVersion: '1.21.1', loader: 'neoforge' } as const;

  it('replaces the existing row when the newer build keeps every key', () => {
    const r = addSourceVersion(current, newer, { a: 'Apple', b: 'Banana %s', c: 'Cherry' });
    expect(r.sourceVersions).toEqual([{ ...newer, missingKeys: [] }]);
    expect(r.replaced).toEqual([v121]);
  });

  it('keeps both rows when the older build has keys no other version has', () => {
    const r = addSourceVersion(current, newer, { a: 'Apple' });
    expect(r.sourceVersions).toEqual([v121, { ...newer, missingKeys: ['b'] }]);
    expect(r.replaced).toEqual([]);
  });

  it('replaces the older row when its leftover keys are kept by another version', () => {
    const v120: SourceVersion = { modVersion: '1.5', mcVersion: '1.20.1', loader: 'forge', missingKeys: [] };
    const r = addSourceVersion({ ...current, sourceVersions: [v121, v120] }, newer, { a: 'Apple' });
    expect(r.sourceVersions).toEqual([v120, { ...newer, missingKeys: ['b'] }]);
    expect(r.replaced).toEqual([v121]);
  });

  it('keeps only one of several older rows that share the same leftover key', () => {
    const v122: SourceVersion = { modVersion: '2.0.5', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] };
    const r = addSourceVersion({ ...current, sourceVersions: [v121, v122] }, newer, { a: 'Apple' });
    expect(r.replaced).toEqual([v121]);
    expect(r.sourceVersions.map((v) => v.modVersion)).toEqual(['2.0.5', '2.1']);
  });
});

describe('withSourceVersions', () => {
  it('writes source versions and merges mc versions / loaders in canonical order', () => {
    const meta = catalogModSchema.parse({
      modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
      mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
      translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } },
      updatedAt: '2026-01-01', sourceVersions: [v121],
    });
    const next = withSourceVersions(meta, [v121, { ...ref120, missingKeys: [] }], '2026-10-15');
    expect(next).toMatchObject({ mcVersions: ['1.21.1', '1.20.1'], loaders: ['forge', 'neoforge'], updatedAt: '2026-10-15' });
    expect(next.sourceVersions).toHaveLength(2);
    expect(meta.sourceVersions).toHaveLength(1);
  });
});

const mv = (patch: Partial<ModrinthVersion>): ModrinthVersion => ({
  id: 'x', version_number: '1.0', game_versions: ['1.21.1'], loaders: ['fabric'], date_published: '2026-01-01',
  files: [{ url: 'https://cdn.modrinth.com/x.jar', filename: 'x.jar', primary: true }], ...patch,
});

describe('resolveSourceRef', () => {
  it('prefers PREFERRED_MC_VERSIONS and the first known loader', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.21', '1.21.1'], loaders: ['quilt', 'fabric'] })))
      .toEqual({ modVersion: '1.0', mcVersion: '1.21.1', loader: 'fabric' });
  });

  it('falls back to the newest known mc version', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.18.2', '1.19.2'] }))?.mcVersion).toBe('1.19.2');
  });

  it('returns null for unknown mc versions or loaders', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.21.2'] }))).toBeNull();
    expect(resolveSourceRef(mv({ loaders: ['rift'] }))).toBeNull();
  });

  it('knows 26.x versions and picks the newest of them', () => {
    expect(resolveSourceRef(mv({ game_versions: ['26.1', '26.1.1', '26.1.2'] }))?.mcVersion).toBe('26.1.2');
    expect(resolveSourceRef(mv({ game_versions: ['1.21.9', '1.21.10'] }))?.mcVersion).toBe('1.21.10');
  });
});

describe('resolveSourceRef loader preference', () => {
  it('prefers neoforge after 1.20.1 and forge up to 1.20.1', () => {
    expect(resolveSourceRef(mv({ game_versions: ['1.21.1'], loaders: ['forge', 'neoforge'] }))?.loader).toBe('neoforge');
    expect(resolveSourceRef(mv({ game_versions: ['1.20.1'], loaders: ['neoforge', 'forge'] }))?.loader).toBe('forge');
  });

  it('prefers neoforge on 26.x', () => {
    expect(resolveSourceRef(mv({ game_versions: ['26.3'], loaders: ['forge', 'neoforge'] }))?.loader).toBe('neoforge');
  });
});

describe('pickVersionFor', () => {
  it('picks the newest matching version with files', () => {
    const versions = [
      mv({ id: 'old', date_published: '2025-01-01', loaders: ['forge'], game_versions: ['1.20.1'] }),
      mv({ id: 'new', date_published: '2026-01-01', loaders: ['forge'], game_versions: ['1.20.1'] }),
      mv({ id: 'nofile', date_published: '2027-01-01', loaders: ['forge'], game_versions: ['1.20.1'], files: [] }),
      mv({ id: 'fabric', date_published: '2027-01-01', loaders: ['fabric'], game_versions: ['1.20.1'] }),
    ];
    expect(pickVersionFor(versions, '1.20.1', 'forge')?.id).toBe('new');
    expect(pickVersionFor(versions, '1.21.1', 'forge')).toBeNull();
  });
});

describe('modrinthSlug', () => {
  it('extracts the slug from a Modrinth mod url', () => {
    expect(modrinthSlug('https://modrinth.com/mod/xaeros-minimap')).toBe('xaeros-minimap');
    expect(modrinthSlug('https://modrinth.com/mod/jei/')).toBe('jei');
    expect(modrinthSlug('https://www.curseforge.com/minecraft/mc-mods/jei')).toBeNull();
    expect(modrinthSlug(undefined)).toBeNull();
  });
});

describe('migrateMeta', () => {
  const ref = { modVersion: '6.0.6', mcVersion: '1.21.1', loader: 'neoforge' } as const;

  it('replaces modVersion in place with sourceVersions', () => {
    const raw = Object.freeze({ modId: 'create', modVersion: '6.0.6', mcVersions: ['1.21.1'] });
    const next = migrateMeta(raw, ref);
    expect(Object.keys(next)).toEqual(['modId', 'sourceVersions', 'mcVersions']);
    expect(next.sourceVersions).toEqual([{ ...ref, missingKeys: [] }]);
    expect(raw).toHaveProperty('modVersion');
  });

  it('appends sourceVersions when modVersion is absent', () => {
    const next = migrateMeta({ modId: 'x' }, { mcVersion: '1.12.2', loader: 'forge' });
    expect(next).toEqual({ modId: 'x', sourceVersions: [{ mcVersion: '1.12.2', loader: 'forge', missingKeys: [] }] });
  });
});
