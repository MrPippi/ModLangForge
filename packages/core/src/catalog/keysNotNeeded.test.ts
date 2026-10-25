import { describe, expect, it } from 'vitest';
import { keysNotNeededFor } from './index';

const row = (mcVersion: string, loader: 'forge' | 'neoforge' | 'fabric', missingKeys: string[]) => ({ mcVersion, loader, missingKeys });

describe('keysNotNeededFor', () => {
  it('returns keys every row of that Minecraft version lists as missing', () => {
    const meta = { sourceVersions: [row('26.1', 'neoforge', ['a', 'b']), row('26.1', 'fabric', ['b', 'c']), row('1.21.1', 'forge', [])] };
    expect([...keysNotNeededFor(meta, '26.1')]).toEqual(['b']);
  });

  it('keeps every key for versions whose rows need them', () => {
    const meta = { sourceVersions: [row('26.1', 'neoforge', ['a']), row('1.21.1', 'forge', [])] };
    expect(keysNotNeededFor(meta, '1.21.1').size).toBe(0);
  });

  it('drops nothing for a Minecraft version without source rows', () => {
    const meta = { sourceVersions: [row('26.1', 'neoforge', ['a'])] };
    expect(keysNotNeededFor(meta, '1.20.1').size).toBe(0);
  });
});
