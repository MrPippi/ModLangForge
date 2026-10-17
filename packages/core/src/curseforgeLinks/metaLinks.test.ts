import { describe, expect, it } from 'vitest';
import { withCurseforgeLink } from './index';

const CF_JEI = 'https://www.curseforge.com/minecraft/mc-mods/jei';

describe('withCurseforgeLink', () => {
  it('inserts curseforge right after modrinth and keeps every other byte', () => {
    const before = [
      '{',
      '  "modId": "jei",',
      '  "name": "Just Enough Items",',
      '  "aliases": [],',
      '  "links": {',
      '    "modrinth": "https://modrinth.com/mod/jei",',
      '    "source": "https://github.com/mezz/JustEnoughItems"',
      '  },',
      '  "updatedAt": "2026-10-01"',
      '}',
      '',
    ].join('\n');
    const after = before.replace(
      '    "modrinth": "https://modrinth.com/mod/jei",\n',
      `    "modrinth": "https://modrinth.com/mod/jei",\n    "curseforge": "${CF_JEI}",\n`,
    );
    const meta = JSON.parse(before) as Record<string, unknown>;
    expect(JSON.stringify(withCurseforgeLink(meta, CF_JEI), null, 2) + '\n').toBe(after);
  });

  it('appends after a trailing modrinth link and puts it first without one', () => {
    expect(withCurseforgeLink({ links: { modrinth: 'https://modrinth.com/mod/jei' } }, CF_JEI).links).toEqual({ modrinth: 'https://modrinth.com/mod/jei', curseforge: CF_JEI });
    expect(Object.keys(withCurseforgeLink({ links: { homepage: 'https://example.com' } }, CF_JEI).links as object)).toEqual(['curseforge', 'homepage']);
  });

  it('keeps a single curseforge entry and does not mutate the input', () => {
    const meta = { modId: 'jei', links: { curseforge: 'https://www.curseforge.com/minecraft/mc-mods/old', modrinth: 'https://modrinth.com/mod/jei' } };
    const copy = structuredClone(meta);
    expect(Object.entries(withCurseforgeLink(meta, CF_JEI).links as object)).toEqual([['modrinth', 'https://modrinth.com/mod/jei'], ['curseforge', CF_JEI]]);
    expect(meta).toEqual(copy);
  });
});
