import { describe, expect, it } from 'vitest';
import { buildCommitMessage, mergeContributors, pickWinners, taipeiDate, type ApprovedChange } from './index';

const change = (over: Partial<ApprovedChange> = {}): ApprovedChange => ({
  id: 1, modId: 'create', key: 'a', baseTarget: '蘋果', proposed: '紅蘋果', reviewedAt: '2026-10-15T00:00:00.000Z', creditName: null, ...over,
});

describe('mergeContributors', () => {
  it('appends new names in order, dedupes and skips blanks', () => {
    expect(mergeContributors(['原譯者', 'Alice'], ['Bob', null, 'Alice', ' ', 'Bob', ' Carol '])).toEqual(['原譯者', 'Alice', 'Bob', 'Carol']);
  });

  it('returns a copy when nothing is added', () => {
    const existing = ['A'];
    const merged = mergeContributors(existing, []);
    expect(merged).toEqual(['A']);
    expect(merged).not.toBe(existing);
  });
});

describe('taipeiDate', () => {
  it('uses UTC+8', () => {
    expect(taipeiDate(new Date('2026-10-15T15:59:59.000Z'))).toBe('2026-10-15');
    expect(taipeiDate(new Date('2026-10-15T16:00:00.000Z'))).toBe('2026-10-16');
  });
});

describe('buildCommitMessage', () => {
  it('lists counts, mods, statuses and contributors', () => {
    expect(buildCommitMessage({
      perMod: [{ modId: 'create', count: 2 }, { modId: 'jei', count: 1 }],
      statuses: [{ modId: 'create', status: 'reviewed' }],
      contributors: ['Alice', 'Bob'],
    })).toBe([
      'chore(data): publish 3 reviewed translations',
      '',
      'Mods: create (2), jei (1)',
      'Status: create -> reviewed',
      'Contributors: Alice, Bob',
      '',
      'Published from the ModLangForge review queue.',
    ].join('\n'));
  });

  it('uses a status-only title and singular wording', () => {
    expect(buildCommitMessage({ perMod: [], statuses: [{ modId: 'jei', status: 'partial' }], contributors: [] }).split('\n')[0])
      .toBe('chore(data): update translation status');
    expect(buildCommitMessage({ perMod: [{ modId: 'jei', count: 1 }], statuses: [], contributors: [] }).split('\n')[0])
      .toBe('chore(data): publish 1 reviewed translation');
  });
});

describe('pickWinners', () => {
  it('keeps the latest approval per mod/key and supersedes the rest', () => {
    const result = pickWinners([
      change({ id: 1, reviewedAt: '2026-10-15T02:00:00.000Z' }),
      change({ id: 2, reviewedAt: '2026-10-15T01:00:00.000Z' }),
      change({ id: 3, key: 'b' }),
      change({ id: 4, modId: 'jei' }),
    ]);
    expect(result.winners.map((c) => c.id)).toEqual([1, 3, 4]);
    expect(result.superseded).toEqual([2]);
  });

  it('breaks reviewedAt ties by the higher id', () => {
    expect(pickWinners([change({ id: 5 }), change({ id: 6 })]).winners.map((c) => c.id)).toEqual([6]);
  });
});
