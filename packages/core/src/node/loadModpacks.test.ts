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
