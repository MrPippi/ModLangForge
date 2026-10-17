import { describe, expect, it } from 'vitest';
import { curseforgeSlug } from '../modpack/resolve';
import { cfMod } from '../test/curseforgeLinkFixtures';
import { curseforgeModUrl, decideLink, MAX_CANDIDATES, matchBySlug, normalizeCatalogName, normalizeModName } from './index';

const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;
const jei = { slug: 'jei', name: 'Just Enough Items' };

describe('normalizeModName (CurseForge side)', () => {
  it('lowercases and removes non-letter, non-digit characters', () => {
    expect(normalizeModName("Create: Steam 'n' Rails")).toBe('createsteamnrails');
    expect(normalizeModName('Sodium')).toBe('sodium');
  });

  it('keeps bracketed text, so forks and variants stay distinct', () => {
    expect(normalizeModName('Sodium (Fork)')).toBe('sodiumfork');
  });

  it('keeps non-ASCII letters and digits', () => {
    expect(normalizeModName('Create 机械动力')).toBe('create机械动力');
    expect(normalizeModName('Café')).toBe('café');
  });
});

describe('normalizeCatalogName (our mod.json name)', () => {
  it('drops bracketed text before normalizing', () => {
    expect(normalizeCatalogName('Roughly Enough Items (REI)')).toBe('roughlyenoughitems');
    expect(normalizeCatalogName('Ok Zoomer (Zoom)')).toBe('okzoomer');
  });

  it('returns an empty string when nothing alphanumeric is left', () => {
    expect(normalizeCatalogName('(beta) ★')).toBe('');
  });
});

describe('curseforgeModUrl', () => {
  it('builds the mc-mods page that the modpack resolver reads back', () => {
    expect(curseforgeModUrl('jei')).toBe(CF('jei'));
    expect(curseforgeSlug(curseforgeModUrl('create'))).toBe('create');
  });
});

describe('matchBySlug', () => {
  it('needs a Modrinth slug', () => {
    expect(matchBySlug({ slug: null, name: 'Just Enough Items' }, [cfMod(1, 'Just Enough Items', 'jei')])).toBeUndefined();
  });

  it('ignores a same-named modpack with the same slug', () => {
    expect(matchBySlug(jei, [cfMod(1, 'Just Enough Items', 'jei', 4471)])).toBeUndefined();
  });
});

describe('decideLink', () => {
  it('adopts a case-insensitive slug hit whose normalized name matches', () => {
    expect(decideLink({ slug: 'JEI', name: 'Just Enough Items' }, [cfMod(238222, 'Just Enough Items', 'jei')], [])).toEqual({
      kind: 'matched', via: 'slug', slug: 'jei', url: CF('jei'),
    });
  });

  it('adopts the only exact name match when the slug search has none', () => {
    const byName = [cfMod(1, 'Sodium Extra', 'sodium-extra'), cfMod(2, 'Sodium', 'sodium-forge')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({ kind: 'matched', via: 'name', slug: 'sodium-forge', url: CF('sodium-forge') });
  });

  it('does not adopt a fork whose name only differs by a bracketed suffix', () => {
    const byName = [cfMod(2, 'Sodium (Fork)', 'sodium-b')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: 'Sodium (Fork)', slug: 'sodium-b', url: CF('sodium-b') }],
    });
  });

  it('asks for review when several results share the name', () => {
    const byName = [cfMod(1, 'Sodium', 'sodium-a'), cfMod(2, 'Sodium', 'sodium-b'), cfMod(3, 'Sodium Extra', 'sodium-extra')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({
      kind: 'review', reason: 'ambiguous',
      candidates: [{ name: 'Sodium', slug: 'sodium-a', url: CF('sodium-a') }, { name: 'Sodium', slug: 'sodium-b', url: CF('sodium-b') }],
    });
  });

  it('asks for review when only the slug matches but the name differs', () => {
    const result = decideLink({ slug: 'carryon', name: 'Carry On' }, [cfMod(5, 'Carry Everything', 'carryon')], [cfMod(6, 'Carry On Plus', 'carry-on-plus')]);
    expect(result).toEqual({
      kind: 'review', reason: 'name-mismatch',
      candidates: [{ name: 'Carry Everything', slug: 'carryon', url: CF('carryon') }, { name: 'Carry On Plus', slug: 'carry-on-plus', url: CF('carry-on-plus') }],
    });
  });

  it('asks for review with no candidates when nothing is found', () => {
    expect(decideLink(jei, [], [])).toEqual({ kind: 'review', reason: 'none', candidates: [] });
  });

  it('never matches a name that normalizes to empty', () => {
    expect(decideLink({ slug: null, name: '★' }, [], [cfMod(1, '☆', 'star')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: '☆', slug: 'star', url: CF('star') }],
    });
  });

  it('ignores projects that are not mods', () => {
    const pack = cfMod(1, 'Just Enough Items', 'jei', 12);
    expect(decideLink(jei, [pack], [pack])).toEqual({ kind: 'review', reason: 'none', candidates: [] });
  });

  it('adopts the one real mod when a same-named modpack is also returned', () => {
    const pack = cfMod(1, 'Just Enough Items', 'jei-pack', 4471);
    const mod = cfMod(2, 'Just Enough Items', 'jei');
    expect(decideLink(jei, [], [pack, mod])).toEqual({ kind: 'matched', via: 'name', slug: 'jei', url: CF('jei') });
  });

  it('does not match when CurseForge adds mixed-script text to the name', () => {
    expect(decideLink({ slug: null, name: 'Create' }, [], [cfMod(1, 'Create 机械动力', 'create-cn')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: 'Create 机械动力', slug: 'create-cn', url: CF('create-cn') }],
    });
  });

  it('does not match an accented name against its unaccented form', () => {
    expect(decideLink({ slug: null, name: 'Café' }, [], [cfMod(1, 'Caf', 'caf')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: 'Caf', slug: 'caf', url: CF('caf') }],
    });
  });

  it('does not match an abbreviation against the full name', () => {
    expect(decideLink({ slug: 'jei', name: 'JEI' }, [], [cfMod(1, 'Just Enough Items', 'jei')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: 'Just Enough Items', slug: 'jei', url: CF('jei') }],
    });
  });

  it('does not match an addon against its base mod', () => {
    expect(decideLink({ slug: null, name: 'Mekanism' }, [], [cfMod(1, 'Mekanism Addon', 'mekanism-addon')])).toEqual({
      kind: 'review', reason: 'none', candidates: [{ name: 'Mekanism Addon', slug: 'mekanism-addon', url: CF('mekanism-addon') }],
    });
  });

  it('lists each project once and caps the candidates', () => {
    const byName = [...Array.from({ length: 7 }, (_, i) => cfMod(i + 1, 'Sodium', `sodium-${i + 1}`)), cfMod(1, 'Sodium', 'sodium-1')];
    const result = decideLink({ slug: 'other', name: 'Sodium' }, [], byName);
    expect(result.kind === 'review' ? result.candidates.map((c) => c.slug) : []).toEqual(['sodium-1', 'sodium-2', 'sodium-3', 'sodium-4', 'sodium-5']);
    expect(MAX_CANDIDATES).toBe(5);
  });
});
