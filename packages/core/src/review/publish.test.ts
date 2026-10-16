import { describe, expect, it } from 'vitest';
import { applyToMod, buildCommitMessage, mergeContributors, pickWinners, planPublish, PublishValidationError, taipeiDate, type ApprovedChange, type ModFiles, type StatusChange } from './index';

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


const META = {
  modId: 'create', name: 'Create', aliases: [], summary: '機械動力。', authors: ['simibubi'],
  links: { modrinth: 'https://modrinth.com/mod/create' },
  sourceVersions: [{ modVersion: '6.0.0', mcVersion: '1.21.1', loader: 'neoforge', missingKeys: [] }],
  mcVersions: ['1.21.1'], loaders: ['neoforge'], format: 'json',
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'Claude 機器翻譯', url: null }, contributors: ['原譯者'] },
  updatedAt: '2026-10-01',
};

const files = (over: Partial<ModFiles> = {}): ModFiles => ({
  en: '{\n  "b": "Banana",\n  "10": "Ten",\n  "a": "Apple",\n  "old": "Old"\n}\n',
  zh: '{\n  "b": "香蕉",\n  "a": "蘋果"\n}\n',
  meta: `${JSON.stringify(META, null, 2)}\n`,
  ...over,
});

const TODAY = '2026-10-16';
const status = (over: Partial<StatusChange> = {}): StatusChange => ({ id: 1, modId: 'create', status: 'reviewed', createdAt: '2026-10-15T00:00:00.000Z', ...over });
const byPath = (out: { files: readonly { path: string; content: string }[] }, name: string) => out.files.find((f) => f.path === `data/mods/create/${name}`)?.content;

describe('applyToMod', () => {
  it('applies a matching change in en_us key order, keeping integer keys in place', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: '10', baseTarget: null, proposed: '十' }), change({ id: 2, key: 'a', proposed: '紅蘋果', creditName: 'Alice' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'applied' }, { id: 2, outcome: 'applied' }]);
    expect(byPath(out, 'zh_tw.json')).toBe('{\n  "b": "香蕉",\n  "10": "十",\n  "a": "紅蘋果"\n}\n');
    const meta = JSON.parse(byPath(out, 'mod.json') ?? '{}');
    expect(meta.translation.contributors).toEqual(['原譯者', 'Alice']);
    expect(meta.translation.status).toBe('machine');
    expect(meta.updatedAt).toBe(TODAY);
    expect(meta.sourceVersions).toEqual(META.sourceVersions);
    expect(Object.keys(meta)).toEqual(Object.keys(META));
  });

  it('marks a conflict when the repo value differs from base_target', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: 'a', baseTarget: '舊蘋果' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'conflict' }]);
    expect(out.files).toEqual([]);
  });

  it('marks superseded when the repo already holds the proposal', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key: 'a', baseTarget: '舊', proposed: '蘋果' })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'superseded' }]);
    expect(out.files).toEqual([]);
  });

  it.each(['gone', 'constructor', '__proto__'])('marks a conflict when key %s is not in en_us', (key) => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [change({ key, baseTarget: null })], status: null, today: TODAY });
    expect(out.results).toEqual([{ id: 1, outcome: 'conflict' }]);
  });

  it('writes only mod.json for a status-only change', () => {
    const out = applyToMod({ modId: 'create', files: files(), changes: [], status: status(), today: TODAY });
    expect(out.files.map((f) => f.path)).toEqual(['data/mods/create/mod.json']);
    const meta = JSON.parse(byPath(out, 'mod.json') ?? '{}');
    expect(meta.translation.status).toBe('reviewed');
    expect(meta.translation.contributors).toEqual(['原譯者']);
  });

  it('throws PublishValidationError when the result is invalid', () => {
    const broken = files({ meta: JSON.stringify({ ...META, sourceVersions: [] }) });
    expect(() => applyToMod({ modId: 'create', files: broken, changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
  });

  it('throws PublishValidationError for unparsable repo files', () => {
    expect(() => applyToMod({ modId: 'create', files: files({ zh: '{oops' }), changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
    expect(() => applyToMod({ modId: 'create', files: files({ meta: '[]' }), changes: [change({ key: 'a' })], status: null, today: TODAY })).toThrow(PublishValidationError);
  });
});

describe('planPublish', () => {
  it('combines winners, superseded duplicates, missing mods, statuses and the message', () => {
    const plan = planPublish({
      mods: { create: files(), ghost: null },
      changes: [
        change({ id: 1, key: 'a', proposed: '青蘋果', reviewedAt: '2026-10-15T01:00:00.000Z', creditName: 'Bob' }),
        change({ id: 2, key: 'a', proposed: '紅蘋果', reviewedAt: '2026-10-15T02:00:00.000Z', creditName: 'Alice' }),
        change({ id: 3, modId: 'ghost', key: 'x' }),
      ],
      statusChanges: [status({ id: 7 }), status({ id: 8, status: 'partial', createdAt: '2026-10-15T05:00:00.000Z' }), status({ id: 9, modId: 'ghost' })],
      today: TODAY,
    });
    expect(plan.results).toEqual(expect.arrayContaining([{ id: 1, outcome: 'superseded' }, { id: 2, outcome: 'applied' }, { id: 3, outcome: 'conflict' }]));
    expect(plan.results).toHaveLength(3);
    expect(plan.appliedStatusChangeIds).toEqual([7, 8]);
    expect(plan.files.map((f) => f.path)).toEqual(['data/mods/create/zh_tw.json', 'data/mods/create/mod.json']);
    expect(JSON.parse(plan.files[1]?.content ?? '{}').translation.status).toBe('partial');
    expect(plan.message).toContain('Mods: create (1)');
    expect(plan.message).toContain('Status: create -> partial');
    expect(plan.message).toContain('Contributors: Alice');
  });

  it('produces no files when nothing applies', () => {
    const plan = planPublish({ mods: { create: files() }, changes: [change({ key: 'a', baseTarget: 'x' })], statusChanges: [], today: TODAY });
    expect(plan.files).toEqual([]);
    expect(plan.results).toEqual([{ id: 1, outcome: 'conflict' }]);
  });
});

describe('applyToMod no-op', () => {
  it('drops files whose content equals the input', () => {
    const reviewed = { ...META, translation: { ...META.translation, status: 'reviewed' } };
    const out = applyToMod({ modId: 'create', files: files({ meta: `${JSON.stringify(reviewed, null, 2)}
` }), changes: [], status: status(), today: META.updatedAt });
    expect(out.files).toEqual([]);
  });
});
