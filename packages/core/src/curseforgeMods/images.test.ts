import { describe, expect, it } from 'vitest';
import { curseforgeBannerSources, curseforgeIconSource, type CurseforgeProject } from './index';

const project = (extra: Partial<CurseforgeProject> = {}): CurseforgeProject => ({
  id: 1, name: 'AE2', slug: 'ae2', authors: ['a'], downloadCount: 0, logoUrl: null, screenshotUrls: [], ...extra,
});

describe('curseforgeIconSource', () => {
  it('returns the logo on the CurseForge image CDN', () => {
    expect(curseforgeIconSource(project({ logoUrl: 'https://media.forgecdn.net/avatars/1/logo.png' }))).toBe('https://media.forgecdn.net/avatars/1/logo.png');
  });

  it('returns null without a logo', () => {
    expect(curseforgeIconSource(project())).toBeNull();
  });

  it('drops a logo on another host', () => {
    expect(curseforgeIconSource(project({ logoUrl: 'https://evil.example/logo.png' }))).toBeNull();
    expect(curseforgeIconSource(project({ logoUrl: 'http://media.forgecdn.net/logo.png' }))).toBeNull();
  });
});

describe('curseforgeBannerSources', () => {
  it('keeps only allowed hosts and takes the first one', () => {
    const urls = ['https://evil.example/a.png', 'https://media.forgecdn.net/b.png', 'https://media.forgecdn.net/c.png'];
    expect(curseforgeBannerSources(project({ screenshotUrls: urls }))).toEqual(['https://media.forgecdn.net/b.png']);
  });

  it('returns an empty list without screenshots', () => {
    expect(curseforgeBannerSources(project())).toEqual([]);
  });
});
