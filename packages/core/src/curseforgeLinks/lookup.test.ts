import { describe, expect, it } from 'vitest';
import { cfMod, cfNameSearch, cfSlugSearch } from '../test/curseforgeLinkFixtures';
import { fakeFetch } from '../test/fakeFetch';
import { CF_API, CF_FAKE_KEY } from '../test/modpackFixtures';
import { findCurseforgeLink } from './index';

describe('findCurseforgeLink', () => {
  it('stops after a slug hit', async () => {
    const f = fakeFetch({ [cfSlugSearch('jei')]: { data: [cfMod(238222, 'Just Enough Items (JEI)', 'jei')] } });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' })).toMatchObject({ kind: 'matched', via: 'slug', slug: 'jei' });
    expect(f.calls.map((c) => c.url)).toEqual([`${CF_API}/mods/search?gameId=432&classId=6&slug=jei`]);
  });

  it('falls back to the name search from the spec', async () => {
    const f = fakeFetch({
      [cfSlugSearch('sodium-extra-mr')]: { data: [] },
      [cfNameSearch('Sodium Extra')]: { data: [cfMod(9, 'Sodium Extra', 'sodium-extra')] },
    });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'sodium-extra-mr', name: 'Sodium Extra' })).toMatchObject({ kind: 'matched', via: 'name', slug: 'sodium-extra' });
    expect(f.calls.map((c) => c.url)).toEqual([
      `${CF_API}/mods/search?gameId=432&classId=6&slug=sodium-extra-mr`,
      `${CF_API}/mods/search?gameId=432&classId=6&searchFilter=Sodium%20Extra&pageSize=20`,
    ]);
  });

  it('reports name-mismatch when the slug hit name differs and name search finds nothing', async () => {
    const f = fakeFetch({
      [cfSlugSearch('carryon')]: { data: [cfMod(5, 'Carry Everything', 'carryon')] },
      [cfNameSearch('Carry On')]: { data: [] },
    });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'carryon', name: 'Carry On' })).toEqual({
      kind: 'review', reason: 'name-mismatch', candidates: [{ name: 'Carry Everything', slug: 'carryon', url: `https://www.curseforge.com/minecraft/mc-mods/carryon` }],
    });
  });

  it('searches by name only when the mod has no Modrinth link', async () => {
    const f = fakeFetch({ [cfNameSearch('Example Legacy Mod')]: { data: [] } });
    expect(await findCurseforgeLink(f, CF_FAKE_KEY, { slug: null, name: 'Example Legacy Mod' })).toEqual({ kind: 'review', reason: 'none', candidates: [] });
    expect(f.calls.map((c) => c.url)).toEqual([cfNameSearch('Example Legacy Mod')]);
  });

  it('sends the key only to the CurseForge API without following redirects', async () => {
    const f = fakeFetch({ [cfSlugSearch('jei')]: { data: [] }, [cfNameSearch('Just Enough Items')]: { data: [] } });
    await findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' });
    expect(f.calls).toHaveLength(2);
    for (const call of f.calls) {
      expect(call.url.startsWith(`${CF_API}/`)).toBe(true);
      expect(call.init?.headers?.['x-api-key']).toBe(CF_FAKE_KEY);
      expect(call.init?.redirect).toBe('error');
    }
  });

  it('throws on HTTP errors without retrying', async () => {
    const f = fakeFetch({});
    await expect(findCurseforgeLink(f, CF_FAKE_KEY, { slug: 'jei', name: 'Just Enough Items' })).rejects.toThrow(`HTTP 404 ${cfSlugSearch('jei')}`);
    expect(f.calls).toHaveLength(1);
  });
});
