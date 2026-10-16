import { describe, expect, it } from 'vitest';
import { MOD_ICON_PATTERN, modIconUrl } from './modIcon';

describe('modIconUrl', () => {
  it('returns the local path only for mods with a downloaded icon', () => {
    const available = new Set(['create']);
    expect(modIconUrl('create', available)).toBe('/mod-icons/create.webp');
    expect(modIconUrl('jei', available)).toBeNull();
  });

  it('produces paths accepted by the index schema pattern', () => {
    expect(MOD_ICON_PATTERN.test(modIconUrl('alexs_mobs.v2', new Set(['alexs_mobs.v2']))!)).toBe(true);
    expect(MOD_ICON_PATTERN.test('https://cdn.modrinth.com/x.webp')).toBe(false);
    expect(MOD_ICON_PATTERN.test('/mod-icons/../secret.webp')).toBe(false);
  });
});
