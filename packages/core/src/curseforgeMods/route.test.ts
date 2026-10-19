import { describe, expect, it } from 'vitest';
import { LOADERS } from '../catalog/schema';
import { catalogModSchema } from '../catalog/schema';
import type { PlatformBuild } from '../pipeline/build';
import { buildDraftMeta } from '../pipeline/draft';
import { draftFromCurseforge, routeCurseforgeHit, type CurseforgeProject } from './index';

const project = (extra: Partial<CurseforgeProject> = {}): CurseforgeProject => ({
  id: 1, name: 'Just Enough Items (JEI)', slug: 'jei', authors: ['mezz'], downloadCount: 10, logoUrl: null, screenshotUrls: [], ...extra,
});
const none = new Set<string>();

describe('routeCurseforgeHit', () => {
  it('skips a slug that is already collected, even if Modrinth has a match', () => {
    const modrinth = { slug: 'jei', title: 'Just Enough Items', authors: ['mezz'] };
    expect(routeCurseforgeHit({ project: project(), existingCurseforgeSlugs: new Set(['jei']), modrinth })).toBe('exists');
  });

  it('follows Modrinth when the slug and name match', () => {
    const modrinth = { slug: 'jei', title: 'Just Enough Items', authors: ['someone else'] };
    expect(routeCurseforgeHit({ project: project(), existingCurseforgeSlugs: none, modrinth })).toBe('modrinth');
  });

  it('follows Modrinth when only the name matches and an author is shared', () => {
    const modrinth = { slug: 'jei-renamed', title: 'Just Enough Items', authors: ['MEZZ'] };
    expect(routeCurseforgeHit({ project: project({ name: 'Just Enough Items' }), existingCurseforgeSlugs: none, modrinth })).toBe('modrinth');
  });

  it('goes CurseForge-only when Modrinth has no such project', () => {
    expect(routeCurseforgeHit({ project: project(), existingCurseforgeSlugs: none, modrinth: null })).toBe('curseforge');
  });

  it('goes to review when the Modrinth project is an unrelated mod with the same slug and a different author', () => {
    const modrinth = { slug: 'jei', title: 'Totally Different', authors: ['other'] };
    expect(routeCurseforgeHit({ project: project(), existingCurseforgeSlugs: none, modrinth })).toBe('review');
  });

  it('goes to review when the name matches but no author is shared', () => {
    const modrinth = { slug: 'other-slug', title: 'Just Enough Items', authors: ['other'] };
    expect(routeCurseforgeHit({ project: project({ name: 'Just Enough Items' }), existingCurseforgeSlugs: none, modrinth })).toBe('review');
  });

  describe('dual-listed mods with decorated CurseForge titles', () => {
    const entityCulling = project({ id: 2, name: 'Entity Culling Fabric/Forge', slug: 'entityculling', authors: ['tr7zw'] });

    it('follows Modrinth when the slug and an author match, whatever the title says', () => {
      const modrinth = { slug: 'entityculling', title: 'Entity Culling', authors: ['tr7zw'] };
      expect(routeCurseforgeHit({ project: entityCulling, existingCurseforgeSlugs: none, modrinth })).toBe('modrinth');
    });

    it('compares authors case-insensitively and ignores surrounding spaces', () => {
      const modrinth = { slug: 'EntityCulling', title: 'Entity Culling', authors: [' TR7ZW '] };
      expect(routeCurseforgeHit({ project: entityCulling, existingCurseforgeSlugs: none, modrinth })).toBe('modrinth');
    });

    it('needs review when the slug matches but the author does not', () => {
      const modrinth = { slug: 'entityculling', title: 'Entity Culling', authors: ['someone-else'] };
      expect(routeCurseforgeHit({ project: entityCulling, existingCurseforgeSlugs: none, modrinth })).toBe('review');
    });
  });

  describe('candidates found by name search (slugs differ between platforms)', () => {
    const cf = project({ name: 'Cool Mod', slug: 'cool-mod-cf', authors: ['alice'] });

    it('follows Modrinth when the name is equal and an author is shared', () => {
      const modrinth = { slug: 'cool-mod', title: 'Cool-Mod', authors: ['Alice'] };
      expect(routeCurseforgeHit({ project: cf, existingCurseforgeSlugs: none, modrinth })).toBe('modrinth');
    });

    it('needs review when the name is equal but no author is shared', () => {
      const modrinth = { slug: 'cool-mod', title: 'Cool Mod', authors: ['bob'] };
      expect(routeCurseforgeHit({ project: cf, existingCurseforgeSlugs: none, modrinth })).toBe('review');
    });
  });
});

const build = (mcVersions: string[], loaders: PlatformBuild['loaders']): PlatformBuild => ({
  platform: 'curseforge', id: '1', modVersion: 'v', mcVersions, loaders, publishedAt: '2026-01-01', file: { name: 'v.jar', url: null },
});

describe('draftFromCurseforge', () => {
  const p = project({ name: 'Applied Energistics 2', slug: 'applied-energistics-2', authors: ['AlgorithmX2', 'yueh'] });
  const source = { modVersion: '1', mcVersion: '1.21.1', loader: 'neoforge' } as const;

  it('links only to CurseForge and collects supported versions and loaders from builds', () => {
    const draft = draftFromCurseforge(p, [build(['1.21.1'], ['neoforge']), build(['1.20.1', '1.21.1'], ['forge', 'neoforge'])]);
    expect(draft.links).toEqual({ curseforge: 'https://www.curseforge.com/minecraft/mc-mods/applied-energistics-2' });
    expect(draft.authors).toEqual(['AlgorithmX2', 'yueh']);
    const meta = buildDraftMeta({ project: draft, modId: 'ae2', source, today: '2026-10-20' });
    expect(meta).toMatchObject({ name: 'Applied Energistics 2', aliases: ['applied-energistics-2'], mcVersions: ['1.21.1', '1.20.1'], loaders: ['forge', 'neoforge'] });
    expect(meta.links).toEqual(draft.links);
    expect(catalogModSchema.parse(meta).links.curseforge).toBeDefined();
  });

  it('leaves aliases empty when the slug equals the modId', () => {
    const meta = buildDraftMeta({ project: draftFromCurseforge(p, [build(['1.21.1'], ['neoforge'])]), modId: 'applied-energistics-2', source, today: '2026-10-20' });
    expect(meta.aliases).toEqual([]);
  });

  it('only keeps loaders known to the site', () => {
    const meta = buildDraftMeta({ project: draftFromCurseforge(p, [build(['1.21.1'], ['neoforge'])]), modId: 'x', source, today: '2026-10-20' });
    for (const l of meta.loaders as string[]) expect(LOADERS as readonly string[]).toContain(l);
  });
});
