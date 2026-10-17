import { describe, expect, it } from 'vitest';
import { curseforgeSlug, includedModIds, platformModpackUrl, platformModUrl, resolveModpackMods, type CatalogModLinks } from './index';

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
      { platform: 'modrinth', projectId: 'LNytGWDc', slug: 'Create', modId: 'create' },
      { platform: 'curseforge', projectId: '238222', slug: 'jei', modId: 'jei' },
      { platform: 'modrinth', projectId: 'u6dRKJwZ', slug: 'jei', modId: 'jei' },
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

describe('includedModIds', () => {
  it('lists matched modIds once, in pack order', () => {
    expect(includedModIds([
      { platform: 'modrinth', projectId: '1', slug: 'jei', modId: 'jei' },
      { platform: 'modrinth', projectId: '2', slug: 'x', modId: null },
      { platform: 'curseforge', projectId: '3', slug: 'create', modId: 'create' },
      { platform: 'curseforge', projectId: '4', slug: 'jei', modId: 'jei' },
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
