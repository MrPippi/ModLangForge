import { describe, expect, it } from 'vitest';
import { MOD_BANNER_PATTERN, modBannerUrl } from './modBanner';

describe('modBannerUrl', () => {
  it('returns a local URL only when the banner exists', () => {
    expect(modBannerUrl('create', new Set(['create']))).toBe('/mod-banners/create.webp');
    expect(modBannerUrl('jei', new Set(['create']))).toBeNull();
  });

  it('produces paths accepted by the index schema pattern', () => {
    expect(MOD_BANNER_PATTERN.test(modBannerUrl('a.b', new Set(['a.b']))!)).toBe(true);
    expect(MOD_BANNER_PATTERN.test('https://evil.example/x.webp')).toBe(false);
    expect(MOD_BANNER_PATTERN.test('/mod-banners/../x.webp')).toBe(false);
  });
});
