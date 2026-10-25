import { describe, expect, it } from 'vitest';
import { buildChangelog, compareMcDesc, formatChangelogDate } from './changelog';

const day = (date: string, over: Partial<Record<'added' | 'removed' | 'translated' | 'updated', string[]>> & { newMc?: { modId: string; mcVersions: string[] }[] } = {}) => ({
  date, added: [], removed: [], translated: [], newMc: [], updated: [], ...over,
});

describe('compareMcDesc', () => {
  it('orders versions newest first', () => {
    expect(['1.21.1', '26.1', '1.21.11', '26.1.2'].sort(compareMcDesc)).toEqual(['26.1.2', '26.1', '1.21.11', '1.21.1']);
  });
});

describe('buildChangelog', () => {
  const names = new Map([['jei', 'Just Enough Items'], ['ae2', 'Applied Energistics 2']]);

  it('merges site and translation entries by date, newest first', () => {
    const result = buildChangelog(
      [{ date: '2026-10-20', title: '新功能', items: [] }, { date: '2026-10-25', title: '日誌', items: ['a'] }],
      [day('2026-10-20', { translated: ['jei'] })],
      names,
    );
    expect(result.map((d) => [d.date, d.site.map((e) => e.title), d.translation !== null])).toEqual([
      ['2026-10-25', ['日誌'], false],
      ['2026-10-20', ['新功能'], true],
    ]);
  });

  it('links current mods by name and leaves removed ones unlinked', () => {
    const [result] = buildChangelog([], [day('2026-10-20', { added: ['jei', 'ae2'], removed: ['gone'] })], names);
    expect(result?.translation?.added.map((m) => [m.name, m.href])).toEqual([
      ['Applied Energistics 2', '/mods/ae2/'],
      ['Just Enough Items', '/mods/jei/'],
    ]);
    expect(result?.translation?.removed).toEqual([{ modId: 'gone', name: 'gone', href: null }]);
  });

  it('groups new Minecraft versions by version', () => {
    const [result] = buildChangelog([], [day('2026-10-20', { newMc: [
      { modId: 'jei', mcVersions: ['26.1', '1.21.11'] },
      { modId: 'ae2', mcVersions: ['26.1'] },
    ] })], names);
    expect(result?.translation?.newMc.map((g) => [g.mcVersion, g.mods.map((m) => m.modId)])).toEqual([
      ['26.1', ['ae2', 'jei']],
      ['1.21.11', ['jei']],
    ]);
  });
});

describe('formatChangelogDate', () => {
  it('formats in Chinese without leading zeros', () => {
    expect(formatChangelogDate('2026-10-05')).toBe('2026 年 10 月 5 日');
  });
});
