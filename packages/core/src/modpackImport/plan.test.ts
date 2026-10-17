import { describe, expect, it } from 'vitest';
import { catalogModpackSchema } from '../modpack';
import { MACHINE_SOURCE_NAME, SUMMARY_PLACEHOLDER } from '../pipeline';
import { AUTHOR_PLACEHOLDER, type ImportedModpack, modpackIdFromSlug, planModpackWrite } from './index';

const incoming: ImportedModpack = {
  platform: 'modrinth', projectId: 'AbCd1234', slug: 'example-pack', name: 'Example Pack', authors: ['someone'],
  version: '1.4.0', mcVersion: '1.20.1', loader: 'forge',
  mods: [{ platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' }],
  kubejs: { kubejs: { a: 'Gear', b: 'Casing %s' } },
  notes: [],
};

describe('planModpackWrite: new modpack', () => {
  it('drafts modpack.json with placeholders, machine status and the platform link', () => {
    expect(planModpackWrite('example-pack', null, incoming, '2026-10-17')).toEqual({
      kind: 'write',
      meta: {
        id: 'example-pack', name: 'Example Pack', summary: SUMMARY_PLACEHOLDER, authors: ['someone'],
        links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
        source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' },
        mods: [{ platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' }],
        translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: MACHINE_SOURCE_NAME, url: null }, contributors: [] },
        updatedAt: '2026-10-17',
      },
      kubejsEn: { kubejs: { a: 'Gear', b: 'Casing %s' } },
      changes: [{ ns: 'kubejs', created: true, addedKeys: ['a', 'b'], conflicts: [] }],
    });
  });

  it('uses a placeholder author when the platform lists none', () => {
    const plan = planModpackWrite('example-pack', null, { ...incoming, authors: [] }, '2026-10-17');
    expect(plan.kind === 'write' ? plan.meta.authors : null).toEqual([AUTHOR_PLACEHOLDER]);
  });
});

describe('planModpackWrite: existing modpack', () => {
  const existingMeta = catalogModpackSchema.parse({
    id: 'example-pack', name: 'Example Pack', nameZh: '範例整合包', summary: '手寫簡介', authors: ['someone'],
    links: { modrinth: 'https://modrinth.com/modpack/example-pack' },
    source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.4.0', mcVersion: '1.20.1', loader: 'forge' },
    mods: [{ platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' }],
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: '社群', url: null }, contributors: ['amy'] },
    updatedAt: '2026-10-01',
  });
  const existing = { meta: existingMeta, kubejsEn: { kubejs: { a: 'Gear', b: 'Casing %s' }, gone: { g: 'G' } } };

  it('updates source, mods and links but keeps curated fields', () => {
    const next: ImportedModpack = {
      ...incoming, platform: 'curseforge', projectId: '555', version: '1.5.0',
      mods: [{ platform: 'curseforge', projectId: '238222', slug: 'jei' }],
      kubejs: { kubejs: { a: 'Gear', b: 'Casing %s', c: 'New' } },
    };
    const plan = planModpackWrite('example-pack', existing, next, '2026-10-18');
    expect(plan.kind).toBe('write');
    if (plan.kind !== 'write') return;
    expect(plan.meta).toEqual({
      ...existingMeta,
      links: { modrinth: 'https://modrinth.com/modpack/example-pack', curseforge: 'https://www.curseforge.com/minecraft/modpacks/example-pack' },
      source: { platform: 'curseforge', projectId: '555', version: '1.5.0', mcVersion: '1.20.1', loader: 'forge' },
      mods: [{ platform: 'curseforge', projectId: '238222', slug: 'jei' }],
      updatedAt: '2026-10-18',
    });
    expect(plan.kubejsEn).toEqual({ kubejs: { a: 'Gear', b: 'Casing %s', c: 'New' } });
    expect(plan.changes).toEqual([{ ns: 'kubejs', created: false, addedKeys: ['c'], conflicts: [] }]);
  });

  it('keeps the existing English for changed lines and only reports them', () => {
    const plan = planModpackWrite('example-pack', existing, { ...incoming, kubejs: { kubejs: { a: 'Big Gear', b: 'Casing %s' } } }, '2026-10-18');
    expect(plan.kind).toBe('write');
    if (plan.kind !== 'write') return;
    expect(plan.kubejsEn).toEqual({});
    expect(plan.changes).toEqual([
      { ns: 'kubejs', created: false, addedKeys: [], conflicts: [{ key: 'a', existing: 'Gear', incoming: 'Big Gear', formatChanged: false }] },
    ]);
  });

  it('refuses to write anything when a format code changed', () => {
    const plan = planModpackWrite('example-pack', existing, { ...incoming, kubejs: { kubejs: { a: 'Gear', b: 'Casing %s %s' } } }, '2026-10-18');
    expect(plan).toEqual({
      kind: 'refused',
      conflicts: [{ ns: 'kubejs', key: 'b', existing: 'Casing %s', incoming: 'Casing %s %s', formatChanged: true }],
    });
  });

  it('creates new namespaces and leaves namespaces missing from the new version alone', () => {
    const plan = planModpackWrite('example-pack', existing, { ...incoming, kubejs: { fresh: { f: 'F' } } }, '2026-10-18');
    expect(plan.kind).toBe('write');
    if (plan.kind !== 'write') return;
    expect(plan.kubejsEn).toEqual({ fresh: { f: 'F' } });
    expect(plan.changes).toEqual([{ ns: 'fresh', created: true, addedKeys: ['f'], conflicts: [] }]);
  });
});

describe('modpackIdFromSlug', () => {
  it('lowercases valid slugs and rejects the rest', () => {
    expect(modpackIdFromSlug('Example-Pack')).toBe('example-pack');
    expect(modpackIdFromSlug('bad slug')).toBeNull();
    expect(modpackIdFromSlug('..')).toBeNull();
  });
});
