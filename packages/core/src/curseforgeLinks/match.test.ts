import { describe, expect, it } from 'vitest';
import { curseforgeSlug } from '../modpack/resolve';
import { cfMod } from '../test/curseforgeLinkFixtures';
import { curseforgeModUrl, decideLink, MAX_CANDIDATES, matchBySlug, normalizeModName } from './index';

const CF = (slug: string) => `https://www.curseforge.com/minecraft/mc-mods/${slug}`;
const jei = { slug: 'jei', name: 'Just Enough Items' };

describe('normalizeModName', () => {
  it('lowercases, drops bracketed text and removes non-alphanumerics', () => {
    expect(normalizeModName('Roughly Enough Items (REI)')).toBe('roughlyenoughitems');
    expect(normalizeModName('Ok Zoomer (Zoom)')).toBe('okzoomer');
    expect(normalizeModName("Create: Steam 'n' Rails")).toBe('createsteamnrails');
    expect(normalizeModName('Sodium')).toBe('sodium');
  });

  it('returns an empty string when nothing alphanumeric is left', () => {
    expect(normalizeModName('(beta) ★')).toBe('');
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
});

describe('decideLink', () => {
  it('adopts a case-insensitive slug hit whose normalized name matches', () => {
    expect(decideLink({ slug: 'JEI', name: 'Just Enough Items' }, [cfMod(238222, 'Just Enough Items (JEI)', 'jei')], [])).toEqual({
      kind: 'matched', via: 'slug', slug: 'jei', url: CF('jei'),
    });
  });

  it('adopts the only exact name match when the slug search has none', () => {
    const byName = [cfMod(1, 'Sodium Extra', 'sodium-extra'), cfMod(2, 'Sodium', 'sodium-forge')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({ kind: 'matched', via: 'name', slug: 'sodium-forge', url: CF('sodium-forge') });
  });

  it('asks for review when several results share the name', () => {
    const byName = [cfMod(1, 'Sodium', 'sodium-a'), cfMod(2, 'Sodium (Fork)', 'sodium-b'), cfMod(3, 'Sodium Extra', 'sodium-extra')];
    expect(decideLink({ slug: 'sodium', name: 'Sodium' }, [], byName)).toEqual({
      kind: 'review', reason: 'ambiguous',
      candidates: [{ name: 'Sodium', slug: 'sodium-a', url: CF('sodium-a') }, { name: 'Sodium (Fork)', slug: 'sodium-b', url: CF('sodium-b') }],
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

  it('lists each project once and caps the candidates', () => {
    const byName = [...Array.from({ length: 7 }, (_, i) => cfMod(i + 1, 'Sodium', `sodium-${i + 1}`)), cfMod(1, 'Sodium', 'sodium-1')];
    const result = decideLink({ slug: 'other', name: 'Sodium' }, [], byName);
    expect(result.kind === 'review' ? result.candidates.map((c) => c.slug) : []).toEqual(['sodium-1', 'sodium-2', 'sodium-3', 'sodium-4', 'sodium-5']);
    expect(MAX_CANDIDATES).toBe(5);
  });
});
