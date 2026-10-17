import { describe, expect, it } from 'vitest';
import { pickBannerUrl } from './index';

describe('pickBannerUrl', () => {
  const img = (url: string, featured: boolean, ordering: number) => ({ url, featured, ordering });
  it('prefers the featured image', () => {
    expect(pickBannerUrl([img('https://cdn.modrinth.com/a.png', false, 0), img('https://cdn.modrinth.com/b.png', true, 5)])).toBe('https://cdn.modrinth.com/b.png');
  });
  it('falls back to the lowest ordering', () => {
    expect(pickBannerUrl([img('https://cdn.modrinth.com/a.png', false, 3), img('https://cdn.modrinth.com/b.png', false, 1)])).toBe('https://cdn.modrinth.com/b.png');
  });
  it('returns null for an empty gallery', () => expect(pickBannerUrl([])).toBeNull());
  it('skips images outside the Modrinth CDN', () => {
    expect(pickBannerUrl([img('https://evil.example/x.png', true, 0)])).toBeNull();
  });
});
