import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAllBuiltinMods } from './loadBuiltin';

const entry = (modId: string) => ({
  modId,
  name: modId,
  summary: '測試模組',
  authors: ['tester'],
  links: { modrinth: `https://modrinth.com/mod/${modId}` },
  mcVersions: ['1.20.1'],
  loaders: ['fabric'],
  checkedVersion: { modVersion: '1.0.0', mcVersion: '1.20.1', loader: 'fabric' },
  updatedAt: '2026-10-17',
});

let dir: string;

async function writeEntry(fileName: string, content: string): Promise<void> {
  await mkdir(join(dir, 'builtin-mods'), { recursive: true });
  await writeFile(join(dir, 'builtin-mods', fileName), content, 'utf8');
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-builtin-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadAllBuiltinMods', () => {
  it('讀取多個合法檔', async () => {
    await writeEntry('foo.json', JSON.stringify(entry('foo')));
    await writeEntry('bar.json', JSON.stringify(entry('bar')));
    const { mods, issues } = await loadAllBuiltinMods(dir);
    expect(mods.map((m) => m.modId)).toEqual(['bar', 'foo']);
    expect(issues).toEqual([]);
  });

  it('檔名與 modId 不同時回報 error', async () => {
    await writeEntry('foo.json', JSON.stringify(entry('bar')));
    const { mods, issues } = await loadAllBuiltinMods(dir);
    expect(mods).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', modId: 'foo', file: 'builtin.json' });
    expect(issues[0]?.message).toContain('檔名須與 modId 相同');
  });

  it('JSON 解析失敗時回報 error', async () => {
    await writeEntry('foo.json', '{ nope');
    const { mods, issues } = await loadAllBuiltinMods(dir);
    expect(mods).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', modId: 'foo' });
    expect(issues[0]?.message).toContain('JSON 解析失敗');
  });

  it('schema 不符時回報 error', async () => {
    await writeEntry('foo.json', JSON.stringify({ ...entry('foo'), nameZh: '富' }));
    const { mods, issues } = await loadAllBuiltinMods(dir);
    expect(mods).toEqual([]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.level === 'error' && i.modId === 'foo')).toBe(true);
  });

  it('沒有 builtin-mods 資料夾時回傳空結果', async () => {
    expect(await loadAllBuiltinMods(dir)).toEqual({ mods: [], issues: [] });
  });
});
