import { describe, expect, it } from 'vitest';
import { uniqueSources } from './sources';

const tr = (name: string, license: string, url: string | null = null) => ({ source: { name, url }, license });

describe('uniqueSources', () => {
  it('keeps sources that share a name but differ in license or url', () => {
    const list = [tr('A', 'CC-BY-4.0'), tr('A', 'CC-BY-4.0'), tr('A', 'CC0-1.0'), tr('A', 'CC0-1.0', 'https://a.example')];
    expect(uniqueSources(list)).toEqual([tr('A', 'CC-BY-4.0'), tr('A', 'CC0-1.0'), tr('A', 'CC0-1.0', 'https://a.example')]);
  });
});
