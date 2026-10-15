import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFilesTogether } from './writeFiles';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mlf-write-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeFilesTogether', () => {
  it('writes every file and leaves no temp files', async () => {
    await writeFile(join(dir, 'a.json'), 'old', 'utf8');
    await writeFilesTogether([
      { path: join(dir, 'a.json'), content: 'A' },
      { path: join(dir, 'b.json'), content: 'B' },
    ]);
    expect(await readFile(join(dir, 'a.json'), 'utf8')).toBe('A');
    expect(await readFile(join(dir, 'b.json'), 'utf8')).toBe('B');
    expect((await readdir(dir)).sort()).toEqual(['a.json', 'b.json']);
  });

  it('leaves existing files untouched when a write fails', async () => {
    await writeFile(join(dir, 'a.json'), 'old', 'utf8');
    const write = writeFilesTogether([
      { path: join(dir, 'a.json'), content: 'A' },
      { path: join(dir, 'missing', 'b.json'), content: 'B' },
    ]);
    await expect(write).rejects.toThrow();
    expect(await readFile(join(dir, 'a.json'), 'utf8')).toBe('old');
    expect(await readdir(dir)).toEqual(['a.json']);
  });
});
