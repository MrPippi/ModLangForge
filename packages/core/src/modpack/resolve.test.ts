import { describe, expect, it } from 'vitest';
import {
  curseforgeSlug, includedModIds, platformModpackUrl, platformModUrl, resolvedModpackModSchema, resolveModpackMods, type CatalogModLinks,
} from './index';

const catalog: CatalogModLinks[] = [
  { modId: 'create', links: { modrinth: 'https://modrinth.com/mod/create', curseforge: 'https://www.curseforge.com/minecraft/mc-mods/create' } },
  { modId: 'jei', links: { modrinth: 'https://modrinth.com/mod/JEI/', curseforge: 'https://www.curseforge.com/minecraft/mc-mods/jei/' } },
  { modId: 'zeta', links: { modrinth: 'https://modrinth.com/mod/shared' } },
  { modId: 'alpha', links: { modrinth: 'https://modrinth.com/mod/shared' } },
  { modId: 'cfonly', links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/cfonly' } },
  { modId: 'nolinks', links: {} },
];

describe('resolveModpackMods', () => {
  it('matches by platform slug, ignoring case and trailing slashes', () => {
    const resolved = resolveModpackMods([
      { platform: 'modrinth', projectId: 'LNytGWDc', slug: 'Create' },
      { platform: 'curseforge', projectId: '238222', slug: 'jei' },
      { platform: 'modrinth', projectId: 'u6dRKJwZ', slug: 'jei' },
    ], catalog);
    expect(resolved).toEqual([
      { platform: 'modrinth', projectId: 'LNytGWDc', slug: 'Create', modId: 'create', builtin: false },
      { platform: 'curseforge', projectId: '238222', slug: 'jei', modId: 'jei', builtin: false },
      { platform: 'modrinth', projectId: 'u6dRKJwZ', slug: 'jei', modId: 'jei', builtin: false },
    ]);
  });

  it('picks the first modId in sort order when several mods share a slug', () => {
    expect(resolveModpackMods([{ platform: 'modrinth', projectId: 's', slug: 'shared' }], catalog)[0]?.modId).toBe('alpha');
  });

  it('never matches across platforms and leaves unknown mods unresolved', () => {
    const resolved = resolveModpackMods([
      { platform: 'modrinth', projectId: 'c', slug: 'cfonly' },
      { platform: 'curseforge', projectId: '1', slug: 'shared' },
      { platform: 'modrinth', projectId: 'x', slug: 'unknown' },
    ], catalog);
    expect(resolved.map((m) => m.modId)).toEqual([null, null, null]);
  });

  it('does not modify its input', () => {
    const mods = [{ platform: 'modrinth' as const, projectId: 'LNytGWDc', slug: 'create' }];
    resolveModpackMods(mods, catalog);
    expect(mods).toEqual([{ platform: 'modrinth', projectId: 'LNytGWDc', slug: 'create' }]);
  });
});

const builtinIndex: CatalogModLinks[] = [
  { modId: 'litematica', links: { modrinth: 'https://modrinth.com/mod/litematica' } },
  { modId: 'create-dup', links: { modrinth: 'https://modrinth.com/mod/create' } },
];

describe('resolveModpackMods with built-in mods', () => {
  it('falls back to the built-in index when the catalog has no match', () => {
    const resolved = resolveModpackMods([{ platform: 'modrinth', projectId: 'l', slug: 'Litematica' }], catalog, builtinIndex);
    expect(resolved).toEqual([{ platform: 'modrinth', projectId: 'l', slug: 'Litematica', modId: 'litematica', builtin: true }]);
  });

  it('prefers the regular catalog when both match the same slug', () => {
    const resolved = resolveModpackMods([{ platform: 'modrinth', projectId: 'c', slug: 'create' }], catalog, builtinIndex);
    expect(resolved[0]).toMatchObject({ modId: 'create', builtin: false });
  });

  it('still leaves unknown mods unresolved', () => {
    expect(resolveModpackMods([{ platform: 'modrinth', projectId: 'x', slug: 'nope' }], catalog, builtinIndex)[0])
      .toMatchObject({ modId: null, builtin: false });
  });

  it('parses an older API body without builtin as false', () => {
    expect(resolvedModpackModSchema.parse({ platform: 'modrinth', projectId: '1', slug: 'jei', modId: 'jei', builtin: false }).builtin).toBe(false);
  });
});

describe('includedModIds', () => {
  it('can leave out built-in mods', () => {
    const resolved = [
      { platform: 'modrinth' as const, projectId: '1', slug: 'jei', modId: 'jei', builtin: false },
      { platform: 'modrinth' as const, projectId: '2', slug: 'litematica', modId: 'litematica', builtin: true },
    ];
    expect(includedModIds(resolved)).toEqual(['jei', 'litematica']);
    expect(includedModIds(resolved, { includeBuiltin: false })).toEqual(['jei']);
  });

  it('lists matched modIds once, in pack order', () => {
    expect(includedModIds([
      { platform: 'modrinth', projectId: '1', slug: 'jei', modId: 'jei', builtin: false },
      { platform: 'modrinth', projectId: '2', slug: 'x', modId: null, builtin: false },
      { platform: 'curseforge', projectId: '3', slug: 'create', modId: 'create', builtin: false },
      { platform: 'curseforge', projectId: '4', slug: 'jei', modId: 'jei', builtin: false },
    ])).toEqual(['jei', 'create']);
  });
});

describe('platform urls', () => {
  it('reads CurseForge mod slugs only from mc-mods pages', () => {
    expect(curseforgeSlug('https://www.curseforge.com/minecraft/mc-mods/jei')).toBe('jei');
    expect(curseforgeSlug('https://www.curseforge.com/minecraft/modpacks/jei')).toBeNull();
    expect(curseforgeSlug('https://curseforge.com/minecraft/mc-mods/jei')).toBeNull();
    expect(curseforgeSlug(undefined)).toBeNull();
  });

  it('builds mod and modpack pages', () => {
    expect(platformModUrl({ platform: 'modrinth', slug: 'create' })).toBe('https://modrinth.com/mod/create');
    expect(platformModUrl({ platform: 'curseforge', slug: 'jei' })).toBe('https://www.curseforge.com/minecraft/mc-mods/jei');
    expect(platformModpackUrl('modrinth', 'example-pack')).toBe('https://modrinth.com/modpack/example-pack');
    expect(platformModpackUrl('curseforge', 'example-pack')).toBe('https://www.curseforge.com/minecraft/modpacks/example-pack');
  });
});
