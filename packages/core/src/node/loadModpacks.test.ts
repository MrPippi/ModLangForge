import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../glossary';
import { formatModpackIssues, loadAllModpacks } from './loadModpacks';

const meta = (id: string) => ({
  id, name: id, summary: '測試整合包', authors: ['tester'],
  links: { modrinth: `https://modrinth.com/modpack/${id}` },
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.20.1', loader: 'forge' },
  mods: [],
  translation: { status: 'machine', license: 'CC-BY-SA-4.0', source: { name: 'test', url: null } },
  updatedAt: '2026-10-17',
});

let dir: string;

async function writePack(id: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([name, content]) => {
    const path = join(dir, 'modpacks', id, ...name.split('/'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-modpacks-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadAllModpacks', () => {
  it('returns nothing when data/modpacks does not exist', async () => {
    expect(await loadAllModpacks(dir)).toEqual({ modpacks: [], issues: [] });
  });

  it('loads modpacks sorted by id with KubeJS texts per namespace', async () => {
    await writePack('beta', { 'modpack.json': JSON.stringify(meta('beta')) });
    await writePack('alpha', {
      'modpack.json': JSON.stringify(meta('alpha')),
      'kubejs/kubejs/en_us.json': JSON.stringify({ a: 'Gear %s' }),
      'kubejs/kubejs/zh_tw.json': '﻿' + JSON.stringify({ a: '齒輪 %s' }),
      'kubejs/extra/en_us.json': JSON.stringify({ b: 'B' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(issues).toEqual([]);
    expect(modpacks.map((p) => p.meta.id)).toEqual(['alpha', 'beta']);
    expect(modpacks[0]?.kubejs).toEqual({
      extra: { en: { b: 'B' }, zh: {} },
      kubejs: { en: { a: 'Gear %s' }, zh: { a: '齒輪 %s' } },
    });
    expect(modpacks[1]?.kubejs).toEqual({});
  });

  it('reports broken, missing and mismatched modpack.json and skips the modpack', async () => {
    await writePack('broken', { 'modpack.json': '{' });
    await writePack('nometa', { 'kubejs/kubejs/en_us.json': '{}' });
    await writePack('wrong', { 'modpack.json': JSON.stringify(meta('other')) });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.modpackId, i.file, i.level])).toEqual([
      ['broken', 'modpack.json', 'error'],
      ['nometa', 'modpack.json', 'error'],
      ['wrong', 'modpack.json', 'error'],
    ]);
    expect(issues[0]?.message).toMatch(/^JSON 解析失敗：/);
    expect(issues[1]?.message).toBe('檔案不存在');
    expect(issues[2]?.message).toBe('id「other」與資料夾名稱「wrong」不一致');
  });

  it('rejects files outside namespace folders, invalid namespaces, missing English and extra files', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(meta('alpha')),
      'kubejs/notes.txt': 'x',
      'kubejs/Bad/en_us.json': '{}',
      'kubejs/kubejs/zh_tw.json': '{}',
      'kubejs/ok/en_us.json': '{}',
      'kubejs/ok/readme.md': 'x',
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.file, i.message])).toEqual([
      ['kubejs/notes.txt', 'kubejs/ 底下只能放命名空間資料夾'],
      ['kubejs/Bad', '命名空間只能包含 a-z 0-9 _ . -，且不可為 . 或 ..'],
      ['kubejs/kubejs/en_us.json', '檔案不存在'],
      ['kubejs/ok/readme.md', '只接受 en_us.json 與 zh_tw.json'],
    ]);
  });

  it('keeps modpacks that only have warnings, applying the glossary', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(meta('alpha')),
      'kubejs/kubejs/en_us.json': JSON.stringify({ a: 'Open %s', b: 'Redstone' }),
      'kubejs/kubejs/zh_tw.json': JSON.stringify({ a: '打開', b: '紅色' }),
    });
    const terms: GlossaryTerm[] = [{ en: 'Redstone', zh: '紅石', level: 'warning' }];
    const { modpacks, issues } = await loadAllModpacks(dir, terms);
    expect(modpacks.map((p) => p.meta.id)).toEqual(['alpha']);
    expect(issues).toEqual([
      { modpackId: 'alpha', level: 'warning', file: 'kubejs/kubejs/zh_tw.json', key: 'a', message: '格式碼不一致：缺少 %s' },
      { modpackId: 'alpha', level: 'warning', file: 'kubejs/kubejs/zh_tw.json', key: 'b', message: '術語「Redstone」應譯為「紅石」' },
    ]);
  });

  it('reports a KubeJS key that is not in en_us.json as an error', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(meta('alpha')),
      'kubejs/kubejs/en_us.json': JSON.stringify({ a: 'A' }),
      'kubejs/kubejs/zh_tw.json': JSON.stringify({ z: '孤兒' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues).toEqual([{ modpackId: 'alpha', level: 'error', file: 'kubejs/kubejs/zh_tw.json', key: 'z', message: 'en_us.json 中沒有此 key' }]);
  });
});

