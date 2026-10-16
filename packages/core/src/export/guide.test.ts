import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildProject, mergeProject, updateEntry } from '../merge';
import type { DetectedMod, GuideFiles, ModProject } from '../types';
import { buildGuidePackFiles, exportProjects, guideTranslations, type ExportOptions } from './index';

const INTRO = 'guide/en_us/entries/intro.json';
const BASICS = 'guide/en_us/categories/basics.json';
const INTRO_TEXT = JSON.stringify({ name: 'Intro', icon: 'minecraft:book', pages: [{ type: 'patchouli:text', text: 'Hello' }] });
const BASICS_TEXT = JSON.stringify({ name: 'Basics', description: 'All basics' });
const FILES: GuideFiles = { [INTRO]: INTRO_TEXT, [BASICS]: BASICS_TEXT };
const PACK_INTRO = 'assets/demo/patchouli_books/guide/zh_tw/entries/intro.json';

function detected(files: GuideFiles = FILES): DetectedMod {
  return { modId: 'demo', name: 'demo', version: '1', jarName: 'demo.jar', format: 'json', source: { a: 'Apple' }, order: ['a'], guide: { files, skipped: [] } };
}

const project = (): ModProject => updateEntry(buildProject(detected(), 1), 'guide/entries/intro.json#pages/0/text', '你好', 2, 'guide');

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.20.1', description: '測試', ...o,
});

const parsed = (pairs: [string, string][]) => Object.fromEntries(pairs.map(([path, text]) => [path, JSON.parse(text) as unknown]));

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('guideTranslations', () => {
  it('keeps translated, non-obsolete guide entries only', () => {
    expect(guideTranslations(project())).toEqual({ 'guide/entries/intro.json#pages/0/text': '你好' });
    expect(guideTranslations(mergeProject(project(), detected({ [BASICS]: BASICS_TEXT }), 3))).toEqual({});
  });
});

describe('buildGuidePackFiles', () => {
  it('writes only files with at least one translation, keeping English inside them', () => {
    expect(parsed(buildGuidePackFiles(project()))).toEqual({
      [PACK_INTRO]: { name: 'Intro', icon: 'minecraft:book', pages: [{ type: 'patchouli:text', text: '你好' }] },
    });
  });

  it('writes nothing when no guide text is translated', () => {
    expect(buildGuidePackFiles(buildProject(detected(), 1))).toEqual([]);
  });

  it('splits keys at the last # so files are matched reliably', () => {
    const files = { 'guide/en_us/entries/a.json': JSON.stringify({ name: 'A' }) };
    const p = updateEntry(buildProject(detected(files), 1), 'guide/entries/a.json#name', '甲', 2, 'guide');
    expect(buildGuidePackFiles(p).map(([path]) => path)).toEqual(['assets/demo/patchouli_books/guide/zh_tw/entries/a.json']);
  });

  it('returns nothing for projects without a guide', () => {
    const { guide: _g, ...plain } = detected();
    expect(buildGuidePackFiles(buildProject(plain, 1))).toEqual([]);
  });
});

describe('exportProjects with guides', () => {
  it('adds guide files to merged and separate packs', async () => {
    const merged = await unzip((await exportProjects([project()], opts())).blob);
    expect(JSON.parse((await merged.file(PACK_INTRO)?.async('string')) ?? '{}').pages[0].text).toBe('你好');
    expect(merged.file('assets/demo/lang/zh_tw.json')).not.toBeNull();

    const outer = await unzip((await exportProjects([project()], opts({ kind: 'separate-packs' }))).blob);
    const inner = await JSZip.loadAsync((await outer.file('demo-zh_tw.zip')?.async('uint8array')) ?? new Uint8Array());
    expect(inner.file(PACK_INTRO)).not.toBeNull();
  });

  it('never puts guide files into lang-file exports', async () => {
    const single = await exportProjects([project()], opts({ kind: 'lang-files' }));
    expect(single.fileName).toBe('zh_tw.json');
    expect(await single.blob.text()).toBe('{\n  "a": "Apple"\n}\n');
    const other: ModProject = { ...project(), id: 'other', modId: 'other' };
    const zip = await unzip((await exportProjects([project(), other], opts({ kind: 'lang-files' }))).blob);
    expect(Object.keys(zip.files).filter((p) => p.includes('patchouli'))).toEqual([]);
  });
});
