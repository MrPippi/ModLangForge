import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatIssues, loadAllMods } from './loadData';

const meta = (modId: string) => ({
  modId,
  name: modId,
  summary: '測試模組',
  authors: ['tester'],
  links: { modrinth: `https://modrinth.com/mod/${modId}` },
  mcVersions: ['1.20.1'],
  sourceVersions: [{ mcVersion: '1.20.1', loader: 'forge' }],
  loaders: ['fabric'],
  format: 'json',
  translation: { status: 'partial', license: 'CC-BY-SA-4.0', source: { name: 'test', url: null } },
  updatedAt: '2026-10-15',
});

let dir: string;

async function writeMod(modId: string, files: Record<string, string>): Promise<void> {
  const modDir = join(dir, 'mods', modId);
  await mkdir(modDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(modDir, name), content, 'utf8')));
}

function validFiles(modId: string): Record<string, string> {
  return {
    'mod.json': JSON.stringify(meta(modId)),
    'en_us.json': JSON.stringify({ a: 'Apple %s', b: 'Banana' }),
    'zh_tw.json': JSON.stringify({ a: '蘋果 %s' }),
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-data-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadAllMods', () => {
  it('loads valid mods sorted by modId', async () => {
    await writeMod('beta', validFiles('beta'));
    await writeMod('alpha', validFiles('alpha'));
    const { mods, issues } = await loadAllMods(dir);
    expect(issues).toEqual([]);
    expect(mods.map((m) => m.meta.modId)).toEqual(['alpha', 'beta']);
    expect(mods[0]?.zh).toEqual({ a: '蘋果 %s' });
  });

  it('treats a missing zh_tw.json as empty', async () => {
    const { 'zh_tw.json': _omit, ...rest } = validFiles('alpha');
    await writeMod('alpha', rest);
    const { mods } = await loadAllMods(dir);
    expect(mods[0]?.zh).toEqual({});
  });

  it('reports missing mod.json and broken JSON as errors and skips the mod', async () => {
    const { 'mod.json': _m, ...noMeta } = validFiles('nometa');
    await writeMod('nometa', noMeta);
    await writeMod('broken', { ...validFiles('broken'), 'zh_tw.json': '{"a":' });
    await writeMod('ok', validFiles('ok'));
    const { mods, issues } = await loadAllMods(dir);
    expect(mods.map((m) => m.meta.modId)).toEqual(['ok']);
    expect(issues.filter((i) => i.level === 'error').map((i) => i.modId).sort()).toEqual(['broken', 'nometa']);
  });

  it('reports extra zh keys as errors and format mismatches as warnings', async () => {
    await writeMod('extra', { ...validFiles('extra'), 'zh_tw.json': JSON.stringify({ c: '多' }) });
    await writeMod('warn', { ...validFiles('warn'), 'zh_tw.json': JSON.stringify({ a: '蘋果' }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods.map((m) => m.meta.modId)).toEqual(['warn']);
    expect(issues.map((i) => [i.modId, i.level])).toEqual([['extra', 'error'], ['warn', 'warning']]);
  });

  it('reports an error when mods dir is missing', async () => {
    const result = await loadAllMods(join(dir, 'nope'));
    expect(result.mods).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ level: 'error', message: expect.stringContaining('找不到') })]);
  });
});

describe('formatIssues', () => {
  it('formats GitHub Actions annotations', () => {
    const lines = formatIssues(
      [{ modId: 'x', level: 'warning', file: 'zh_tw.json', key: 'a', message: 'm' }],
      'data',
    );
    expect(lines).toEqual(['::warning file=data/mods/x/zh_tw.json::[x] a：m']);
  });

  it('points builtin issues at data/builtin-mods/<modId>.json', () => {
    const lines = formatIssues([{ modId: 'x', level: 'error', file: 'builtin.json', message: 'bad' }], 'data');
    expect(lines).toEqual(['::error file=data/builtin-mods/x.json::[x] bad']);
  });
});