describe('formatModpackIssues', () => {
  it('formats GitHub annotations with data/modpacks/<id>/ paths', () => {
    expect(formatModpackIssues([
      { modpackId: 'alpha', level: 'error', file: 'kubejs/kubejs/zh_tw.json', key: 'a', message: 'm' },
      { modpackId: 'beta', level: 'warning', file: 'modpack.json', message: 'w' },
    ], 'data')).toEqual([
      '::error file=data/modpacks/alpha/kubejs/kubejs/zh_tw.json::[modpack:alpha] a：m',
      '::warning file=data/modpacks/beta/modpack.json::[modpack:beta] w',
    ]);
  });
});

const questMeta = (id: string, ftbquests?: unknown) => ({
  ...meta(id),
  source: { platform: 'modrinth', projectId: 'AbCd1234', version: '1.0.0', mcVersion: '1.21.1', loader: 'neoforge' },
  ...(ftbquests ? { ftbquests } : {}),
});
const TITLE = 'quest.44A5523F7A909209.title';
const SUPPORTED = { status: 'supported', layout: 'split' };

describe('loadAllModpacks: FTB quests', () => {
  it('loads quest texts with the layout from modpack.json', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: '&aWelcome' }),
      'ftbquests/zh_tw.json': '\uFEFF' + JSON.stringify({ [TITLE]: '&a歡迎' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(issues).toEqual([]);
    expect(modpacks[0]?.quests).toEqual({ layout: 'split', en: { [TITLE]: '&aWelcome' }, zh: { [TITLE]: '&a歡迎' } });
  });

  it('has no quests when modpack.json has no ftbquests field or marks the version unsupported', async () => {
    await writePack('alpha', { 'modpack.json': JSON.stringify(questMeta('alpha')) });
    await writePack('beta', { 'modpack.json': JSON.stringify({ ...meta('beta'), ftbquests: { status: 'unsupported-version' } }) });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(issues).toEqual([]);
    expect(modpacks.map((p) => [p.meta.id, p.quests])).toEqual([['alpha', undefined], ['beta', undefined]]);
  });

  it('reports a status that does not match the files and skips the modpack', async () => {
    await writePack('alpha', { 'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)) });
    await writePack('beta', {
      'modpack.json': JSON.stringify({ ...meta('beta'), ftbquests: { status: 'unsupported-version' } }),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi' }),
    });
    await writePack('gamma', { 'modpack.json': JSON.stringify(questMeta('gamma')), 'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi' }) });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.modpackId, i.file, i.message])).toEqual([
      ['alpha', 'ftbquests/en_us.json', 'modpack.json 的 ftbquests 為 supported，但沒有 ftbquests/en_us.json'],
      ['beta', 'modpack.json', 'ftbquests 為 unsupported-version 時不可有 ftbquests/ 資料夾'],
      ['gamma', 'modpack.json', '有 ftbquests/ 資料夾，但 modpack.json 沒有 ftbquests 欄位'],
    ]);
  });

  it('reports broken files, extra files, bad keys and unknown translations', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: 'Hi', 'task.5555555555555555.title': 'x' }),
      'ftbquests/zh_tw.json': JSON.stringify({ 'quest.1111111111111111.title': '孤兒' }),
      'ftbquests/notes.md': 'x',
    });
    await writePack('beta', { 'modpack.json': JSON.stringify(questMeta('beta', SUPPORTED)), 'ftbquests/en_us.json': '{' });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks).toEqual([]);
    expect(issues.map((i) => [i.modpackId, i.file, i.key, i.level])).toEqual([
      ['alpha', 'ftbquests/notes.md', undefined, 'error'],
      ['alpha', 'ftbquests/en_us.json', 'task.5555555555555555.title', 'error'],
      ['alpha', 'ftbquests/zh_tw.json', 'quest.1111111111111111.title', 'error'],
      ['beta', 'ftbquests/en_us.json', undefined, 'error'],
    ]);
    expect(issues[3]?.message).toMatch(/^JSON 解析失敗：/);
  });

  it('keeps modpacks whose quest texts only have warnings and formats ftbquests paths', async () => {
    await writePack('alpha', {
      'modpack.json': JSON.stringify(questMeta('alpha', SUPPORTED)),
      'ftbquests/en_us.json': JSON.stringify({ [TITLE]: '&aHi' }),
      'ftbquests/zh_tw.json': JSON.stringify({ [TITLE]: '嗨' }),
    });
    const { modpacks, issues } = await loadAllModpacks(dir);
    expect(modpacks.map((p) => p.meta.id)).toEqual(['alpha']);
    expect(formatModpackIssues(issues, 'data')).toEqual([
      `::warning file=data/modpacks/alpha/ftbquests/zh_tw.json::[modpack:alpha] ${TITLE}：格式碼不一致：缺少 &a`,
    ]);
  });
});
