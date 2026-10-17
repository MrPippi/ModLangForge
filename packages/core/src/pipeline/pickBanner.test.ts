import { describe, expect, it } from 'vitest';
import { bannerSources } from './index';

describe('bannerSources', () => {
  const img = (url: string, featured: boolean, ordering: number, raw_url?: string) => ({ url, featured, ordering, ...(raw_url ? { raw_url } : {}) });
  it('prefers the featured image', () => {
    expect(bannerSources([img('https://cdn.modrinth.com/a.png', false, 0), img('https://cdn.modrinth.com/b.png', true, 5)])).toEqual(['https://cdn.modrinth.com/b.png']);
  });
  it('falls back to the lowest ordering', () => {
    expect(bannerSources([img('https://cdn.modrinth.com/a.png', false, 3), img('https://cdn.modrinth.com/b.png', false, 1)])).toEqual(['https://cdn.modrinth.com/b.png']);
  });
  it('returns nothing for an empty gallery', () => expect(bannerSources([])).toEqual([]));
  it('skips images outside the Modrinth CDN', () => {
    expect(bannerSources([img('https://evil.example/x.png', true, 0)])).toEqual([]);
  });
  it('tries the original image before the compressed one', () => {
    expect(bannerSources([img('https://cdn.modrinth.com/a.webp', true, 0, 'https://cdn.modrinth.com/a.png')]))
      .toEqual(['https://cdn.modrinth.com/a.png', 'https://cdn.modrinth.com/a.webp']);
  });
  it('ignores an original image outside the Modrinth CDN', () => {
    expect(bannerSources([img('https://cdn.modrinth.com/a.webp', true, 0, 'https://evil.example/a.png')])).toEqual(['https://cdn.modrinth.com/a.webp']);
  });
});
