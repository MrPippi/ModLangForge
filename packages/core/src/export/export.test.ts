import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { DetectedMod, ModProject } from '../types';
import { buildProject, mergeProject, updateEntry } from '../merge';
import { buildLangPairs, exportProjects, langFileName, PACK_FORMATS, type ExportOptions } from './index';

function project(modId: string, format: ModProject['format'] = 'json'): ModProject {
  const d: DetectedMod = {
    modId, name: modId, version: '1', jarName: `${modId}.jar`, format,
    source: { a: 'Apple', b: 'Banana' }, order: ['a', 'b'],
  };
  return updateEntry(buildProject(d, 1), 'a', '蘋果', 2);
}

const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  kind: 'merged-pack', untranslated: 'keep-source', mcVersion: '1.20.1', description: '測試', ...o,
});

async function unzip(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

async function text(zip: JSZip, path: string): Promise<string | undefined> {
  return zip.file(path)?.async('string');
}

describe('helpers', () => {
  it('langFileName by format', () => {
    expect(langFileName('json')).toBe('zh_tw.json');
    expect(langFileName('lang')).toBe('zh_TW.lang');
  });

  it('buildLangPairs keep-source fills source, skip drops untranslated', () => {
    const p = project('demo');
    expect(buildLangPairs(p, 'keep-source')).toEqual([['a', '蘋果'], ['b', 'Banana']]);
    expect(buildLangPairs(p, 'skip')).toEqual([['a', '蘋果']]);
  });

  it('buildLangPairs excludes obsolete entries', () => {
    const p = mergeProject(project('demo'), {
      modId: 'demo', name: 'demo', version: '2', jarName: 'demo.jar', format: 'json', source: { b: 'Banana' }, order: ['b'],
    }, 3);
    expect(buildLangPairs(p, 'keep-source')).toEqual([['b', 'Banana']]);
  });

  it('PACK_FORMATS contains 1.20.1 → 15', () => {
    expect(PACK_FORMATS.find((f) => f.mcVersion === '1.20.1')?.packFormat).toBe(15);
  });
});

describe('exportProjects', () => {
  it('rejects empty selection', async () => {
    await expect(exportProjects([], opts())).rejects.toThrow();
  });

  it('merged-pack contains pack.mcmeta and every mod lang file', async () => {
    const res = await exportProjects([project('a'), project('b', 'lang')], opts({ mcVersion: '1.21.1' }));
    expect(res.fileName).toBe('ModLangForge-zh_tw.zip');
    const zip = await unzip(res.blob);
    const meta = JSON.parse((await text(zip, 'pack.mcmeta')) ?? '{}');
    expect(meta).toEqual({ pack: { pack_format: 34, description: '測試' } });
    expect(JSON.parse((await text(zip, 'assets/a/lang/zh_tw.json')) ?? '{}')).toEqual({ a: '蘋果', b: 'Banana' });
    expect(await text(zip, 'assets/b/lang/zh_TW.lang')).toBe('a=蘋果\nb=Banana\n');
  });

  it('separate-packs nests one zip per mod', async () => {
    const res = await exportProjects([project('a'), project('b')], opts({ kind: 'separate-packs' }));
    expect(res.fileName).toBe('ModLangForge-packs.zip');
    const outer = await unzip(res.blob);
    const inner = await JSZip.loadAsync((await outer.file('b-zh_tw.zip')?.async('uint8array')) ?? new Uint8Array());
    expect(await text(inner, 'pack.mcmeta')).toContain('"pack_format": 15');
    expect(await text(inner, 'assets/b/lang/zh_tw.json')).toBeDefined();
  });

  it('lang-files with one mod downloads the file directly', async () => {
    const res = await exportProjects([project('a')], opts({ kind: 'lang-files', untranslated: 'skip' }));
    expect(res.fileName).toBe('zh_tw.json');
    expect(await res.blob.text()).toBe('{\n  "a": "蘋果"\n}\n');
  });

  it('lang-files with several mods zips them by modId', async () => {
    const res = await exportProjects([project('a'), project('b', 'lang')], opts({ kind: 'lang-files' }));
    expect(res.fileName).toBe('ModLangForge-lang.zip');
    const zip = await unzip(res.blob);
    expect(await text(zip, 'a/zh_tw.json')).toBeDefined();
    expect(await text(zip, 'b/zh_TW.lang')).toBeDefined();
  });

  it('unknown mc version falls back to default pack format', async () => {
    const res = await exportProjects([project('a')], opts({ mcVersion: '9.9' }));
    const meta = JSON.parse((await text(await unzip(res.blob), 'pack.mcmeta')) ?? '{}');
    expect(meta.pack.pack_format).toBe(15);
  });
});
