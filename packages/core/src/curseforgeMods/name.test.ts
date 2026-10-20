import { describe, expect, it } from 'vitest';
import { cleanCurseforgeName } from './index';

describe('cleanCurseforgeName', () => {
  it.each([
    ['FTB Quests (NeoForge)', 'FTB Quests'],
    ['FTB Essentials (Forge & Fabric)', 'FTB Essentials'],
    ['Foo (Forge/Fabric)', 'Foo'],
    ['Foo [Forge]', 'Foo'],
    ['Foo (Fabric)', 'Foo'],
    ['Extreme sound muffler - (Neo)Forge', 'Extreme sound muffler'],
    ['Ender Storage 1.8.+', 'Ender Storage'],
    ['Foo 1.20.1', 'Foo'],
    ['Entity Culling Fabric/Forge', 'Entity Culling'],
    ["MrCrayfish's Furniture Mod (Legacy)", "MrCrayfish's Furniture Mod (Legacy)"],
    ['Just Enough Items (JEI)', 'Just Enough Items (JEI)'],
    ['Forge', 'Forge'],
  ])('%s -> %s', (input, expected) => {
    expect(cleanCurseforgeName(input)).toBe(expected);
  });
});