describe('glossary', () => {
  const writeGlobal = (content: string) => writeFile(join(dir, 'glossary.json'), content, 'utf8');
  const filesWith = (modId: string, zh: Record<string, string>, extra: Record<string, string> = {}) => ({
    ...validFiles(modId),
    'en_us.json': JSON.stringify({ a: 'Redstone Dust', b: 'Shaft' }),
    'zh_tw.json': JSON.stringify(zh),
    ...extra,
  });

  it('treats a missing global glossary as empty', async () => {
    await writeMod('alpha', validFiles('alpha'));
    const result = await loadAllMods(dir);
    expect(result.issues).toEqual([]);
    expect(result.glossary).toEqual([]);
    expect(result.mods[0]?.glossary).toEqual([]);
  });

  it('warns when a translation ignores a global term', async () => {
    await writeGlobal(JSON.stringify({ terms: [{ en: 'Redstone', zh: '紅石' }] }));
    await writeMod('alpha', filesWith('alpha', { a: '紅色粉末' }));
    const result = await loadAllMods(dir);
    expect(result.issues).toEqual([
      { modId: 'alpha', level: 'warning', file: 'zh_tw.json', key: 'a', message: '術語「Redstone」應譯為「紅石」' },
    ]);
    expect(result.glossary).toEqual([{ en: 'Redstone', zh: '紅石', level: 'warning' }]);
  });

  it('lets a module glossary override the global one and exposes module terms', async () => {
    await writeGlobal(JSON.stringify({ terms: [{ en: 'Shaft', zh: '軸' }] }));
    await writeMod('alpha', filesWith('alpha', { b: '傳動軸' }, { 'glossary.json': JSON.stringify({ terms: [{ en: 'Shaft', zh: '傳動軸' }] }) }));
    const result = await loadAllMods(dir);
    expect(result.issues).toEqual([]);
    expect(result.mods[0]?.glossary).toEqual([{ en: 'Shaft', zh: '傳動軸', level: 'warning' }]);
  });

  it('reports an invalid global glossary under (glossary) and skips term checks', async () => {
    await writeGlobal(JSON.stringify({ terms: [{ en: 'Redstone' }] }));
    await writeMod('alpha', filesWith('alpha', { a: '紅色粉末' }));
    const result = await loadAllMods(dir);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ modId: '(glossary)', level: 'error', file: 'glossary.json' });
    expect(result.glossary).toEqual([]);
    expect(formatIssues(result.issues, 'data')[0]).toMatch(/^::error file=data\/glossary\.json::\[\(glossary\)\]/);
  });

  it('excludes a mod whose glossary is invalid', async () => {
    await writeMod('alpha', filesWith('alpha', {}, { 'glossary.json': '{ broken' }));
    const result = await loadAllMods(dir);
    expect(result.mods).toEqual([]);
    expect(result.issues[0]).toMatchObject({ modId: 'alpha', level: 'error', file: 'glossary.json' });
  });
});

describe('patchouli guides', () => {
  const INTRO = JSON.stringify({ name: 'Intro', pages: [{ type: 'patchouli:text', text: 'Open $(br)now' }] });
  const RAW = 'patchouli/guide/en_us/entries/intro.json';

  async function writeFiles(modId: string, files: Record<string, string>): Promise<void> {
    const modDir = join(dir, 'mods', modId);
    await Promise.all(Object.entries(files).map(async ([name, content]) => {
      const path = join(modDir, ...name.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
    }));
  }

  it('loads raw guide files, flattened English and translations', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#name': '簡介' }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(issues).toEqual([]);
    expect(mods[0]?.guide).toEqual({
      files: { 'guide/en_us/entries/intro.json': INTRO },
      en: { 'guide/entries/intro.json#name': 'Intro', 'guide/entries/intro.json#pages/0/text': 'Open $(br)now' },
      zh: { 'guide/entries/intro.json#name': '簡介' },
    });
  });

  it('treats a guide without translations as untranslated and mods without guides as before', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO });
    await writeMod('beta', validFiles('beta'));
    const { mods } = await loadAllMods(dir);
    expect(mods[0]?.guide?.zh).toEqual({});
    expect(mods[1]).not.toHaveProperty('guide');
  });

  it('treats a guide without any extractable text as having no guide', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: JSON.stringify({ icon: 'minecraft:book', pages: [{ type: 'patchouli:image' }] }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(issues).toEqual([]);
    expect(mods[0]).not.toHaveProperty('guide');
  });

  it('rejects broken guide files and reports the path under patchouli/', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: '{"name":' });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods).toEqual([]);
    expect(formatIssues(issues, 'data')[0]).toMatch(/^::error file=data\/mods\/alpha\/patchouli\/guide\/en_us\/entries\/intro\.json::\[alpha\] JSON 解析失敗/);
  });

  it('rejects unknown keys, translations without raw files, and warns about format codes', async () => {
    await writeMod('bad', validFiles('bad'));
    await writeFiles('bad', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/missing.json#name': 'x' }) });
    await writeMod('orphan', validFiles('orphan'));
    await writeFiles('orphan', { 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#name': '簡介' }) });
    await writeMod('warn', validFiles('warn'));
    await writeFiles('warn', { [RAW]: INTRO, 'patchouli_zh_tw.json': JSON.stringify({ 'guide/entries/intro.json#pages/0/text': '立即打開' }) });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods.map((m) => m.meta.modId)).toEqual(['warn']);
    expect(issues).toEqual([
      { modId: 'bad', level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/missing.json#name', message: '手冊原文中沒有此 key' },
      { modId: 'orphan', level: 'error', file: 'patchouli_zh_tw.json', key: 'guide/entries/intro.json#name', message: '手冊原文中沒有此 key' },
      { modId: 'warn', level: 'warning', file: 'patchouli_zh_tw.json', key: 'guide/entries/intro.json#pages/0/text', message: '格式碼不一致：缺少 $(br)' },
    ]);
  });

  it('reports a broken patchouli_zh_tw.json', async () => {
    await writeMod('alpha', validFiles('alpha'));
    await writeFiles('alpha', { [RAW]: INTRO, 'patchouli_zh_tw.json': '{' });
    const { mods, issues } = await loadAllMods(dir);
    expect(mods).toEqual([]);
    expect(issues[0]).toMatchObject({ modId: 'alpha', level: 'error', file: 'patchouli_zh_tw.json' });
  });
});
