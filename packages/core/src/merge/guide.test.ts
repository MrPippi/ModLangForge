import { describe, expect, it } from 'vitest';
import { catalogModSchema } from '../catalog/schema';
import { catalogToProject } from '../catalog/toProject';
import type { DetectedMod, GuideFiles } from '../types';
import { buildProject, guideStats, mergeProject, projectStats, updateEntry } from './index';

const PATH = 'guide/en_us/entries/intro.json';
const K = {
  name: 'guide/entries/intro.json#name',
  text: 'guide/entries/intro.json#pages/0/text',
  title: 'guide/entries/intro.json#pages/1/title',
  second: 'guide/entries/intro.json#pages/1/text',
};

function guideFiles(text: string, secondPage = true): GuideFiles {
  const pages = [{ type: 'patchouli:text', text }, ...(secondPage ? [{ type: 'patchouli:text', title: 'More', text: 'Second' }] : [])];
  return { [PATH]: JSON.stringify({ name: 'Intro', pages }) };
}

function detected(files?: GuideFiles): DetectedMod {
  return {
    modId: 'demo', name: 'Demo', version: '1.0', jarName: 'demo.jar', format: 'json',
    source: { a: 'Apple' }, order: ['a'],
    ...(files ? { guide: { files, skipped: [] } } : {}),
  };
}

const rows = (entries: readonly { key: string; target: string; status: string }[] | undefined) =>
  entries?.map((e) => [e.key, e.target, e.status]);

describe('buildProject guide', () => {
  it('creates untranslated guide entries in flatten order', () => {
    const p = buildProject(detected(guideFiles('Hello')), 1);
    expect(p.guide?.files).toEqual(guideFiles('Hello'));
    expect(rows(p.guide?.entries)).toEqual([
      [K.name, '', 'untranslated'], [K.text, '', 'untranslated'], [K.title, '', 'untranslated'], [K.second, '', 'untranslated'],
    ]);
    expect(p.entries.map((e) => e.key)).toEqual(['a']);
  });

  it('omits the guide when its files contain no extractable text', () => {
    const imageOnly = { 'guide/en_us/entries/pic.json': JSON.stringify({ icon: 'minecraft:book', pages: [{ type: 'patchouli:image' }] }) };
    expect(buildProject(detected(imageOnly), 1)).not.toHaveProperty('guide');
  });

  it('omits the guide when the jar has none or every book was skipped', () => {
    expect(buildProject(detected(), 1)).not.toHaveProperty('guide');
    const skippedOnly: DetectedMod = { ...detected(), guide: { files: {}, skipped: [{ book: 'guide', reason: 'x' }] } };
    expect(buildProject(skippedOnly, 1)).not.toHaveProperty('guide');
  });
});

describe('updateEntry sections', () => {
  const p = buildProject(detected(guideFiles('Hello')), 1);

  it('updates guide entries only when asked for the guide section', () => {
    const next = updateEntry(p, K.name, '簡介', 5, 'guide');
    expect(next.guide?.entries[0]).toMatchObject({ target: '簡介', status: 'translated' });
    expect(next.entries).toBe(p.entries);
    expect(next.updatedAt).toBe(5);
    expect(p.guide?.entries[0]?.target).toBe('');
  });

  it('keeps sections apart and leaves projects without a guide unchanged', () => {
    expect(updateEntry(p, K.name, '簡介', 5)).toBe(p);
    expect(updateEntry(p, 'a', '蘋果', 5, 'guide')).toBe(p);
    const plain = buildProject(detected(), 1);
    expect(updateEntry(plain, K.name, '簡介', 5, 'guide')).toBe(plain);
  });
});

describe('mergeProject guide', () => {
  const base = updateEntry(updateEntry(buildProject(detected(guideFiles('Hello')), 1), K.name, '簡介', 2, 'guide'), K.second, '第二頁', 2, 'guide');

  it('keeps unchanged text, clears changed text and marks removed pages obsolete', () => {
    const merged = mergeProject(base, detected(guideFiles('Hello world', false)), 3);
    expect(merged.guide?.files).toEqual(guideFiles('Hello world', false));
    expect(rows(merged.guide?.entries)).toEqual([
      [K.name, '簡介', 'translated'],
      [K.text, '', 'new'],
      [K.title, '', 'obsolete'],
      [K.second, '第二頁', 'obsolete'],
    ]);
  });

  it('marks every guide entry obsolete, keeping translations, when the new jar has no guide', () => {
    const merged = mergeProject(base, detected(), 3);
    expect(merged.guide?.files).toEqual({});
    expect(merged.guide?.entries.every((e) => e.status === 'obsolete')).toBe(true);
    expect(merged.guide?.entries.find((e) => e.key === K.name)?.target).toBe('簡介');
  });

  it('marks a newly added guide as new and leaves guide-less merges without a guide', () => {
    const merged = mergeProject(buildProject(detected(), 1), detected(guideFiles('Hello', false)), 3);
    expect(rows(merged.guide?.entries)).toEqual([[K.name, '', 'new'], [K.text, '', 'new']]);
    expect(mergeProject(buildProject(detected(), 1), detected(), 3)).not.toHaveProperty('guide');
  });

  it('does not mutate the existing project', () => {
    const snapshot = JSON.stringify(base);
    mergeProject(base, detected(guideFiles('Changed', false)), 3);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('guideStats', () => {
  it('returns null without a guide and counts Patchouli format warnings', () => {
    expect(guideStats(buildProject(detected(), 1))).toBeNull();
    let p = buildProject(detected(guideFiles('Use $(item)Wrench$()', false)), 1);
    p = updateEntry(p, K.text, '使用扳手', 2, 'guide');
    expect(guideStats(p)).toEqual({ total: 2, translated: 1, warnings: 1, percent: 50 });
    expect(projectStats(p)).toEqual({ total: 1, translated: 0, warnings: 0, percent: 0 });
  });
});

describe('catalogToProject guide', () => {
  const meta = catalogModSchema.parse({
    modId: 'demo', name: 'Demo', summary: '示範', authors: ['x'], links: { modrinth: 'https://modrinth.com/mod/demo' },
    mcVersions: ['1.20.1'], loaders: ['forge'], format: 'json', sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
    translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'x', url: null } }, updatedAt: '2026-10-15',
  });

  it('builds guide entries from raw files and flattened translations', () => {
    const p = catalogToProject(meta, { a: 'Apple' }, {}, { files: guideFiles('Hello', false), zh: { [K.name]: '簡介' } });
    expect(rows(p.guide?.entries)).toEqual([[K.name, '簡介', 'translated'], [K.text, '', 'untranslated']]);
    expect(catalogToProject(meta, { a: 'Apple' }, {})).not.toHaveProperty('guide');
  });
});
