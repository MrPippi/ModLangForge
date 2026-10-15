import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
