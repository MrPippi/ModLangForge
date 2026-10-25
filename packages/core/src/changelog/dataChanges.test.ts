import { describe, expect, it } from 'vitest';
import { type DataCommit, groupByDay, taipeiDate, toTranslationDay, translationChangelogSchema, versionChanges } from './index';

const commit = (hash: string, parent: string | null, date: string, files: DataCommit['files']): DataCommit => ({ hash, parent, date, files });

describe('taipeiDate', () => {
  it('converts to the Taipei calendar day', () => {
    expect(taipeiDate('2026-10-24T18:39:51Z')).toBe('2026-10-25');
    expect(taipeiDate('2026-10-25T02:39:51+08:00')).toBe('2026-10-25');
  });
});

describe('groupByDay', () => {
  it('groups by date newest first and spans the day from the first parent to the last commit', () => {
    const days = groupByDay([
      commit('a', null, '2026-10-01', [{ status: 'A', path: 'data/mods/jei/mod.json' }]),
      commit('b', 'a', '2026-10-02', [{ status: 'M', path: 'data/mods/jei/zh_tw.json' }]),
      commit('c', 'b', '2026-10-02', [{ status: 'M', path: 'data/mods/jei/mod.json' }]),
    ]);
    expect(days.map((d) => [d.date, d.before, d.after])).toEqual([['2026-10-02', 'a', 'c'], ['2026-10-01', null, 'a']]);
    expect(days[0]).toMatchObject({ translated: ['jei'], metaChanged: ['jei'], added: [] });
  });

  it('counts a new mod only as added, and builtin entries as added or removed', () => {
    const [day] = groupByDay([
      commit('a', 'z', '2026-10-01', [
        { status: 'A', path: 'data/mods/ae2/mod.json' },
        { status: 'A', path: 'data/mods/ae2/zh_tw.json' },
        { status: 'A', path: 'data/builtin-mods/appleskin.json' },
        { status: 'D', path: 'data/builtin-mods/old.json' },
      ]),
    ]);
    expect(day).toMatchObject({ added: ['ae2', 'appleskin'], removed: ['old'], translated: [], metaChanged: [] });
  });

  it('treats a mod moved to a builtin entry on the same day as neither added nor removed', () => {
    const [day] = groupByDay([
      commit('a', 'z', '2026-10-01', [
        { status: 'D', path: 'data/mods/jade/mod.json' },
        { status: 'D', path: 'data/mods/jade/zh_tw.json' },
        { status: 'A', path: 'data/builtin-mods/jade.json' },
      ]),
    ]);
    expect(day).toMatchObject({ added: [], removed: [], translated: [] });
  });

  it('counts guide translations and ignores English-only changes', () => {
    const [day] = groupByDay([
      commit('a', 'z', '2026-10-01', [
        { status: 'M', path: 'data/mods/ars/guide/patchouli_zh_tw.json' },
        { status: 'M', path: 'data/mods/create/en_us.json' },
        { status: 'M', path: 'data/glossary.json' },
      ]),
    ]);
    expect(day).toMatchObject({ translated: ['ars'], metaChanged: [] });
  });
});

describe('versionChanges', () => {
  const info = (mc: string[], rows: [string, string][]) => ({ mcVersions: mc, sourceVersions: rows.map(([mcVersion, modVersion]) => ({ mcVersion, modVersion })) });

  it('reports new Minecraft versions', () => {
    expect(versionChanges(info(['1.21.1'], [['1.21.1', '1']]), info(['1.21.4', '1.21.1'], [['1.21.4', '2'], ['1.21.1', '1']])))
      .toEqual({ newMc: ['1.21.4'], updated: true });
  });

  it('reports a newer mod version on a known Minecraft version', () => {
    expect(versionChanges(info(['1.21.1'], [['1.21.1', '1']]), info(['1.21.1'], [['1.21.1', '2']]))).toEqual({ newMc: [], updated: true });
  });

  it('reports nothing when rows are only regrouped', () => {
    expect(versionChanges(info(['1.21.1'], [['1.21.1', '1']]), info(['1.21.1'], [['1.21.1', '1']]))).toEqual({ newMc: [], updated: false });
  });
});

describe('toTranslationDay', () => {
  const base = { date: '2026-10-02', before: 'a', after: 'b', added: [], removed: [], translated: [], metaChanged: ['jei', 'ae2', 'gone'] };
  const v = (mc: string[], modVersion: string) => ({ mcVersions: mc, sourceVersions: [{ mcVersion: mc[0] ?? '', modVersion }] });

  it('splits meta changes into new Minecraft versions and mod updates', () => {
    const day = toTranslationDay(base, new Map([
      ['jei', { before: v(['1.21.1'], '1'), after: v(['1.21.4', '1.21.1'], '2') }],
      ['ae2', { before: v(['1.21.1'], '1'), after: v(['1.21.1'], '2') }],
    ]));
    expect(day).toEqual({ date: '2026-10-02', added: [], removed: [], translated: [], newMc: [{ modId: 'jei', mcVersions: ['1.21.4'] }], updated: ['ae2'] });
    expect(translationChangelogSchema.parse({ version: 1, days: [day] }).days).toHaveLength(1);
  });

  it('returns null when nothing is worth listing', () => {
    expect(toTranslationDay(base, new Map([['jei', { before: v(['1.21.1'], '1'), after: v(['1.21.1'], '1') }]]))).toBeNull();
  });
});
